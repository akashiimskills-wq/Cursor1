import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { buildRun, employeesInPayroll, getDb, holidayDates, structureFromRow, writePayslips } from "./db.mjs";
import { distanceMetres } from "./geo.mjs";
import { addDays, businessDaysInRange, businessToday, isWeekend } from "./payroll.mjs";

export const COMPANY = {
  product: "Marigold",
  name: "Meridian Goods",
  legalName: "Meridian Goods Pvt Ltd",
  address: "18 Park Street, Kolkata 700016",
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function releaseEnv() {
  const value = String(process.env.HRMS_ENV || "development").toLowerCase();
  if (value === "staging" || value === "production") return value;
  return "development";
}

const STATUSES = new Set(["present", "absent", "half_day", "wfh", "leave"]);
const EMPLOYEE_STATUSES = new Set(["active", "on_leave", "exited"]);
const EMPLOYMENT_TYPES = new Set(["full_time", "contract"]);

export class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function handle({ method, path, query = {}, body = null, cookie = "" }) {
  try {
    if (body && body.__invalidJson) throw new HttpError(400, "Request body must be JSON.");
    const db = getDb();
    const user = userFromCookie(db, cookie);
    for (const route of routes) {
      if (route.method !== method) continue;
      const params = matchPath(route.path, path);
      if (!params) continue;
      return present(route.handler({ db, user, query, body, params }));
    }
    throw new HttpError(404, "Not found.");
  } catch (error) {
    if (error instanceof HttpError) return { status: error.status, json: { error: error.message, ...(error.details ?? {}) } };
    if (String(error.message).includes("UNIQUE")) {
      return { status: 409, json: { error: "That record already exists." } };
    }
    console.error(error);
    return { status: 500, json: { error: "Internal error." } };
  }
}

function present(payload) {
  const setCookie = payload?.__cookie;
  const clearCookie = Boolean(payload?.__clearCookie);
  const csv = payload?.__csv;
  const filename = payload?.__filename;
  if (payload && typeof payload === "object") {
    delete payload.__cookie;
    delete payload.__clearCookie;
    delete payload.__csv;
    delete payload.__filename;
  }
  if (csv != null) return { status: 200, csv, filename, setCookie, clearCookie };
  return { status: 200, json: payload, setCookie, clearCookie };
}

function matchPath(pattern, path) {
  if (typeof pattern === "string") return pattern === path ? {} : null;
  const match = pattern.exec(path);
  if (!match) return null;
  return { id: Number(match[1]) };
}

function requireUser(user) {
  if (!user) throw new HttpError(401, "Sign in required.");
  return user;
}

function requireAdmin(user) {
  const current = requireUser(user);
  if (current.role !== "admin") throw new HttpError(403, "Only People & Payroll can do that.");
  return current;
}

const routes = [
  { method: "GET", path: "/api/health", handler: () => ({ ok: true, product: COMPANY.product, env: releaseEnv() }) },
  { method: "POST", path: "/api/login", handler: login },
  { method: "POST", path: "/api/logout", handler: logout },
  { method: "GET", path: "/api/me", handler: me },
  { method: "GET", path: "/api/dashboard", handler: dashboard },
  { method: "GET", path: "/api/departments", handler: departments },
  { method: "GET", path: "/api/positions", handler: positions },
  { method: "GET", path: "/api/employees", handler: listEmployees },
  { method: "POST", path: "/api/employees", handler: createEmployee },
  { method: "GET", path: /^\/api\/employees\/(\d+)$/, handler: getEmployee },
  { method: "PATCH", path: /^\/api\/employees\/(\d+)$/, handler: patchEmployee },
  { method: "PUT", path: /^\/api\/employees\/(\d+)\/compensation$/, handler: putCompensation },
  { method: "GET", path: "/api/attendance", handler: getAttendance },
  { method: "GET", path: "/api/attendance/punch", handler: getPunch },
  { method: "POST", path: "/api/attendance/punch", handler: postPunch },
  { method: "PUT", path: "/api/attendance", handler: putAttendance },
  { method: "GET", path: "/api/leave/meta", handler: leaveMeta },
  { method: "GET", path: "/api/leave/requests", handler: listLeave },
  { method: "POST", path: "/api/leave/requests", handler: createLeave },
  { method: "POST", path: /^\/api\/leave\/requests\/(\d+)\/decision$/, handler: decideLeave },
  { method: "GET", path: "/api/holidays", handler: listHolidays },
  { method: "POST", path: "/api/holidays", handler: createHoliday },
  { method: "DELETE", path: /^\/api\/holidays\/(\d+)$/, handler: deleteHoliday },
  { method: "GET", path: "/api/payroll/runs", handler: listRuns },
  { method: "POST", path: "/api/payroll/runs", handler: createRun },
  { method: "GET", path: /^\/api\/payroll\/runs\/(\d+)\/register\.csv$/, handler: exportRun },
  { method: "GET", path: /^\/api\/payroll\/runs\/(\d+)$/, handler: getRun },
  { method: "POST", path: /^\/api\/payroll\/runs\/(\d+)\/recalculate$/, handler: recalculateRun },
  { method: "POST", path: /^\/api\/payroll\/runs\/(\d+)\/approve$/, handler: approveRun },
  { method: "POST", path: /^\/api\/payroll\/runs\/(\d+)\/pay$/, handler: payRun },
  { method: "GET", path: /^\/api\/payslips\/(\d+)$/, handler: getPayslip },
];

function login({ db, body }) {
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!row || !verifyPassword(password, row.password_salt, row.password_hash)) {
    throw new HttpError(401, "Those credentials do not match a Marigold account.");
  }
  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").run(
    token,
    row.id,
    new Date().toISOString(),
  );
  const user = userFromCookie(db, `marigold=${token}`);
  return { ...mePayload(user), __cookie: sessionCookie(token) };
}

function logout({ db, user, cookie }) {
  requireUser(user);
  const token = readCookie(cookie, "marigold");
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  return { ok: true, __clearCookie: true };
}

function me({ user }) {
  requireUser(user);
  return mePayload(user);
}

function mePayload(user) {
  return {
    user: publicUser(user),
    company: COMPANY,
    today: businessToday(),
    env: releaseEnv(),
  };
}

function dashboard({ db, user }) {
  requireUser(user);
  const today = businessToday();
  const headcount = db.prepare("SELECT COUNT(*) AS count FROM employees WHERE status != 'exited'").get().count;
  const byDepartment = db
    .prepare(
      `SELECT d.name AS department, COUNT(*) AS count
       FROM employees e JOIN departments d ON d.id = e.department_id
       WHERE e.status != 'exited'
       GROUP BY d.id ORDER BY d.name`,
    )
    .all();
  const holiday = db.prepare("SELECT name FROM holidays WHERE holiday_date = ?").get(today);
  const workingDay = !isWeekend(today) && !holiday;
  const activeIds = db.prepare("SELECT id FROM employees WHERE status = 'active'").all().map((row) => row.id);
  const marked = db
    .prepare("SELECT employee_id, status FROM attendance WHERE work_date = ?")
    .all(today);
  const markedIds = new Set(marked.map((row) => row.employee_id));
  const present = marked.filter((row) => ["present", "wfh", "half_day", "leave"].includes(row.status)).length;
  const absent = marked.filter((row) => row.status === "absent").length;
  const unmarked = workingDay ? activeIds.filter((id) => !markedIds.has(id)).length : 0;
  const pendingLeave = db.prepare("SELECT COUNT(*) AS count FROM leave_requests WHERE status = 'pending'").get().count;
  const minePending = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM leave_requests r JOIN employees e ON e.id = r.employee_id
       WHERE r.status = 'pending' AND (e.manager_id = ? OR ? = 'admin')`,
    )
    .get(user.employee_id, user.role).count;
  const latest = db.prepare("SELECT * FROM payroll_runs ORDER BY year DESC, month DESC LIMIT 1").get();
  const latestTotals =
    user.role === "admin" && latest
      ? db
          .prepare(
            `SELECT COUNT(*) AS people, COALESCE(SUM(gross_payable), 0) AS gross, COALESCE(SUM(net_pay), 0) AS net
             FROM payslips WHERE payroll_run_id = ?`,
          )
          .get(latest.id)
      : null;
  const ownSlip = db
    .prepare(
      `SELECT p.id, r.year, r.month, r.status, p.net_pay AS net
       FROM payslips p JOIN payroll_runs r ON r.id = p.payroll_run_id
       WHERE p.employee_id = ?
       ORDER BY r.year DESC, r.month DESC LIMIT 1`,
    )
    .get(user.employee_id);
  const month = today.slice(5, 7);
  const anniversaries = db
    .prepare(
      `SELECT id, first_name, last_name, code, hire_date
       FROM employees
       WHERE status != 'exited' AND substr(hire_date, 6, 2) = ?
       ORDER BY substr(hire_date, 9, 2)`,
    )
    .all(month);
  const upcoming = db
    .prepare("SELECT id, holiday_date AS date, name FROM holidays WHERE holiday_date >= ? ORDER BY holiday_date LIMIT 4")
    .all(today);
  return {
    today,
    workingDay,
    holidayName: holiday?.name ?? null,
    headcount,
    byDepartment,
    present,
    absent,
    unmarked,
    pendingLeave: user.role === "employee" ? 0 : pendingLeave,
    approvalsWaiting: user.role === "employee" ? 0 : minePending,
    payroll:
      user.role === "admin" && latest
        ? {
            id: latest.id,
            year: latest.year,
            month: latest.month,
            status: latest.status,
            people: latestTotals.people,
            gross: latestTotals.gross,
            net: latestTotals.net,
          }
        : null,
    ownPay: ownSlip
      ? { id: ownSlip.id, year: ownSlip.year, month: ownSlip.month, status: ownSlip.status, net: ownSlip.net }
      : null,
    anniversaries: anniversaries.map((row) => ({
      id: row.id,
      name: `${row.first_name} ${row.last_name}`,
      code: row.code,
      hireDate: row.hire_date,
      years: Number(today.slice(0, 4)) - Number(row.hire_date.slice(0, 4)),
    })),
    upcomingHolidays: upcoming,
    checkedIn: checkedInToday(db, today),
    week: weekSeries(db, today, activeIds.length),
    activity: recentActivity(db, user),
    pipeline:
      user.role === "admin" && latest
        ? { status: latest.status, year: latest.year, month: latest.month }
        : null,
  };
}

function checkedInToday(db, today) {
  return db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM punches p
       WHERE p.work_date = ? AND p.action = 'in'
         AND NOT EXISTS (
           SELECT 1 FROM punches o
           WHERE o.employee_id = p.employee_id AND o.work_date = p.work_date AND o.action = 'out'
         )`,
    )
    .get(today).count;
}

function weekSeries(db, today, activeCount) {
  const dates = [];
  for (let offset = 6; offset >= 0; offset -= 1) dates.push(addDays(today, -offset));
  const rows = db
    .prepare(
      `SELECT work_date, status, COUNT(*) AS count
       FROM attendance
       WHERE work_date >= ? AND work_date <= ?
       GROUP BY work_date, status`,
    )
    .all(dates[0], today);
  const holidays = new Map(
    db
      .prepare("SELECT holiday_date, name FROM holidays WHERE holiday_date >= ? AND holiday_date <= ?")
      .all(dates[0], today)
      .map((row) => [row.holiday_date, row.name]),
  );
  const byDate = new Map();
  for (const row of rows) {
    if (!byDate.has(row.work_date)) byDate.set(row.work_date, {});
    byDate.get(row.work_date)[row.status] = row.count;
  }
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return dates.map((date) => {
    const counts = byDate.get(date) ?? {};
    const holidayName = holidays.get(date) ?? null;
    const closed = isWeekend(date) || Boolean(holidayName);
    const marked = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const [year, month, day] = date.split("-").map(Number);
    return {
      date,
      label: labels[new Date(Date.UTC(year, month - 1, day)).getUTCDay()],
      present: (counts.present ?? 0) + (counts.wfh ?? 0) + (counts.half_day ?? 0) + (counts.leave ?? 0),
      absent: counts.absent ?? 0,
      unmarked: closed ? 0 : Math.max(0, activeCount - marked),
      closed,
      holidayName,
    };
  });
}

function recentActivity(db, user) {
  const items = [];
  for (const row of db
    .prepare(
      `SELECT p.punched_at AS at, p.action, p.distance_m, e.first_name, e.last_name, e.code
       FROM punches p JOIN employees e ON e.id = p.employee_id
       ORDER BY p.punched_at DESC LIMIT 5`,
    )
    .all()) {
    items.push({
      at: row.at,
      kind: "punch",
      title: `${row.first_name} ${row.last_name} checked ${row.action === "in" ? "in" : "out"}`,
      detail: `${row.code} · ${row.distance_m} m from the studio`,
    });
  }

  const leaveParams = [];
  let leaveWhere = "";
  if (user.role === "employee") {
    leaveWhere = "WHERE r.employee_id = ?";
    leaveParams.push(user.employee_id);
  } else if (user.role === "manager") {
    leaveWhere = "WHERE r.employee_id = ? OR e.manager_id = ?";
    leaveParams.push(user.employee_id, user.employee_id);
  }
  for (const row of db
    .prepare(
      `SELECT r.status, r.start_date, r.end_date, r.reviewed_at, r.days, e.first_name, e.last_name, t.name AS leave_type
       FROM leave_requests r
       JOIN employees e ON e.id = r.employee_id
       JOIN leave_types t ON t.id = r.leave_type_id
       ${leaveWhere}
       ORDER BY COALESCE(r.reviewed_at, r.start_date) DESC, r.id DESC
       LIMIT 5`,
    )
    .all(...leaveParams)) {
    items.push({
      at: row.reviewed_at || `${row.start_date}T00:00:00.000Z`,
      kind: "leave",
      title: `${row.first_name} ${row.last_name} · ${row.leave_type} ${row.status}`,
      detail: `${row.start_date} to ${row.end_date} · ${row.days} day${row.days === 1 ? "" : "s"}`,
    });
  }

  if (user.role === "admin") {
    for (const row of db.prepare("SELECT year, month, status, created_at, paid_at FROM payroll_runs ORDER BY year DESC, month DESC LIMIT 2").all()) {
      items.push({
        at: row.paid_at || row.created_at,
        kind: "payroll",
        title: `${MONTHS[row.month - 1]} ${row.year} payroll is ${row.status}`,
        detail: row.status === "paid" ? "Salaries marked paid" : "Waiting on the payroll desk",
      });
    }
  }

  return items.sort((left, right) => String(right.at).localeCompare(String(left.at))).slice(0, 8);
}

function departments({ db, user }) {
  requireUser(user);
  return {
    departments: db.prepare("SELECT id, name FROM departments ORDER BY name").all(),
  };
}

function positions({ db, user }) {
  requireUser(user);
  return {
    positions: db
      .prepare(
        `SELECT p.id, p.department_id AS departmentId, d.name AS department, p.title, p.grade
         FROM positions p JOIN departments d ON d.id = p.department_id
         ORDER BY d.name, p.title`,
      )
      .all(),
  };
}

function listEmployees({ db, user, query }) {
  requireUser(user);
  const filters = ["1 = 1"];
  const params = [];
  if (query.q) {
    const term = `%${String(query.q).trim().toLowerCase().replace(/[\\%_]/g, "")}%`;
    filters.push(
      "(lower(e.first_name || ' ' || e.last_name) LIKE ? OR lower(e.email) LIKE ? OR lower(e.code) LIKE ?)",
    );
    params.push(term, term, term);
  }
  if (query.departmentId) {
    filters.push("e.department_id = ?");
    params.push(Number(query.departmentId));
  }
  if (query.status) {
    filters.push("e.status = ?");
    params.push(query.status);
  }
  const rows = db.prepare(`${employeeSelect()} WHERE ${filters.join(" AND ")} ORDER BY e.code`).all(...params);
  return { employees: rows.map((row) => publicEmployee(row, user)) };
}

function createEmployee({ db, user, body }) {
  requireAdmin(user);
  const input = readEmployeeInput(db, body, true);
  const code = nextCode(db);
  const result = db
    .prepare(
      `INSERT INTO employees (
        code, first_name, last_name, email, phone, department_id, position_id, manager_id,
        hire_date, status, employment_type, city, bank_name, bank_last4, pan
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      code,
      input.firstName,
      input.lastName,
      input.email,
      input.phone,
      input.departmentId,
      input.positionId,
      input.managerId,
      input.hireDate,
      input.status,
      input.employmentType,
      input.city,
      input.bankName,
      input.bankLast4,
      input.pan,
    );
  const employeeId = Number(result.lastInsertRowid);
  const position = db.prepare("SELECT * FROM positions WHERE id = ?").get(input.positionId);
  db.prepare(
    `INSERT INTO compensation (
      employee_id, basic, hra, special_allowance, conveyance, medical, effective_from
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    employeeId,
    position.default_basic,
    position.default_hra,
    position.default_special,
    position.default_conveyance,
    position.default_medical,
    input.hireDate,
  );
  const year = Number(input.hireDate.slice(0, 4));
  const insertBalance = db.prepare(
    "INSERT INTO leave_balances (employee_id, leave_type_id, year, allocated, used) VALUES (?, ?, ?, ?, 0)",
  );
  for (const type of db.prepare("SELECT * FROM leave_types").all()) {
    insertBalance.run(employeeId, type.id, year, type.paid ? type.annual_quota : 0);
  }
  let createdLogin = false;
  if (body?.createLogin) {
    const { salt, hash } = hashPassword("marigold-demo");
    db.prepare(
      "INSERT INTO users (email, password_hash, password_salt, role, employee_id) VALUES (?, ?, ?, 'employee', ?)",
    ).run(input.email, hash, salt, employeeId);
    createdLogin = true;
  }
  return { employee: employeeById(db, employeeId, user), createdLogin, temporaryPassword: createdLogin ? "marigold-demo" : null };
}

function getEmployee({ db, user, params }) {
  requireUser(user);
  const employee = employeeById(db, params.id, user);
  if (!employee) throw new HttpError(404, "Employee not found.");
  const reports = db
    .prepare(
      `SELECT id, code, first_name, last_name FROM employees WHERE manager_id = ? AND status != 'exited' ORDER BY code`,
    )
    .all(params.id)
    .map((row) => ({ id: row.id, code: row.code, name: `${row.first_name} ${row.last_name}` }));
  const canSeePay = user.role === "admin" || user.employee_id === params.id;
  const canSeeLeave = canSeePay || user.role === "manager";
  const year = Number(businessToday().slice(0, 4));
  const balances = canSeeLeave
    ? db
        .prepare(
          `SELECT t.id, t.name, t.paid, b.allocated, b.used
           FROM leave_balances b JOIN leave_types t ON t.id = b.leave_type_id
           WHERE b.employee_id = ? AND b.year = ?
           ORDER BY t.id`,
        )
        .all(params.id, year)
    : [];
  const compensation = canSeePay
    ? mapCompensation(db.prepare("SELECT * FROM compensation WHERE employee_id = ?").get(params.id))
    : null;
  const payslips = canSeePay
    ? db
        .prepare(
          `SELECT p.id, r.year, r.month, r.status, p.net_pay AS netPay, p.gross_payable AS grossPayable
           FROM payslips p JOIN payroll_runs r ON r.id = p.payroll_run_id
           WHERE p.employee_id = ?
           ORDER BY r.year DESC, r.month DESC LIMIT 12`,
        )
        .all(params.id)
    : [];
  return { employee, reports, balances, compensation, payslips };
}

function patchEmployee({ db, user, params, body }) {
  requireAdmin(user);
  const existing = db.prepare("SELECT * FROM employees WHERE id = ?").get(params.id);
  if (!existing) throw new HttpError(404, "Employee not found.");
  const input = readEmployeeInput(db, { ...rowToInput(existing), ...body }, false);
  if (input.managerId === params.id) throw new HttpError(400, "A person cannot manage themselves.");
  db.prepare(
    `UPDATE employees SET
      first_name = ?, last_name = ?, email = ?, phone = ?, department_id = ?, position_id = ?,
      manager_id = ?, hire_date = ?, exit_date = ?, status = ?, employment_type = ?, city = ?,
      bank_name = ?, bank_last4 = ?, pan = ?
     WHERE id = ?`,
  ).run(
    input.firstName,
    input.lastName,
    input.email,
    input.phone,
    input.departmentId,
    input.positionId,
    input.managerId,
    input.hireDate,
    input.exitDate,
    input.status,
    input.employmentType,
    input.city,
    input.bankName,
    input.bankLast4,
    input.pan,
    params.id,
  );
  return { employee: employeeById(db, params.id, user) };
}

function putCompensation({ db, user, params, body }) {
  requireAdmin(user);
  const employee = db.prepare("SELECT id FROM employees WHERE id = ?").get(params.id);
  if (!employee) throw new HttpError(404, "Employee not found.");
  const amounts = {
    basic: rupeesField(body, "basic"),
    hra: rupeesField(body, "hra"),
    special: rupeesField(body, "specialAllowance"),
    conveyance: rupeesField(body, "conveyance"),
    medical: rupeesField(body, "medical"),
  };
  const effectiveFrom = String(body?.effectiveFrom ?? businessToday());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) throw new HttpError(400, "Effective date must be YYYY-MM-DD.");
  db.prepare(
    `INSERT INTO compensation (
      employee_id, basic, hra, special_allowance, conveyance, medical, effective_from
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(employee_id) DO UPDATE SET
      basic = excluded.basic,
      hra = excluded.hra,
      special_allowance = excluded.special_allowance,
      conveyance = excluded.conveyance,
      medical = excluded.medical,
      effective_from = excluded.effective_from`,
  ).run(params.id, amounts.basic, amounts.hra, amounts.special, amounts.conveyance, amounts.medical, effectiveFrom);
  return { compensation: mapCompensation(db.prepare("SELECT * FROM compensation WHERE employee_id = ?").get(params.id)) };
}

function getAttendance({ db, user, query }) {
  requireUser(user);
  const date = query.date || businessToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "Date must be YYYY-MM-DD.");
  const holiday = db.prepare("SELECT name FROM holidays WHERE holiday_date = ?").get(date);
  const rows = db.prepare(`${employeeSelect()} WHERE e.status = 'active' ORDER BY e.code`).all();
  const marks = new Map(
    db.prepare("SELECT employee_id, status FROM attendance WHERE work_date = ?").all(date).map((row) => [row.employee_id, row.status]),
  );
  const punches = new Map();
  for (const row of db.prepare("SELECT employee_id, action, punched_at, distance_m FROM punches WHERE work_date = ? ORDER BY id").all(date)) {
    const current = punches.get(row.employee_id) ?? { checkIn: null, checkOut: null };
    const point = { at: row.punched_at, distanceM: row.distance_m };
    if (row.action === "in") current.checkIn = point;
    if (row.action === "out") current.checkOut = point;
    punches.set(row.employee_id, current);
  }
  const entries = rows
    .filter((row) => user.role !== "employee" || row.id === user.employee_id)
    .map((row) => {
      const punch = punches.get(row.id) ?? { checkIn: null, checkOut: null };
      return { employee: publicEmployee(row, user), status: marks.get(row.id) ?? null, ...punch };
    });
  return { date, workingDay: !isWeekend(date) && !holiday, holidayName: holiday?.name ?? null, entries };
}

function getPunch({ db, user }) {
  requireUser(user);
  return punchState(db, user);
}

function postPunch({ db, user, body }) {
  const current = requireUser(user);
  const action = body?.action;
  if (action !== "in" && action !== "out") throw new HttpError(400, "Punch must be in or out.");
  const employee = db.prepare("SELECT id, status FROM employees WHERE id = ?").get(current.employee_id);
  if (!employee || employee.status !== "active") throw new HttpError(403, "Only an active person can punch.");
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new HttpError(400, "A latitude and longitude are required.");
  }
  const accuracy = body?.accuracy == null || body.accuracy === "" ? null : Number(body.accuracy);
  if (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0)) throw new HttpError(400, "Accuracy must be a positive number of metres.");
  const site = siteRow(db);
  if (accuracy != null && accuracy > site.radiusM) {
    throw new HttpError(400, `This location fix is ${Math.round(accuracy)} m wide, broader than the ${site.radiusM} m studio fence.`);
  }
  const today = businessToday();
  const existing = db.prepare("SELECT action FROM punches WHERE employee_id = ? AND work_date = ?").all(current.employee_id, today);
  const checkedIn = existing.some((row) => row.action === "in");
  const checkedOut = existing.some((row) => row.action === "out");
  if (action === "out" && !checkedIn) throw new HttpError(409, "Check in before checking out.");
  if (action === "in" && checkedIn) throw new HttpError(409, "You are already checked in today.");
  if (action === "out" && checkedOut) throw new HttpError(409, "You are already checked out today.");
  const attendance = db.prepare("SELECT status FROM attendance WHERE employee_id = ? AND work_date = ?").get(current.employee_id, today);
  if (action === "in" && attendance?.status === "leave") {
    throw new HttpError(409, "Leave is already on the register for today.");
  }
  const distanceM = distanceMetres(site.latitude, site.longitude, latitude, longitude);
  const waived = attendance?.status === "wfh";
  if (!waived && distanceM > site.radiusM) {
    throw new HttpError(400, `You are ${formatDistance(distanceM)} from ${site.name}. Punches are accepted within ${site.radiusM} m.`, {
      distanceM,
      radiusM: site.radiusM,
    });
  }
  const punchedAt = new Date().toISOString();
  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO punches (employee_id, work_date, action, punched_at, latitude, longitude, accuracy_m, distance_m)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(current.employee_id, today, action, punchedAt, latitude, longitude, accuracy, distanceM);
    if (action === "in" && attendance?.status !== "wfh" && attendance?.status !== "half_day") {
      db.prepare(
        `INSERT INTO attendance (employee_id, work_date, status) VALUES (?, ?, 'present')
         ON CONFLICT(employee_id, work_date) DO UPDATE SET status = 'present'`,
      ).run(current.employee_id, today);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return punchState(db, current);
}

function punchState(db, user) {
  const today = businessToday();
  const site = siteRow(db);
  const rows = db
    .prepare(
      `SELECT action, punched_at AS at, distance_m AS distanceM
       FROM punches WHERE employee_id = ? AND work_date = ? ORDER BY id`,
    )
    .all(user.employee_id, today);
  const attendance = db.prepare("SELECT status FROM attendance WHERE employee_id = ? AND work_date = ?").get(user.employee_id, today);
  return {
    site,
    today,
    status: attendance?.status ?? null,
    checkIn: rows.find((row) => row.action === "in") ?? null,
    checkOut: rows.find((row) => row.action === "out") ?? null,
  };
}

function siteRow(db) {
  const site = db
    .prepare("SELECT name, address, latitude, longitude, radius_m AS radiusM FROM sites ORDER BY id LIMIT 1")
    .get();
  if (!site) throw new HttpError(500, "No studio fence is configured.");
  return site;
}

function formatDistance(metres) {
  if (metres < 1000) return `${metres} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

function putAttendance({ db, user, body }) {
  requireUser(user);
  const date = String(body?.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "Date must be YYYY-MM-DD.");
  const entries = Array.isArray(body?.entries) ? body.entries : null;
  if (!entries) throw new HttpError(400, "Entries are required.");
  if (user.role === "employee") {
    if (date !== businessToday()) throw new HttpError(403, "You can only mark today.");
    if (entries.length !== 1 || Number(entries[0].employeeId) !== user.employee_id) {
      throw new HttpError(403, "You can only mark your own attendance.");
    }
  } else if (user.role !== "admin") {
    throw new HttpError(403, "Only People & Payroll can mark the register.");
  }
  const upsert = db.prepare(
    `INSERT INTO attendance (employee_id, work_date, status) VALUES (?, ?, ?)
     ON CONFLICT(employee_id, work_date) DO UPDATE SET status = excluded.status`,
  );
  db.exec("BEGIN");
  try {
    for (const entry of entries) {
      const status = entry.status;
      if (!STATUSES.has(status)) throw new HttpError(400, "Unknown attendance status.");
      const employee = db.prepare("SELECT id FROM employees WHERE id = ?").get(Number(entry.employeeId));
      if (!employee) throw new HttpError(400, "Unknown employee in the register.");
      upsert.run(employee.id, date, status);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getAttendance({ db, user, query: { date } });
}

function leaveMeta({ db, user }) {
  const current = requireUser(user);
  const year = Number(businessToday().slice(0, 4));
  const types = db.prepare("SELECT id, name, annual_quota AS annualQuota, paid FROM leave_types ORDER BY id").all();
  const balances = db
    .prepare(
      `SELECT b.leave_type_id AS leaveTypeId, t.name, t.paid, b.allocated, b.used
       FROM leave_balances b JOIN leave_types t ON t.id = b.leave_type_id
       WHERE b.employee_id = ? AND b.year = ?
       ORDER BY t.id`,
    )
    .all(current.employee_id, year);
  return { types, balances, year };
}

function listLeave({ db, user, query }) {
  const current = requireUser(user);
  const scope = query.scope || (current.role === "employee" ? "mine" : "queue");
  let sql = `${leaveSelect()} WHERE 1 = 1`;
  const params = [];
  if (scope === "mine") {
    sql += " AND r.employee_id = ?";
    params.push(current.employee_id);
  } else if (scope === "queue") {
    if (current.role === "employee") throw new HttpError(403, "You do not approve leave.");
    sql += " AND r.status = 'pending'";
    if (current.role === "manager") {
      sql += " AND e.manager_id = ?";
      params.push(current.employee_id);
    }
  } else if (scope === "all") {
    if (current.role !== "admin") throw new HttpError(403, "Only People & Payroll can view every request.");
  } else {
    throw new HttpError(400, "Unknown leave scope.");
  }
  sql += " ORDER BY r.status = 'pending' DESC, r.start_date DESC";
  return { requests: db.prepare(sql).all(...params).map(publicLeave) };
}

function createLeave({ db, user, body }) {
  const current = requireUser(user);
  const leaveTypeId = Number(body?.leaveTypeId);
  const start = String(body?.startDate ?? "");
  const end = String(body?.endDate ?? "");
  const reason = String(body?.reason ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    throw new HttpError(400, "Choose a start and end date.");
  }
  if (end < start) throw new HttpError(400, "The end date is before the start date.");
  if (start.slice(0, 4) !== end.slice(0, 4)) throw new HttpError(400, "A request cannot cross into another calendar year.");
  if (reason.length < 3) throw new HttpError(400, "Add a short reason.");
  const type = db.prepare("SELECT * FROM leave_types WHERE id = ?").get(leaveTypeId);
  if (!type) throw new HttpError(400, "Unknown leave type.");
  const dates = businessDaysInRange(start, end, holidayDates(db));
  if (dates.length === 0) throw new HttpError(400, "That range has no working days.");
  const overlap = db
    .prepare(
      `SELECT id FROM leave_requests
       WHERE employee_id = ? AND status IN ('pending', 'approved') AND start_date <= ? AND end_date >= ?`,
    )
    .get(current.employee_id, end, start);
  if (overlap) throw new HttpError(409, "Those dates overlap a request that is already pending or approved.");
  if (type.paid) {
    const balance = db
      .prepare(
        "SELECT allocated, used FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?",
      )
      .get(current.employee_id, type.id, Number(start.slice(0, 4)));
    const remaining = (balance?.allocated ?? 0) - (balance?.used ?? 0);
    if (dates.length > remaining) {
      throw new HttpError(409, `Only ${remaining} ${type.name.toLowerCase()} day${remaining === 1 ? "" : "s"} left.`);
    }
  }
  const id = Number(
    db
      .prepare(
        `INSERT INTO leave_requests (
          employee_id, leave_type_id, start_date, end_date, days, reason, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      )
      .run(current.employee_id, type.id, start, end, dates.length, reason).lastInsertRowid,
  );
  return { request: publicLeave(db.prepare(`${leaveSelect()} WHERE r.id = ?`).get(id)) };
}

function decideLeave({ db, user, params, body }) {
  const current = requireUser(user);
  if (current.role === "employee") throw new HttpError(403, "You do not approve leave.");
  const decision = body?.decision;
  if (decision !== "approve" && decision !== "reject") throw new HttpError(400, "Decision must be approve or reject.");
  const note = String(body?.note ?? "").trim();
  const request = db
    .prepare(
      `SELECT r.*, e.manager_id, t.paid, t.name AS type_name
       FROM leave_requests r
       JOIN employees e ON e.id = r.employee_id
       JOIN leave_types t ON t.id = r.leave_type_id
       WHERE r.id = ?`,
    )
    .get(params.id);
  if (!request) throw new HttpError(404, "Leave request not found.");
  if (request.status !== "pending") throw new HttpError(409, "That request is no longer pending.");
  if (current.role === "manager" && request.manager_id !== current.employee_id) {
    throw new HttpError(403, "You can approve leave only for your own team.");
  }
  if (request.employee_id === current.employee_id && current.role !== "admin") {
    throw new HttpError(403, "Ask People & Payroll to review your own request.");
  }
  db.exec("BEGIN");
  try {
    if (decision === "approve" && request.paid) {
      const balance = db
        .prepare(
          "SELECT allocated, used FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?",
        )
        .get(request.employee_id, request.leave_type_id, Number(request.start_date.slice(0, 4)));
      if (!balance || balance.used + request.days > balance.allocated) {
        throw new HttpError(409, `Not enough ${request.type_name.toLowerCase()} balance to approve this.`);
      }
      db.prepare(
        "UPDATE leave_balances SET used = used + ? WHERE employee_id = ? AND leave_type_id = ? AND year = ?",
      ).run(request.days, request.employee_id, request.leave_type_id, Number(request.start_date.slice(0, 4)));
    }
    db.prepare(
      `UPDATE leave_requests
       SET status = ?, reviewer_id = ?, review_note = ?, reviewed_at = ?
       WHERE id = ?`,
    ).run(decision === "approve" ? "approved" : "rejected", current.id, note, new Date().toISOString(), request.id);
    if (decision === "approve") {
      const dates = businessDaysInRange(request.start_date, request.end_date, holidayDates(db));
      const upsert = db.prepare(
        `INSERT INTO attendance (employee_id, work_date, status) VALUES (?, ?, 'leave')
         ON CONFLICT(employee_id, work_date) DO UPDATE SET status = 'leave'`,
      );
      for (const iso of dates) upsert.run(request.employee_id, iso);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { request: publicLeave(db.prepare(`${leaveSelect()} WHERE r.id = ?`).get(request.id)) };
}

function listHolidays({ db, user, query }) {
  requireUser(user);
  const year = query.year ? Number(query.year) : Number(businessToday().slice(0, 4));
  return {
    year,
    holidays: db
      .prepare(
        `SELECT id, holiday_date AS date, name FROM holidays
         WHERE holiday_date >= ? AND holiday_date <= ?
         ORDER BY holiday_date`,
      )
      .all(`${year}-01-01`, `${year}-12-31`),
  };
}

function createHoliday({ db, user, body }) {
  requireAdmin(user);
  const date = String(body?.date ?? "");
  const name = String(body?.name ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "Date must be YYYY-MM-DD.");
  if (name.length < 2) throw new HttpError(400, "Name the holiday.");
  const id = Number(db.prepare("INSERT INTO holidays (holiday_date, name) VALUES (?, ?)").run(date, name).lastInsertRowid);
  return { holiday: { id, date, name } };
}

function deleteHoliday({ db, user, params }) {
  requireAdmin(user);
  const result = db.prepare("DELETE FROM holidays WHERE id = ?").run(params.id);
  if (result.changes === 0) throw new HttpError(404, "Holiday not found.");
  return { ok: true };
}

function listRuns({ db, user }) {
  requireAdmin(user);
  const runs = db
    .prepare(
      `SELECT r.*, COUNT(p.id) AS people, COALESCE(SUM(p.gross_payable), 0) AS gross, COALESCE(SUM(p.net_pay), 0) AS net
       FROM payroll_runs r LEFT JOIN payslips p ON p.payroll_run_id = r.id
       GROUP BY r.id
       ORDER BY r.year DESC, r.month DESC`,
    )
    .all();
  return {
    runs: runs.map((row) => ({
      id: row.id,
      year: row.year,
      month: row.month,
      status: row.status,
      createdAt: row.created_at,
      paidAt: row.paid_at,
      people: row.people,
      gross: row.gross,
      net: row.net,
    })),
  };
}

function createRun({ db, user, body }) {
  requireAdmin(user);
  const year = Number(body?.year);
  const month = Number(body?.month);
  assertPeriod(year, month);
  const asOf = asOfFor(year, month);
  const existing = db.prepare("SELECT id FROM payroll_runs WHERE year = ? AND month = ?").get(year, month);
  if (existing) throw new HttpError(409, "Payroll for that month already exists.");
  if (employeesInPayroll(db, year, month).length === 0) throw new HttpError(400, "Nobody was employed in that month.");
  const run = buildRun(db, year, month, asOf);
  return getRun({ db, user, params: { id: run.id } });
}

function getRun({ db, user, params }) {
  requireAdmin(user);
  const run = db.prepare("SELECT * FROM payroll_runs WHERE id = ?").get(params.id);
  if (!run) throw new HttpError(404, "Payroll run not found.");
  const slips = db
    .prepare(
      `SELECT p.*, e.code, e.first_name, e.last_name, d.name AS department
       FROM payslips p
       JOIN employees e ON e.id = p.employee_id
       JOIN departments d ON d.id = e.department_id
       WHERE p.payroll_run_id = ?
       ORDER BY e.code`,
    )
    .all(run.id)
    .map(publicSlip);
  const totals = slips.reduce(
    (sum, slip) => {
      sum.gross += slip.grossPayable;
      sum.pf += slip.pf;
      sum.professionalTax += slip.professionalTax;
      sum.tds += slip.tds;
      sum.net += slip.netPay;
      return sum;
    },
    { gross: 0, pf: 0, professionalTax: 0, tds: 0, net: 0 },
  );
  return {
    run: {
      id: run.id,
      year: run.year,
      month: run.month,
      status: run.status,
      createdAt: run.created_at,
      paidAt: run.paid_at,
    },
    slips,
    totals,
  };
}

function exportRun({ db, user, params }) {
  const payload = getRun({ db, user, params });
  const lines = [
    "Code,Name,Department,Paid days,LOP days,Gross,PF,Professional tax,TDS,Net",
  ];
  for (const slip of payload.slips) {
    lines.push(
      [
        slip.code,
        csvCell(`${slip.firstName} ${slip.lastName}`),
        csvCell(slip.department),
        slip.paidDays,
        slip.lopDays,
        money(slip.grossPayable),
        money(slip.pf),
        money(slip.professionalTax),
        money(slip.tds),
        money(slip.netPay),
      ].join(","),
    );
  }
  const filename = `marigold-${payload.run.year}-${String(payload.run.month).padStart(2, "0")}.csv`;
  return { __csv: lines.join("\n"), __filename: filename };
}

function recalculateRun({ db, user, params }) {
  requireAdmin(user);
  const run = requireDraft(db, params.id);
  writePayslips(db, run.id, run.year, run.month, asOfFor(run.year, run.month));
  return getRun({ db, user, params });
}

function approveRun({ db, user, params }) {
  requireAdmin(user);
  const run = requireDraft(db, params.id);
  db.prepare("UPDATE payroll_runs SET status = 'approved' WHERE id = ?").run(run.id);
  return getRun({ db, user, params });
}

function payRun({ db, user, params }) {
  requireAdmin(user);
  const run = db.prepare("SELECT * FROM payroll_runs WHERE id = ?").get(params.id);
  if (!run) throw new HttpError(404, "Payroll run not found.");
  if (run.status !== "approved") throw new HttpError(409, "Approve the run before marking it paid.");
  db.prepare("UPDATE payroll_runs SET status = 'paid', paid_at = ? WHERE id = ?").run(new Date().toISOString(), run.id);
  return getRun({ db, user, params });
}

function getPayslip({ db, user, params }) {
  const current = requireUser(user);
  const row = db
    .prepare(
      `SELECT p.*, r.year, r.month, r.status AS run_status, r.paid_at,
              emp.code, emp.first_name, emp.last_name, emp.hire_date, emp.pan, emp.bank_name, emp.bank_last4,
              emp.designation_title, emp.department_name AS department
       FROM payslips p
       JOIN payroll_runs r ON r.id = p.payroll_run_id
       JOIN (${employeeSelect()}) emp ON emp.id = p.employee_id
       WHERE p.id = ?`,
    )
    .get(params.id);
  if (!row) throw new HttpError(404, "Payslip not found.");
  if (current.role !== "admin" && current.employee_id !== row.employee_id) {
    throw new HttpError(403, "That payslip belongs to someone else.");
  }
  return {
    company: COMPANY,
    payslip: {
      ...publicSlip(row),
      year: row.year,
      month: row.month,
      runStatus: row.run_status,
      paidAt: row.paid_at,
      hireDate: row.hire_date,
      panMasked: maskPan(row.pan),
      bankName: row.bank_name,
      bankLast4: row.bank_last4,
      title: row.designation_title,
    },
  };
}

function publicSlip(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    code: row.code,
    firstName: row.first_name,
    lastName: row.last_name,
    department: row.department,
    workingDays: row.working_days,
    employedDays: row.employed_days,
    paidDays: row.paid_half / 2,
    lopDays: row.lop_half / 2,
    unmarked: row.unmarked,
    earned: {
      basic: row.basic,
      hra: row.hra,
      specialAllowance: row.special_allowance,
      conveyance: row.conveyance,
      medical: row.medical,
    },
    contract: {
      basic: row.contract_basic,
      hra: row.contract_hra,
      specialAllowance: row.contract_special,
      conveyance: row.contract_conveyance,
      medical: row.contract_medical,
    },
    grossPayable: row.gross_payable,
    pf: row.pf,
    professionalTax: row.professional_tax,
    tds: row.tds,
    netPay: row.net_pay,
    note: row.note,
  };
}

function employeeSelect() {
  return `
    SELECT e.*, d.name AS department_name, p.title AS designation_title, p.grade,
      TRIM(COALESCE(m.first_name, '') || ' ' || COALESCE(m.last_name, '')) AS manager_name
    FROM employees e
    JOIN departments d ON d.id = e.department_id
    JOIN positions p ON p.id = e.position_id
    LEFT JOIN employees m ON m.id = e.manager_id
  `;
}

function leaveSelect() {
  return `
    SELECT r.*, t.name AS type_name, t.paid,
      e.first_name, e.last_name, e.code, e.manager_id
    FROM leave_requests r
    JOIN leave_types t ON t.id = r.leave_type_id
    JOIN employees e ON e.id = r.employee_id
  `;
}

function publicLeave(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: `${row.first_name} ${row.last_name}`,
    code: row.code,
    leaveTypeId: row.leave_type_id,
    leaveType: row.type_name,
    paid: Boolean(row.paid),
    startDate: row.start_date,
    endDate: row.end_date,
    days: row.days,
    reason: row.reason,
    status: row.status,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
  };
}

function employeeById(db, id, user) {
  const row = db.prepare(`${employeeSelect()} WHERE e.id = ?`).get(id);
  return row ? publicEmployee(row, user) : null;
}

function publicEmployee(row, user) {
  const sensitive = user.role === "admin" || user.employee_id === row.id;
  return {
    id: row.id,
    code: row.code,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    departmentId: row.department_id,
    department: row.department_name,
    positionId: row.position_id,
    title: row.designation_title,
    grade: row.grade,
    managerId: row.manager_id,
    managerName: row.manager_name?.trim() ? row.manager_name.trim() : null,
    hireDate: row.hire_date,
    exitDate: row.exit_date,
    status: row.status,
    employmentType: row.employment_type,
    city: row.city,
    bankName: sensitive ? row.bank_name : null,
    bankLast4: sensitive ? row.bank_last4 : null,
    panMasked: sensitive ? maskPan(row.pan) : null,
  };
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    employeeId: user.employee_id,
    firstName: user.first_name,
    lastName: user.last_name,
    code: user.code,
  };
}

function mapCompensation(row) {
  if (!row) return null;
  const structure = structureFromRow(row);
  return {
    ...structure,
    total: structure.basic + structure.hra + structure.specialAllowance + structure.conveyance + structure.medical,
    effectiveFrom: row.effective_from,
  };
}

function readEmployeeInput(db, body, creating) {
  const firstName = cleanName(body?.firstName, "First name");
  const lastName = cleanName(body?.lastName, "Last name");
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email.");
  const departmentId = Number(body?.departmentId);
  const positionId = Number(body?.positionId);
  const position = db.prepare("SELECT * FROM positions WHERE id = ?").get(positionId);
  if (!position || position.department_id !== departmentId) {
    throw new HttpError(400, "Choose a role that belongs to the department.");
  }
  const managerId = body?.managerId ? Number(body.managerId) : null;
  if (managerId) {
    const manager = db.prepare("SELECT id FROM employees WHERE id = ?").get(managerId);
    if (!manager) throw new HttpError(400, "Unknown manager.");
  }
  const hireDate = String(body?.hireDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) throw new HttpError(400, "Hire date must be YYYY-MM-DD.");
  let exitDate = body?.exitDate ? String(body.exitDate) : null;
  if (exitDate && !/^\d{4}-\d{2}-\d{2}$/.test(exitDate)) throw new HttpError(400, "Exit date must be YYYY-MM-DD.");
  const status = String(body?.status ?? "active");
  if (!EMPLOYEE_STATUSES.has(status)) throw new HttpError(400, "Unknown employment status.");
  if (status === "exited" && !exitDate) exitDate = businessToday();
  const employmentType = String(body?.employmentType ?? "full_time");
  if (!EMPLOYMENT_TYPES.has(employmentType)) throw new HttpError(400, "Unknown employment type.");
  const pan = String(body?.pan ?? "").trim().toUpperCase();
  if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) throw new HttpError(400, "PAN should look like ABCDE1234F.");
  const bankLast4 = String(body?.bankLast4 ?? "").trim();
  if (bankLast4 && !/^\d{4}$/.test(bankLast4)) throw new HttpError(400, "Bank account should be the last four digits.");
  if (!creating && body?.id && managerId === Number(body.id)) {
    throw new HttpError(400, "A person cannot manage themselves.");
  }
  return {
    firstName,
    lastName,
    email,
    phone: String(body?.phone ?? "").trim(),
    departmentId,
    positionId,
    managerId,
    hireDate,
    exitDate,
    status,
    employmentType,
    city: String(body?.city ?? "").trim(),
    bankName: String(body?.bankName ?? "").trim(),
    bankLast4,
    pan,
  };
}

function rowToInput(row) {
  return {
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    departmentId: row.department_id,
    positionId: row.position_id,
    managerId: row.manager_id,
    hireDate: row.hire_date,
    exitDate: row.exit_date,
    status: row.status,
    employmentType: row.employment_type,
    city: row.city,
    bankName: row.bank_name,
    bankLast4: row.bank_last4,
    pan: row.pan,
  };
}

function cleanName(value, label) {
  const name = String(value ?? "").trim();
  if (name.length < 1) throw new HttpError(400, `${label} is required.`);
  return name;
}

function rupeesField(body, key) {
  const value = body?.[key];
  if (!Number.isInteger(value) || value < 0) throw new HttpError(400, `${key} must be a whole number of rupees.`);
  return value * 100;
}

function nextCode(db) {
  const rows = db.prepare("SELECT code FROM employees").all();
  const max = rows.reduce((highest, row) => Math.max(highest, Number(row.code.slice(4)) || 0), 1000);
  return `MRD-${max + 1}`;
}

function assertPeriod(year, month) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new HttpError(400, "Choose a real month.");
  }
}

function asOfFor(year, month) {
  const today = businessToday();
  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));
  if (year > currentYear || (year === currentYear && month > currentMonth)) {
    throw new HttpError(400, "Payroll cannot be run for a future month.");
  }
  if (year === currentYear && month === currentMonth) return today;
  return null;
}

function requireDraft(db, id) {
  const run = db.prepare("SELECT * FROM payroll_runs WHERE id = ?").get(id);
  if (!run) throw new HttpError(404, "Payroll run not found.");
  if (run.status !== "draft") throw new HttpError(409, "Only a draft run can be changed.");
  return run;
}

function userFromCookie(db, cookie) {
  const token = readCookie(cookie, "marigold");
  if (!token) return null;
  return db
    .prepare(
      `SELECT u.id, u.email, u.role, u.employee_id, e.first_name, e.last_name, e.code
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN employees e ON e.id = u.employee_id
       WHERE s.token = ?`,
    )
    .get(token);
}

function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function sessionCookie(token) {
  return `marigold=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=1209600`;
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const actual = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function maskPan(pan) {
  if (!pan) return "";
  return `${pan.slice(0, 3)}••••${pan.slice(-2)}`;
}

function money(paise) {
  return (paise / 100).toFixed(2);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function cookieHeader(result) {
  if (result.setCookie) return result.setCookie.split(";")[0];
  return "";
}
