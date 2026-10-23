/** Monthly payroll for Marigold.
 *
 * Money is integer paise. This is an illustrative Indian-payroll estimator
 * (PF wage ceiling, professional-tax slabs, new-regime income tax, 4% cess).
 * It is not tax or legal advice.
 */

export const PF_RATE_BPS = 1200;
export const PF_WAGE_CEILING_PAISE = 1_500_000;
export const STANDARD_DEDUCTION_PAISE = 7_500_000;
export const CESS_BPS = 400;
export const REBATE_LIMIT_PAISE = 120_000_000;

const TAX_SLABS = [
  [40_000_000, 0],
  [80_000_000, 500],
  [120_000_000, 1000],
  [160_000_000, 1500],
  [200_000_000, 2000],
  [240_000_000, 2500],
  [Number.POSITIVE_INFINITY, 3000],
];

export function roundDiv(numerator, denominator) {
  if (denominator === 0) throw new Error("division by zero");
  const sign = numerator < 0 ? -1 : 1;
  const n = Math.abs(numerator);
  const d = Math.abs(denominator);
  return sign * Math.floor((n + Math.floor(d / 2)) / d);
}

export function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function businessToday(timeZone = "Asia/Kolkata", now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return isoDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

export function enumerateDates(start, end) {
  if (end < start) return [];
  const dates = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export function isWeekend(iso) {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

export function monthBounds(year, month) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: isoDate(year, month, 1), end: isoDate(year, month, last) };
}

export function monthWorkingDates(year, month, holidays, { from = null, through = null } = {}) {
  const holidaySet = new Set(holidays);
  const { start, end } = monthBounds(year, month);
  return enumerateDates(start, end).filter((iso) => {
    if (isWeekend(iso) || holidaySet.has(iso)) return false;
    if (from && iso < from) return false;
    if (through && iso > through) return false;
    return true;
  });
}

export function businessDaysInRange(start, end, holidays) {
  const holidaySet = new Set(holidays);
  return enumerateDates(start, end).filter((iso) => !isWeekend(iso) && !holidaySet.has(iso));
}

export function professionalTaxPaise(monthlyGrossPaise) {
  const rupees = monthlyGrossPaise / 100;
  if (rupees <= 10_000) return 0;
  if (rupees <= 15_000) return 11_000;
  if (rupees <= 25_000) return 13_000;
  if (rupees <= 40_000) return 15_000;
  return 20_000;
}

export function incomeTaxPaise(taxableAnnualPaise) {
  if (taxableAnnualPaise <= 0 || taxableAnnualPaise <= REBATE_LIMIT_PAISE) return 0;
  let remaining = taxableAnnualPaise;
  let lower = 0;
  let tax = 0;
  for (const [upper, bps] of TAX_SLABS) {
    const width = upper - lower;
    const band = Math.min(remaining, width);
    if (band > 0 && bps > 0) tax += roundDiv(band * bps, 10_000);
    remaining -= Math.max(band, 0);
    lower = upper;
    if (remaining <= 0) break;
  }
  return tax + roundDiv(tax * CESS_BPS, 10_000);
}

function prorate(amount, paidHalf, workingDays) {
  if (workingDays === 0) return amount;
  return roundDiv(amount * paidHalf, workingDays * 2);
}

export function calculatePayslip({
  structure,
  year,
  month,
  holidays = [],
  attendance = {},
  unpaidLeaveDates = [],
  paidLeaveDates = [],
  asOf = null,
  hireDate = null,
  exitDate = null,
}) {
  const { start, end } = monthBounds(year, month);
  const serviceFrom = hireDate && hireDate > start ? hireDate : start;
  const serviceThrough = exitDate && exitDate < end ? exitDate : end;
  const calendar = monthWorkingDates(year, month, holidays);
  const employed =
    serviceFrom <= serviceThrough
      ? monthWorkingDates(year, month, holidays, { from: serviceFrom, through: serviceThrough })
      : [];
  const expected = asOf ? employed.filter((iso) => iso <= asOf) : employed;
  const unpaid = new Set(unpaidLeaveDates);
  const paidLeave = new Set(paidLeaveDates);

  let lopHalf = 0;
  let unmarked = 0;
  for (const iso of expected) {
    if (unpaid.has(iso)) {
      lopHalf += 2;
      continue;
    }
    if (paidLeave.has(iso)) continue;
    const status = attendance[iso];
    if (status === "half_day") {
      lopHalf += 1;
      continue;
    }
    if (status === "present" || status === "wfh" || status === "leave") continue;
    if (!status) unmarked += 1;
    lopHalf += 2;
  }

  const workingDays = calendar.length;
  const employedDays = employed.length;
  const paidHalf = Math.max(0, employedDays * 2 - lopHalf);
  const earned = {
    basic: prorate(structure.basic, paidHalf, workingDays),
    hra: prorate(structure.hra, paidHalf, workingDays),
    specialAllowance: prorate(structure.specialAllowance, paidHalf, workingDays),
    conveyance: prorate(structure.conveyance, paidHalf, workingDays),
    medical: prorate(structure.medical, paidHalf, workingDays),
  };
  const grossPayable =
    earned.basic + earned.hra + earned.specialAllowance + earned.conveyance + earned.medical;
  const pfWage = Math.min(Math.max(earned.basic, 0), PF_WAGE_CEILING_PAISE);
  const pf = roundDiv(pfWage * PF_RATE_BPS, 10_000);
  const professionalTax = professionalTaxPaise(Math.max(grossPayable, 0));
  const annualTaxable = Math.max(0, grossPayable - pf) * 12 - STANDARD_DEDUCTION_PAISE;
  const tds = roundDiv(incomeTaxPaise(annualTaxable), 12);
  const netPay = grossPayable - pf - professionalTax - tds;
  const contractTotal =
    structure.basic +
    structure.hra +
    structure.specialAllowance +
    structure.conveyance +
    structure.medical;

  return {
    workingDays,
    employedDays,
    paidHalf,
    paidDays: paidHalf / 2,
    lopHalf,
    lopDays: lopHalf / 2,
    unmarked,
    contract: {
      basic: structure.basic,
      hra: structure.hra,
      specialAllowance: structure.specialAllowance,
      conveyance: structure.conveyance,
      medical: structure.medical,
      total: contractTotal,
    },
    earned,
    grossPayable,
    pf,
    professionalTax,
    tds,
    netPay,
  };
}
