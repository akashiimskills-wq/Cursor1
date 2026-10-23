import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { cookieHeader, handle } from "../server/app.mjs";
import { closeDatabase, getDb, openDatabase } from "../server/db.mjs";
import { calculatePayslip, monthWorkingDates } from "../server/payroll.mjs";

const directory = mkdtempSync(join(tmpdir(), "marigold-"));
const databasePath = join(directory, "hrms.sqlite");

before(() => {
  openDatabase(databasePath);
});

after(() => {
  closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

function call(method, url, { body, cookie } = {}) {
  const parsed = new URL(url, "http://localhost");
  return handle({
    method,
    path: parsed.pathname,
    query: Object.fromEntries(parsed.searchParams),
    body: body ?? null,
    cookie: cookie ?? "",
  });
}

function signIn(email) {
  const result = call("POST", "/api/login", { body: { email, password: "marigold-demo" } });
  assert.equal(result.status, 200, JSON.stringify(result.json));
  return cookieHeader(result);
}

test("health and login", () => {
  assert.equal(call("GET", "/api/health").json.ok, true);
  const admin = signIn("priya.shah@meridian.example");
  const me = call("GET", "/api/me", { cookie: admin });
  assert.equal(me.json.user.role, "admin");
  assert.equal(me.json.company.name, "Meridian Goods");
  const bad = call("POST", "/api/login", { body: { email: "priya.shah@meridian.example", password: "nope" } });
  assert.equal(bad.status, 401);
});

test("dashboard, people search, and salary privacy", () => {
  const admin = signIn("priya.shah@meridian.example");
  const dashboard = call("GET", "/api/dashboard", { cookie: admin });
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.json.headcount, 10);
  assert.ok(dashboard.json.payroll.net > 0);

  const found = call("GET", "/api/employees?q=leela", { cookie: admin });
  assert.equal(found.json.employees.length, 1);
  const leela = found.json.employees[0];
  const profile = call("GET", `/api/employees/${leela.id}`, { cookie: admin });
  assert.equal(profile.json.employee.title, "Senior Engineer");
  assert.equal(profile.json.compensation.basic, 6_200_000);

  const employee = signIn("leela.nair@meridian.example");
  const own = call("GET", `/api/employees/${leela.id}`, { cookie: employee });
  assert.ok(own.json.compensation);
  const devika = call("GET", "/api/employees?q=devika", { cookie: employee });
  const hidden = call("GET", `/api/employees/${devika.json.employees[0].id}`, { cookie: employee });
  assert.equal(hidden.json.compensation, null);
  assert.equal(call("GET", "/api/payroll/runs", { cookie: employee }).status, 403);
});

test("creating a person rejects a bad role pairing and a duplicate email", () => {
  const admin = signIn("priya.shah@meridian.example");
  const positions = call("GET", "/api/positions", { cookie: admin }).json.positions;
  const engineer = positions.find((position) => position.title === "Engineer");
  const created = call("POST", "/api/employees", {
    cookie: admin,
    body: {
      firstName: "Tara",
      lastName: "Sen",
      email: "tara.sen@meridian.example",
      phone: "+91 98300 11999",
      departmentId: engineer.departmentId,
      positionId: engineer.id,
      managerId: call("GET", "/api/employees?q=arjun", { cookie: admin }).json.employees[0].id,
      hireDate: "2026-10-15",
      employmentType: "full_time",
      city: "Kolkata",
      createLogin: true,
    },
  });
  assert.equal(created.status, 200, JSON.stringify(created.json));
  assert.equal(created.json.employee.code, "MRD-1045");
  assert.equal(created.json.temporaryPassword, "marigold-demo");
  assert.equal(signIn("tara.sen@meridian.example").includes("marigold="), true);

  const duplicate = call("POST", "/api/employees", {
    cookie: admin,
    body: {
      firstName: "Tara",
      lastName: "Sen",
      email: "tara.sen@meridian.example",
      departmentId: engineer.departmentId,
      positionId: engineer.id,
      hireDate: "2026-10-15",
    },
  });
  assert.equal(duplicate.status, 409);

  const studio = positions.find((position) => position.title === "Designer");
  const mismatch = call("POST", "/api/employees", {
    cookie: admin,
    body: {
      firstName: "Wrong",
      lastName: "Role",
      email: "wrong.role@meridian.example",
      departmentId: engineer.departmentId,
      positionId: studio.id,
      hireDate: "2026-10-15",
    },
  });
  assert.equal(mismatch.status, 400);
});

test("leave approval updates balance and a manager cannot approve another team", () => {
  const leela = signIn("leela.nair@meridian.example");
  const meta = call("GET", "/api/leave/meta", { cookie: leela }).json;
  const casual = meta.types.find((type) => type.name === "Casual");
  const before = meta.balances.find((balance) => balance.leaveTypeId === casual.id).used;
  const created = call("POST", "/api/leave/requests", {
    cookie: leela,
    body: {
      leaveTypeId: casual.id,
      startDate: "2026-04-13",
      endDate: "2026-04-14",
      reason: "Family function in Puri",
    },
  });
  assert.equal(created.status, 200, JSON.stringify(created.json));
  assert.equal(created.json.request.days, 2);
  assert.equal(created.json.request.status, "pending");

  const outsider = signIn("leela.nair@meridian.example");
  assert.equal(
    call("POST", `/api/leave/requests/${created.json.request.id}/decision`, {
      cookie: outsider,
      body: { decision: "approve" },
    }).status,
    403,
  );

  const arjun = signIn("arjun.mehta@meridian.example");
  const approved = call("POST", `/api/leave/requests/${created.json.request.id}/decision`, {
    cookie: arjun,
    body: { decision: "approve", note: "Cover is arranged." },
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.json));
  assert.equal(approved.json.request.status, "approved");
  const after = call("GET", "/api/leave/meta", { cookie: leela }).json.balances.find(
    (balance) => balance.leaveTypeId === casual.id,
  );
  assert.equal(after.used, before + 2);

  const tooMany = call("POST", "/api/leave/requests", {
    cookie: leela,
    body: {
      leaveTypeId: casual.id,
      startDate: "2026-05-04",
      endDate: "2026-05-29",
      reason: "A month away from the studio",
    },
  });
  assert.equal(tooMany.status, 409);
});

test("September payroll matches the engine, and a draft can be approved and paid", () => {
  const admin = signIn("priya.shah@meridian.example");
  const runs = call("GET", "/api/payroll/runs", { cookie: admin });
  const september = runs.json.runs.find((run) => run.year === 2026 && run.month === 9);
  assert.equal(september.status, "paid");
  const detail = call("GET", `/api/payroll/runs/${september.id}`, { cookie: admin });
  const kabir = detail.json.slips.find((slip) => slip.firstName === "Kabir");
  assert.equal(kabir.lopDays, 2);
  assert.equal(kabir.paidDays, kabir.workingDays - 2);
  assert.equal(detail.json.totals.net, detail.json.slips.reduce((sum, slip) => sum + slip.netPay, 0));

  const slip = call("GET", `/api/payslips/${kabir.id}`, { cookie: admin });
  assert.equal(slip.status, 200);
  assert.equal(slip.json.payslip.netPay, kabir.netPay);
  assert.equal(slip.json.company.legalName, "Meridian Goods Pvt Ltd");

  const leela = signIn("leela.nair@meridian.example");
  assert.equal(call("GET", `/api/payslips/${kabir.id}`, { cookie: leela }).status, 403);

  const mark = getDb().prepare(
    `INSERT INTO attendance (employee_id, work_date, status) VALUES (?, ?, 'present')
     ON CONFLICT(employee_id, work_date) DO UPDATE SET status = 'present'`,
  );
  for (const employee of getDb().prepare("SELECT id FROM employees").all()) {
    for (const day of monthWorkingDates(2026, 4, [])) mark.run(employee.id, day);
  }
  const april = call("POST", "/api/payroll/runs", { cookie: admin, body: { year: 2026, month: 4 } });
  assert.equal(april.status, 200, JSON.stringify(april.json));
  const devika = april.json.slips.find((row) => row.firstName === "Devika");
  const aprilDays = monthWorkingDates(2026, 4, []);
  const engine = calculatePayslip({
    structure: {
      basic: devika.contract.basic,
      hra: devika.contract.hra,
      specialAllowance: devika.contract.specialAllowance,
      conveyance: devika.contract.conveyance,
      medical: devika.contract.medical,
    },
    year: 2026,
    month: 4,
    holidays: [],
    attendance: Object.fromEntries(aprilDays.map((iso) => [iso, "present"])),
    hireDate: "2016-06-01",
  });
  assert.equal(devika.netPay, engine.netPay);
  assert.ok(devika.tds > 0);

  assert.equal(
    call("POST", `/api/payroll/runs/${april.json.run.id}/pay`, { cookie: admin }).status,
    409,
  );
  const approved = call("POST", `/api/payroll/runs/${april.json.run.id}/approve`, { cookie: admin });
  assert.equal(approved.json.run.status, "approved");
  assert.equal(
    call("POST", `/api/payroll/runs/${april.json.run.id}/recalculate`, { cookie: admin }).status,
    409,
  );
  const paid = call("POST", `/api/payroll/runs/${april.json.run.id}/pay`, { cookie: admin });
  assert.equal(paid.json.run.status, "paid");
  const csv = call("GET", `/api/payroll/runs/${april.json.run.id}/register.csv`, { cookie: admin });
  assert.equal(csv.status, 200);
  assert.match(csv.csv, /Devika Raman/);
  assert.match(csv.csv, /People & Payroll/);
});

test("attendance save and a future payroll month are rejected", () => {
  const admin = signIn("priya.shah@meridian.example");
  const kabir = call("GET", "/api/employees?q=kabir", { cookie: admin }).json.employees[0];
  const saved = call("PUT", "/api/attendance", {
    cookie: admin,
    body: { date: "2026-04-01", entries: [{ employeeId: kabir.id, status: "wfh" }] },
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  assert.equal(saved.json.entries.find((entry) => entry.employee.id === kabir.id).status, "wfh");
  const future = call("POST", "/api/payroll/runs", { cookie: admin, body: { year: 2027, month: 1 } });
  assert.equal(future.status, 400);
});
