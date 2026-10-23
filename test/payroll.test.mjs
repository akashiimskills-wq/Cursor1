import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePayslip,
  incomeTaxPaise,
  monthWorkingDates,
  professionalTaxPaise,
  roundDiv,
} from "../server/payroll.mjs";

const rupees = (value) => Math.round(value * 100);

test("rounds half away from zero via half-up on positives", () => {
  assert.equal(roundDiv(5, 2), 3);
  assert.equal(roundDiv(1, 2), 1);
  assert.equal(roundDiv(4, 2), 2);
});

test("professional tax uses the company slabs", () => {
  assert.equal(professionalTaxPaise(rupees(10000)), 0);
  assert.equal(professionalTaxPaise(rupees(10000.01)), rupees(110));
  assert.equal(professionalTaxPaise(rupees(15000)), rupees(110));
  assert.equal(professionalTaxPaise(rupees(15000.01)), rupees(130));
  assert.equal(professionalTaxPaise(rupees(25000)), rupees(130));
  assert.equal(professionalTaxPaise(rupees(40000)), rupees(150));
  assert.equal(professionalTaxPaise(rupees(40000.01)), rupees(200));
});

test("income tax is rebated through 12 lakh and then follows slabs plus cess", () => {
  assert.equal(incomeTaxPaise(rupees(12_00_000)), 0);
  assert.equal(incomeTaxPaise(rupees(20_00_000)), rupees(2_08_000));
  assert.ok(incomeTaxPaise(rupees(12_00_001)) > 0);
});

test("full month with a modest basic has PF and no tax", () => {
  const slip = calculatePayslip({
    structure: {
      basic: rupees(10000),
      hra: 0,
      specialAllowance: 0,
      conveyance: 0,
      medical: 0,
    },
    year: 2026,
    month: 4,
    holidays: [],
    attendance: Object.fromEntries(
      monthWorkingDates(2026, 4, []).map((iso) => [iso, "present"]),
    ),
  });
  assert.equal(slip.workingDays, 22);
  assert.equal(slip.lopDays, 0);
  assert.equal(slip.grossPayable, rupees(10000));
  assert.equal(slip.pf, rupees(1200));
  assert.equal(slip.professionalTax, 0);
  assert.equal(slip.tds, 0);
  assert.equal(slip.netPay, rupees(8800));
});

test("PF is capped at a 15000 wage", () => {
  const days = monthWorkingDates(2026, 4, []);
  const slip = calculatePayslip({
    structure: {
      basic: rupees(20000),
      hra: 0,
      specialAllowance: 0,
      conveyance: 0,
      medical: 0,
    },
    year: 2026,
    month: 4,
    holidays: [],
    attendance: Object.fromEntries(days.map((iso) => [iso, "present"])),
  });
  assert.equal(slip.pf, rupees(1800));
  assert.equal(slip.netPay, rupees(20000) - rupees(1800) - rupees(130));
});

test("absence and a half day reduce paid days and earnings", () => {
  const days = monthWorkingDates(2026, 4, []);
  const attendance = Object.fromEntries(days.map((iso) => [iso, "present"]));
  attendance[days[0]] = "absent";
  attendance[days[1]] = "half_day";
  const slip = calculatePayslip({
    structure: {
      basic: rupees(22000),
      hra: 0,
      specialAllowance: 0,
      conveyance: 0,
      medical: 0,
    },
    year: 2026,
    month: 4,
    holidays: [],
    attendance,
  });
  assert.equal(slip.workingDays, days.length);
  assert.equal(slip.lopDays, 1.5);
  assert.equal(slip.paidDays, days.length - 1.5);
  assert.equal(slip.earned.basic, roundDiv(rupees(22000) * slip.paidHalf, days.length * 2));
  assert.equal(slip.grossPayable, slip.earned.basic);
});

test("paid leave is not loss of pay and unpaid leave is", () => {
  const days = monthWorkingDates(2026, 4, []);
  const slip = calculatePayslip({
    structure: {
      basic: rupees(22000),
      hra: 0,
      specialAllowance: 0,
      conveyance: 0,
      medical: 0,
    },
    year: 2026,
    month: 4,
    holidays: [],
    attendance: {},
    paidLeaveDates: [days[0]],
    unpaidLeaveDates: [days[1]],
  });
  assert.equal(slip.lopDays, days.length - 1);
  assert.equal(slip.unmarked, days.length - 2);
});

test("a mid-month hire is paid only for days in service", () => {
  const calendar = monthWorkingDates(2026, 10, ["2026-10-02"]);
  const employed = monthWorkingDates(2026, 10, ["2026-10-02"], { from: "2026-10-15" });
  const slip = calculatePayslip({
    structure: {
      basic: rupees(21000),
      hra: 0,
      specialAllowance: 0,
      conveyance: 0,
      medical: 0,
    },
    year: 2026,
    month: 10,
    holidays: ["2026-10-02"],
    hireDate: "2026-10-15",
    attendance: Object.fromEntries(employed.map((iso) => [iso, "present"])),
  });
  assert.equal(calendar.length, 21);
  assert.equal(employed.length, 12);
  assert.equal(slip.paidDays, 12);
  assert.equal(slip.earned.basic, roundDiv(rupees(21000) * 24, 42));
});

test("future days in the current month are not treated as absence", () => {
  const holidays = ["2026-10-02"];
  const employed = monthWorkingDates(2026, 10, holidays);
  const due = employed.filter((iso) => iso <= "2026-10-09");
  const slip = calculatePayslip({
    structure: {
      basic: rupees(21000),
      hra: 0,
      specialAllowance: 0,
      conveyance: 0,
      medical: 0,
    },
    year: 2026,
    month: 10,
    holidays,
    asOf: "2026-10-09",
    attendance: Object.fromEntries(due.map((iso) => [iso, "present"])),
  });
  assert.equal(slip.lopDays, 0);
  assert.equal(slip.paidDays, employed.length);
  assert.equal(slip.unmarked, 0);
});

test("October 2026 has 21 working days after Gandhi Jayanti", () => {
  assert.equal(monthWorkingDates(2026, 10, ["2026-10-02"]).length, 21);
});
