const BELOW_TWENTY = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function under100(value: number): string {
  if (value < 20) return BELOW_TWENTY[value];
  const ten = Math.floor(value / 10);
  const one = value % 10;
  return one ? `${TENS[ten]}-${BELOW_TWENTY[one]}` : TENS[ten];
}

function under1000(value: number): string {
  if (value < 100) return under100(value);
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  return rest ? `${BELOW_TWENTY[hundreds]} hundred ${under100(rest)}` : `${BELOW_TWENTY[hundreds]} hundred`;
}

export function spellIndian(value: number): string {
  if (value === 0) return "zero";
  const crore = Math.floor(value / 1_00_00_000);
  const lakh = Math.floor((value % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((value % 1_00_000) / 1000);
  const rest = value % 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${under1000(crore)} crore`);
  if (lakh) parts.push(`${under100(lakh)} lakh`);
  if (thousand) parts.push(`${under1000(thousand)} thousand`);
  if (rest) parts.push(under1000(rest));
  return parts.join(" ");
}

export function inr(paise: number): string {
  const negative = paise < 0;
  const absolute = Math.abs(paise);
  const rupees = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${negative ? "-" : ""}₹${rupees.toLocaleString("en-IN")}.${fraction}`;
}

export function inrWords(paise: number): string {
  const negative = paise < 0 ? "minus " : "";
  const absolute = Math.abs(paise);
  const rupees = Math.floor(absolute / 100);
  const fraction = absolute % 100;
  const head = `${negative}${spellIndian(rupees)} rupee${rupees === 1 ? "" : "s"}`;
  const sentence = fraction === 0 ? head : `${head} and ${spellIndian(fraction)} paise`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export function rupees(paise: number): number {
  return Math.round(paise / 100);
}

export function monthLabel(year: number, month: number): string {
  const name = new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-IN", {
    month: "long",
    timeZone: "UTC",
  });
  return `${name} ${year}`;
}

export function prettyDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function dayCount(value: number): string {
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${text} day${value === 1 ? "" : "s"}`;
}

export function roleLabel(role: string): string {
  if (role === "admin") return "People & Payroll";
  if (role === "manager") return "Manager";
  return "Employee";
}

export function statusLabel(status: string): string {
  if (status === "on_leave") return "On leave";
  if (status === "half_day") return "Half day";
  if (status === "wfh") return "Work from home";
  if (status === "full_time") return "Full time";
  return status.slice(0, 1).toUpperCase() + status.slice(1);
}
