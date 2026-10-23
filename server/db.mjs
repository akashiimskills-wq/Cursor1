import { randomBytes, scryptSync } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  addDays,
  businessDaysInRange,
  businessToday,
  calculatePayslip,
  monthWorkingDates,
} from "./payroll.mjs";

const DEMO_PASSWORD = "marigold-demo";

let database;

export function openDatabase(path) {
  if (database) database.close();
  mkdirSync(dirname(path), { recursive: true });
  database = new DatabaseSync(path);
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
  `);
  migrate(database);
  seedIfEmpty(database);
  ensureSite(database);
  return database;
}

export function getDb() {
  if (!database) throw new Error("database is not open");
  return database;
}

export function closeDatabase() {
  if (database) database.close();
  database = undefined;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY,
      department_id INTEGER NOT NULL REFERENCES departments(id),
      title TEXT NOT NULL,
      grade TEXT NOT NULL,
      default_basic INTEGER NOT NULL,
      default_hra INTEGER NOT NULL,
      default_special INTEGER NOT NULL,
      default_conveyance INTEGER NOT NULL,
      default_medical INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL DEFAULT '',
      department_id INTEGER NOT NULL REFERENCES departments(id),
      position_id INTEGER NOT NULL REFERENCES positions(id),
      manager_id INTEGER REFERENCES employees(id),
      hire_date TEXT NOT NULL,
      exit_date TEXT,
      status TEXT NOT NULL CHECK (status IN ('active', 'on_leave', 'exited')),
      employment_type TEXT NOT NULL CHECK (employment_type IN ('full_time', 'contract')),
      city TEXT NOT NULL DEFAULT '',
      bank_name TEXT NOT NULL DEFAULT '',
      bank_last4 TEXT NOT NULL DEFAULT '',
      pan TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'employee')),
      employee_id INTEGER NOT NULL UNIQUE REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS compensation (
      employee_id INTEGER PRIMARY KEY REFERENCES employees(id),
      basic INTEGER NOT NULL,
      hra INTEGER NOT NULL,
      special_allowance INTEGER NOT NULL,
      conveyance INTEGER NOT NULL,
      medical INTEGER NOT NULL,
      effective_from TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS leave_types (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      annual_quota INTEGER,
      paid INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS leave_balances (
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      leave_type_id INTEGER NOT NULL REFERENCES leave_types(id),
      year INTEGER NOT NULL,
      allocated INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (employee_id, leave_type_id, year)
    );

    CREATE TABLE IF NOT EXISTS leave_requests (
      id INTEGER PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      leave_type_id INTEGER NOT NULL REFERENCES leave_types(id),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      days INTEGER NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
      reviewer_id INTEGER REFERENCES users(id),
      review_note TEXT NOT NULL DEFAULT '',
      reviewed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS attendance (
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      work_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'half_day', 'wfh', 'leave')),
      PRIMARY KEY (employee_id, work_date)
    );

    CREATE TABLE IF NOT EXISTS sites (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      radius_m INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS punches (
      id INTEGER PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      work_date TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('in', 'out')),
      punched_at TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      accuracy_m REAL,
      distance_m INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY,
      holiday_date TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payroll_runs (
      id INTEGER PRIMARY KEY,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'paid')),
      created_at TEXT NOT NULL,
      paid_at TEXT,
      UNIQUE (year, month)
    );

    CREATE TABLE IF NOT EXISTS payslips (
      id INTEGER PRIMARY KEY,
      payroll_run_id INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      working_days INTEGER NOT NULL,
      employed_days INTEGER NOT NULL,
      paid_half INTEGER NOT NULL,
      lop_half INTEGER NOT NULL,
      unmarked INTEGER NOT NULL,
      basic INTEGER NOT NULL,
      hra INTEGER NOT NULL,
      special_allowance INTEGER NOT NULL,
      conveyance INTEGER NOT NULL,
      medical INTEGER NOT NULL,
      contract_basic INTEGER NOT NULL,
      contract_hra INTEGER NOT NULL,
      contract_special INTEGER NOT NULL,
      contract_conveyance INTEGER NOT NULL,
      contract_medical INTEGER NOT NULL,
      gross_payable INTEGER NOT NULL,
      pf INTEGER NOT NULL,
      professional_tax INTEGER NOT NULL,
      tds INTEGER NOT NULL,
      net_pay INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      UNIQUE (payroll_run_id, employee_id)
    );
  `);
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return { salt, hash };
}

function ensureSite(db) {
  const existing = db.prepare("SELECT id FROM sites LIMIT 1").get();
  if (existing) return;
  db.prepare(
    "INSERT INTO sites (name, address, latitude, longitude, radius_m) VALUES (?, ?, ?, ?, ?)",
  ).run("Park Street studio", "18 Park Street, Kolkata 700016", 22.5531, 88.3517, 150);
}

function seedIfEmpty(db) {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM employees").get();
  if (existing.count > 0) return;

  const departments = ["Leadership", "People & Payroll", "Engineering", "Studio", "Client Partnerships"];
  const insertDepartment = db.prepare("INSERT INTO departments (name) VALUES (?)");
  const departmentIds = {};
  for (const name of departments) departmentIds[name] = Number(insertDepartment.run(name).lastInsertRowid);

  const insertPosition = db.prepare(`
    INSERT INTO positions (
      department_id, title, grade, default_basic, default_hra, default_special, default_conveyance, default_medical
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const position = (department, title, grade, basic, hra, special) =>
    Number(
      insertPosition.run(
        departmentIds[department],
        title,
        grade,
        basic,
        hra,
        special,
        1_600_00,
        1_250_00,
      ).lastInsertRowid,
    );

  const positions = {
    md: position("Leadership", "Managing Director", "head", 160_000_00, 64_000_00, 70_000_00),
    people: position("People & Payroll", "People Lead", "lead", 90_000_00, 36_000_00, 28_000_00),
    engLead: position("Engineering", "Engineering Lead", "lead", 110_000_00, 44_000_00, 36_000_00),
    senior: position("Engineering", "Senior Engineer", "mid", 62_000_00, 24_800_00, 16_000_00),
    engineer: position("Engineering", "Engineer", "associate", 32_000_00, 12_800_00, 7_000_00),
    designLead: position("Studio", "Design Lead", "lead", 85_000_00, 34_000_00, 24_000_00),
    designer: position("Studio", "Designer", "mid", 48_000_00, 19_200_00, 12_000_00),
    producer: position("Client Partnerships", "Producer", "mid", 52_000_00, 20_800_00, 14_000_00),
    partnerships: position("Client Partnerships", "Partnerships Lead", "lead", 80_000_00, 32_000_00, 22_000_00),
  };

  const insertEmployee = db.prepare(`
    INSERT INTO employees (
      code, first_name, last_name, email, phone, department_id, position_id, manager_id,
      hire_date, status, employment_type, city, bank_name, bank_last4, pan
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
  `);

  const people = [
    ["MRD-1001", "Devika", "Raman", "devika.raman@meridian.example", "+91 98300 11001", "Leadership", positions.md, null, "2016-06-01", "full_time", "Kolkata", "State Bank of India", "4412", "AEPPR1029K"],
    ["MRD-1008", "Priya", "Shah", "priya.shah@meridian.example", "+91 98300 11008", "People & Payroll", positions.people, null, "2019-04-01", "full_time", "Kolkata", "HDFC Bank", "8821", "BXSPS4418Q"],
    ["MRD-1014", "Arjun", "Mehta", "arjun.mehta@meridian.example", "+91 98300 11014", "Engineering", positions.engLead, null, "2020-01-15", "full_time", "Kolkata", "ICICI Bank", "2290", "CMHPM2204L"],
    ["MRD-1033", "Leela", "Nair", "leela.nair@meridian.example", "+91 98300 11033", "Engineering", positions.senior, null, "2022-07-11", "full_time", "Kolkata", "Axis Bank", "1044", "AHNPN8831D"],
    ["MRD-1041", "Kabir", "Das", "kabir.das@meridian.example", "+91 98300 11041", "Engineering", positions.engineer, null, "2024-02-01", "full_time", "Howrah", "State Bank of India", "7730", "CDEPD5520M"],
    ["MRD-1044", "Meher", "Qureshi", "meher.qureshi@meridian.example", "+91 98300 11044", "Engineering", positions.engineer, null, "2024-08-19", "full_time", "Kolkata", "HDFC Bank", "6618", "EFQPQ7712R"],
    ["MRD-1022", "Anika", "Bose", "anika.bose@meridian.example", "+91 98300 11022", "Studio", positions.designLead, null, "2021-03-08", "full_time", "Kolkata", "Kotak Mahindra", "3901", "BOSPA3390C"],
    ["MRD-1038", "Farhan", "Ali", "farhan.ali@meridian.example", "+91 98300 11038", "Studio", positions.designer, null, "2023-11-02", "full_time", "Kolkata", "Axis Bank", "5582", "ALIFA2208P"],
    ["MRD-1028", "Sana", "Iyer", "sana.iyer@meridian.example", "+91 98300 11028", "Client Partnerships", positions.producer, null, "2022-01-17", "full_time", "Salt Lake", "ICICI Bank", "9144", "IYERS6641B"],
    ["MRD-1019", "Neel", "Varma", "neel.varma@meridian.example", "+91 98300 11019", "Client Partnerships", positions.partnerships, null, "2021-09-06", "contract", "Kolkata", "HDFC Bank", "2706", "VARPN1184A"],
  ];

  const ids = {};
  for (const person of people) {
    const [code, first, last, email, phone, department, positionId, , hire, type, city, bank, last4, pan] = person;
    ids[email] = Number(
      insertEmployee.run(
        code,
        first,
        last,
        email,
        phone,
        departmentIds[department],
        positionId,
        null,
        hire,
        type,
        city,
        bank,
        last4,
        pan,
      ).lastInsertRowid,
    );
  }

  const setManager = db.prepare("UPDATE employees SET manager_id = ? WHERE id = ?");
  const devika = ids["devika.raman@meridian.example"];
  const arjun = ids["arjun.mehta@meridian.example"];
  const anika = ids["anika.bose@meridian.example"];
  for (const email of [
    "priya.shah@meridian.example",
    "arjun.mehta@meridian.example",
    "anika.bose@meridian.example",
    "sana.iyer@meridian.example",
    "neel.varma@meridian.example",
  ]) {
    setManager.run(devika, ids[email]);
  }
  setManager.run(arjun, ids["leela.nair@meridian.example"]);
  setManager.run(arjun, ids["kabir.das@meridian.example"]);
  setManager.run(arjun, ids["meher.qureshi@meridian.example"]);
  setManager.run(anika, ids["farhan.ali@meridian.example"]);

  const insertUser = db.prepare(`
    INSERT INTO users (email, password_hash, password_salt, role, employee_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  const accounts = [
    ["priya.shah@meridian.example", "admin"],
    ["arjun.mehta@meridian.example", "manager"],
    ["leela.nair@meridian.example", "employee"],
  ];
  for (const [email, role] of accounts) {
    const { salt, hash } = hashPassword(DEMO_PASSWORD);
    insertUser.run(email, hash, salt, role, ids[email]);
  }

  const compSource = db.prepare(`
    SELECT e.id AS employee_id, e.hire_date, p.default_basic, p.default_hra, p.default_special, p.default_conveyance, p.default_medical
    FROM employees e JOIN positions p ON p.id = e.position_id
  `);
  const insertComp = db.prepare(`
    INSERT INTO compensation (
      employee_id, basic, hra, special_allowance, conveyance, medical, effective_from
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of compSource.all()) {
    insertComp.run(
      row.employee_id,
      row.default_basic,
      row.default_hra,
      row.default_special,
      row.default_conveyance,
      row.default_medical,
      row.hire_date,
    );
  }

  const insertHoliday = db.prepare("INSERT INTO holidays (holiday_date, name) VALUES (?, ?)");
  const holidays = [
    ["2026-01-26", "Republic Day"],
    ["2026-03-03", "Holi"],
    ["2026-05-01", "Labour Day"],
    ["2026-08-15", "Independence Day"],
    ["2026-10-02", "Gandhi Jayanti"],
    ["2026-11-08", "Diwali"],
    ["2026-12-25", "Christmas"],
  ];
  for (const [date, name] of holidays) insertHoliday.run(date, name);

  const insertLeaveType = db.prepare(
    "INSERT INTO leave_types (name, annual_quota, paid) VALUES (?, ?, ?)",
  );
  const casual = Number(insertLeaveType.run("Casual", 8, 1).lastInsertRowid);
  const sick = Number(insertLeaveType.run("Sick", 8, 1).lastInsertRowid);
  const earned = Number(insertLeaveType.run("Earned", 18, 1).lastInsertRowid);
  const unpaid = Number(insertLeaveType.run("Unpaid", null, 0).lastInsertRowid);

  const insertBalance = db.prepare(`
    INSERT INTO leave_balances (employee_id, leave_type_id, year, allocated, used)
    VALUES (?, ?, 2026, ?, 0)
  `);
  for (const employeeId of Object.values(ids)) {
    insertBalance.run(employeeId, casual, 8);
    insertBalance.run(employeeId, sick, 8);
    insertBalance.run(employeeId, earned, 18);
    insertBalance.run(employeeId, unpaid, 0);
  }

  const holidayDates = holidays.map(([date]) => date);
  const today = businessToday();
  const insertAttendance = db.prepare(
    "INSERT INTO attendance (employee_id, work_date, status) VALUES (?, ?, ?)",
  );
  const markMonth = (year, month, overrides, through) => {
    const dates = monthWorkingDates(year, month, holidayDates, { through });
    for (const employeeId of Object.values(ids)) {
      for (const iso of dates) {
        const status = overrides[`${employeeId}:${iso}`] ?? "present";
        insertAttendance.run(employeeId, iso, status);
      }
    }
  };

  const leela = ids["leela.nair@meridian.example"];
  const kabir = ids["kabir.das@meridian.example"];
  const meher = ids["meher.qureshi@meridian.example"];
  const farhan = ids["farhan.ali@meridian.example"];
  markMonth(2026, 9, {
    [`${kabir}:2026-09-03`]: "absent",
    [`${kabir}:2026-09-04`]: "absent",
    [`${farhan}:2026-09-11`]: "half_day",
    [`${leela}:2026-09-08`]: "leave",
    [`${meher}:2026-09-16`]: "leave",
  });

  const octoberThrough = today < "2026-10-01" ? null : addDays(today, -1);
  if (octoberThrough && octoberThrough >= "2026-10-01") {
    const octoberOverrides = {};
    if (octoberThrough >= "2026-10-06") octoberOverrides[`${kabir}:2026-10-06`] = "absent";
    if (octoberThrough >= "2026-10-13") octoberOverrides[`${farhan}:2026-10-13`] = "half_day";
    markMonth(2026, 10, octoberOverrides, octoberThrough > "2026-10-31" ? null : octoberThrough);
  }

  const insertRequest = db.prepare(`
    INSERT INTO leave_requests (
      employee_id, leave_type_id, start_date, end_date, days, reason, status, review_note, reviewed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const useBalance = db.prepare(`
    UPDATE leave_balances SET used = used + ?
    WHERE employee_id = ? AND leave_type_id = ? AND year = 2026
  `);
  const approved = [
    [leela, sick, "2026-09-08", "2026-09-08", "Fever"],
    [meher, unpaid, "2026-09-16", "2026-09-16", "Family travel"],
  ];
  for (const [employeeId, typeId, start, end, reason] of approved) {
    const days = businessDaysInRange(start, end, holidayDates).length;
    insertRequest.run(employeeId, typeId, start, end, days, reason, "approved", "Recorded with September attendance", "2026-09-01T09:00:00.000Z");
    if (typeId !== unpaid) useBalance.run(days, employeeId, typeId);
  }

  const pendingStart = addDays(today, 10);
  const pendingEnd = addDays(today, 12);
  if (pendingStart.slice(0, 4) === pendingEnd.slice(0, 4)) {
    const pendingDays = businessDaysInRange(pendingStart, pendingEnd, holidayDates);
    if (pendingDays.length > 0) {
      insertRequest.run(
        leela,
        casual,
        pendingStart,
        pendingEnd,
        pendingDays.length,
        "Studio visit in Santiniketan",
        "pending",
        "",
        null,
      );
    }
  }

  const september = buildRun(db, 2026, 9, null);
  db.prepare("UPDATE payroll_runs SET status = 'paid', paid_at = ? WHERE id = ?").run(
    "2026-10-01T04:30:00.000Z",
    september.id,
  );
}

export function holidayDates(db) {
  return db.prepare("SELECT holiday_date FROM holidays ORDER BY holiday_date").all().map((row) => row.holiday_date);
}

export function structureFromRow(row) {
  return {
    basic: row.basic,
    hra: row.hra,
    specialAllowance: row.special_allowance,
    conveyance: row.conveyance,
    medical: row.medical,
  };
}

export function payslipInputFor(db, employee, year, month, asOf) {
  const { start, end } = bounds(year, month);
  const holidays = holidayDates(db);
  const attendance = {};
  for (const row of db
    .prepare(
      `SELECT work_date, status FROM attendance
       WHERE employee_id = ? AND work_date >= ? AND work_date <= ?`,
    )
    .all(employee.id, start, end)) {
    attendance[row.work_date] = row.status;
  }
  const requests = db
    .prepare(
      `SELECT r.start_date, r.end_date, t.paid
       FROM leave_requests r JOIN leave_types t ON t.id = r.leave_type_id
       WHERE r.employee_id = ? AND r.status = 'approved'
         AND r.start_date <= ? AND r.end_date >= ?`,
    )
    .all(employee.id, end, start);
  const unpaidLeaveDates = [];
  const paidLeaveDates = [];
  for (const request of requests) {
    const from = request.start_date > start ? request.start_date : start;
    const to = request.end_date < end ? request.end_date : end;
    const dates = businessDaysInRange(from, to, holidays);
    if (request.paid) paidLeaveDates.push(...dates);
    else unpaidLeaveDates.push(...dates);
  }
  const compensation = db.prepare("SELECT * FROM compensation WHERE employee_id = ?").get(employee.id);
  return {
    structure: structureFromRow(compensation),
    year,
    month,
    holidays,
    attendance,
    unpaidLeaveDates,
    paidLeaveDates,
    asOf,
    hireDate: employee.hire_date,
    exitDate: employee.exit_date,
  };
}

function bounds(year, month) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end };
}

export function employeesInPayroll(db, year, month) {
  const { start, end } = bounds(year, month);
  return db
    .prepare(
      `SELECT * FROM employees
       WHERE hire_date <= ?
         AND (exit_date IS NULL OR exit_date >= ?)
         AND NOT (status = 'exited' AND exit_date IS NULL)
       ORDER BY code`,
    )
    .all(end, start);
}

export function buildRun(db, year, month, asOf) {
  const createdAt = new Date().toISOString();
  const runId = Number(
    db.prepare("INSERT INTO payroll_runs (year, month, status, created_at) VALUES (?, ?, 'draft', ?)").run(
      year,
      month,
      createdAt,
    ).lastInsertRowid,
  );
  writePayslips(db, runId, year, month, asOf);
  return db.prepare("SELECT * FROM payroll_runs WHERE id = ?").get(runId);
}

export function writePayslips(db, runId, year, month, asOf) {
  db.prepare("DELETE FROM payslips WHERE payroll_run_id = ?").run(runId);
  const insert = db.prepare(`
    INSERT INTO payslips (
      payroll_run_id, employee_id, working_days, employed_days, paid_half, lop_half, unmarked,
      basic, hra, special_allowance, conveyance, medical,
      contract_basic, contract_hra, contract_special, contract_conveyance, contract_medical,
      gross_payable, pf, professional_tax, tds, net_pay, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const employee of employeesInPayroll(db, year, month)) {
    const slip = calculatePayslip(payslipInputFor(db, employee, year, month, asOf));
    const note =
      slip.unmarked > 0
        ? `${slip.unmarked} working day${slip.unmarked === 1 ? "" : "s"} had no attendance and counted as absence.`
        : "";
    insert.run(
      runId,
      employee.id,
      slip.workingDays,
      slip.employedDays,
      slip.paidHalf,
      slip.lopHalf,
      slip.unmarked,
      slip.earned.basic,
      slip.earned.hra,
      slip.earned.specialAllowance,
      slip.earned.conveyance,
      slip.earned.medical,
      slip.contract.basic,
      slip.contract.hra,
      slip.contract.specialAllowance,
      slip.contract.conveyance,
      slip.contract.medical,
      slip.grossPayable,
      slip.pf,
      slip.professionalTax,
      slip.tds,
      slip.netPay,
      note,
    );
  }
}

export { DEMO_PASSWORD };
