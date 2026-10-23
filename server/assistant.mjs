import { businessToday, isWeekend } from "./payroll.mjs";

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

const STOP = new Set(
  `a an the who what whats what's when where which how many much is are was were do does did can you me my our their his her
  please tell show find about of for on in and or to from with today tomorrow now people person employee employees
  salary pay payslip net gross compensation ctc pan bank account company total studio everyone payroll run slip
  leave balance holiday anniversary attendance register absent unmarked`.split(/\s+/),
);

export function assistantBrief(db, user) {
  const facts = loadFacts(db, user);
  const insights = buildInsights(facts);
  return {
    lead: insights[0] ? `${insights[0].title} ${insights[0].detail}` : "The books are quiet.",
    insights,
    prompts: promptsFor(user.role),
  };
}

export function assistantAnswer(db, user, message) {
  const facts = loadFacts(db, user);
  const text = String(message || "").trim().replace(/\s+/g, " ");
  const lower = text.toLowerCase();
  if (!lower) return { reply: "Ask a question about the books.", tone: "guard", links: [] };
  if (/^(hi|hello|hey)\b/.test(lower) || /\b(help|what can you)\b/.test(lower)) return help(facts);

  const sensitive = /\b(salary|compensation|ctc|pay|payslip|pan|bank|account)\b/.test(lower);
  const person = sensitive || /\b(who is|find|show me|about)\b/.test(lower) ? findPerson(db, lower) : null;

  if (sensitive && person && !canSeePay(user, person.id)) return guardPay(person);
  if (sensitive && person) return personPay(db, person, lower);
  if (sensitive && /\b(company|total|our|studio|everyone|payroll)\b/.test(lower)) return companyPay(user, facts);
  if (sensitive) return ownPay(facts, user);

  if (/\b(unmarked|not marked)\b/.test(lower)) return unmarkedAnswer(facts);
  if (/\babsent\b/.test(lower)) return absentAnswer(facts);
  if (/\b(checked in|check-in|in the studio)\b/.test(lower)) return studioAnswer(facts);
  if (/\b(leave balance|my leave|days left)\b/.test(lower)) return balanceAnswer(facts);
  if (/\b(leave|approval|waiting)\b/.test(lower)) return leaveAnswer(db, user, facts);
  if (/\bholiday/.test(lower)) return holidayAnswer(facts);
  if (/\banniversar/.test(lower)) return anniversaryAnswer(facts);
  if (/\bdepartment/.test(lower)) return departmentAnswer(facts);
  if (/\b(geofence|park street|office|studio pin|where is the studio)\b/.test(lower)) return siteAnswer(facts);
  if (/\breports to\b/.test(lower)) return reportsAnswer(db, lower);
  if (/\b(this week|last seven|seven-day|7 day|week)\b/.test(lower)) return weekAnswer(facts);
  if (/\b(how many|headcount|on the books|people)\b/.test(lower)) return headcountAnswer(facts);

  const named = person || findPerson(db, lower);
  if (named) return profileAnswer(named);
  return help(facts);
}

function help(facts) {
  return {
    reply: `I answer from ${facts.company}’s records only — headcount, today’s register, leave, holidays, and pay you are allowed to see. I am not a general chat model.`,
    tone: "answer",
    links: [{ href: "/", label: "Home" }],
  };
}

function promptsFor(role) {
  if (role === "admin") {
    return ["Who is unmarked today?", "What is the company net pay?", "Which leave is waiting?", "When is the next holiday?"];
  }
  if (role === "manager") {
    return ["Which leave is waiting on me?", "Who is absent today?", "What is my net pay?", "When is the next holiday?"];
  }
  return ["What is my leave balance?", "What is my net pay?", "Who is in the studio?", "When is the next holiday?"];
}

function buildInsights(facts) {
  const insights = [];
  if (!facts.workingDay) {
    insights.push({
      id: "register",
      tone: facts.holidayName ? "note" : "steady",
      title: facts.holidayName ? `${facts.holidayName}` : "Weekend",
      detail: facts.holidayName ? "The studio is closed today." : "Payroll and leave can still be reviewed.",
      href: "/attendance",
    });
  } else if (facts.unmarked > 0) {
    insights.push({
      id: "register",
      tone: "attention",
      title: `${facts.unmarked} unmarked`,
      detail: "Today’s register is not complete.",
      href: "/attendance",
    });
  } else if (facts.present === 0 && facts.absent === 0) {
    insights.push({
      id: "register",
      tone: "attention",
      title: "Register is empty",
      detail: "Nobody has been marked for today.",
      href: "/attendance",
    });
  } else {
    insights.push({
      id: "register",
      tone: "steady",
      title: "Register is complete",
      detail: `${facts.present} marked in, ${facts.absent} absent.`,
      href: "/attendance",
    });
  }

  if (facts.role !== "employee" && facts.approvalsWaiting > 0) {
    insights.push({
      id: "leave",
      tone: "attention",
      title: `${facts.approvalsWaiting} leave ${facts.approvalsWaiting === 1 ? "request" : "requests"}`,
      detail: "Waiting on your desk.",
      href: "/leave",
    });
  } else if (facts.role === "employee" && facts.ownPending > 0) {
    insights.push({
      id: "leave",
      tone: "note",
      title: "Leave is pending",
      detail: `${facts.ownPending} of your requests ${facts.ownPending === 1 ? "is" : "are"} still open.`,
      href: "/leave",
    });
  }

  if (facts.role === "admin" && facts.payroll) {
    insights.push({
      id: "payroll",
      tone: facts.payroll.status === "paid" ? "steady" : "attention",
      title: `${monthName(facts.payroll.year, facts.payroll.month)} payroll`,
      detail: `${labelStatus(facts.payroll.status)} · net ${inr(facts.payroll.net)}`,
      href: `/payroll/${facts.payroll.id}`,
    });
  } else if (facts.ownPay) {
    insights.push({
      id: "payroll",
      tone: "steady",
      title: "Your latest slip",
      detail: `${monthName(facts.ownPay.year, facts.ownPay.month)} · net ${inr(facts.ownPay.net)}`,
      href: `/payslips/${facts.ownPay.id}`,
    });
  }

  if (facts.nextHoliday) {
    insights.push({
      id: "holiday",
      tone: "note",
      title: facts.nextHoliday.name,
      detail: prettyDate(facts.nextHoliday.date),
      href: "/holidays",
    });
  }

  if (facts.checkedIn > 0) {
    insights.push({
      id: "studio",
      tone: "steady",
      title: `${facts.checkedIn} in the studio`,
      detail: "Checked in and not yet out.",
      href: "/attendance",
    });
  }

  return insights.slice(0, 4);
}

function loadFacts(db, user) {
  const today = businessToday();
  const holiday = db.prepare("SELECT name FROM holidays WHERE holiday_date = ?").get(today);
  const workingDay = !isWeekend(today) && !holiday;
  const headcount = db.prepare("SELECT COUNT(*) AS count FROM employees WHERE status != 'exited'").get().count;
  const activeIds = db.prepare("SELECT id FROM employees WHERE status = 'active'").all().map((row) => row.id);
  const marked = db.prepare("SELECT employee_id, status FROM attendance WHERE work_date = ?").all(today);
  const markedIds = new Set(marked.map((row) => row.employee_id));
  const present = marked.filter((row) => ["present", "wfh", "half_day", "leave"].includes(row.status)).length;
  const absent = marked.filter((row) => row.status === "absent").length;
  const unmarked = workingDay ? activeIds.filter((id) => !markedIds.has(id)).length : 0;
  const checkedIn = db
    .prepare(
      `SELECT COUNT(*) AS count FROM punches p
       WHERE p.work_date = ? AND p.action = 'in'
         AND NOT EXISTS (
           SELECT 1 FROM punches o
           WHERE o.employee_id = p.employee_id AND o.work_date = p.work_date AND o.action = 'out'
         )`,
    )
    .get(today).count;
  const pendingLeave = db.prepare("SELECT COUNT(*) AS count FROM leave_requests WHERE status = 'pending'").get().count;
  const approvalsWaiting =
    user.role === "employee"
      ? 0
      : db
          .prepare(
            `SELECT COUNT(*) AS count FROM leave_requests r JOIN employees e ON e.id = r.employee_id
             WHERE r.status = 'pending' AND (e.manager_id = ? OR ? = 'admin')`,
          )
          .get(user.employee_id, user.role).count;
  const ownPending = db
    .prepare("SELECT COUNT(*) AS count FROM leave_requests WHERE employee_id = ? AND status = 'pending'")
    .get(user.employee_id).count;
  const latest = db.prepare("SELECT * FROM payroll_runs ORDER BY year DESC, month DESC LIMIT 1").get();
  const totals =
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
       WHERE p.employee_id = ? ORDER BY r.year DESC, r.month DESC LIMIT 1`,
    )
    .get(user.employee_id);
  const nextHoliday = db
    .prepare("SELECT holiday_date AS date, name FROM holidays WHERE holiday_date >= ? ORDER BY holiday_date LIMIT 1")
    .get(today);
  const month = today.slice(5, 7);
  const anniversaries = db
    .prepare(
      `SELECT COUNT(*) AS count FROM employees
       WHERE status != 'exited' AND substr(hire_date, 6, 2) = ?`,
    )
    .get(month).count;
  const departments = db
    .prepare(
      `SELECT d.name AS department, COUNT(*) AS count
       FROM employees e JOIN departments d ON d.id = e.department_id
       WHERE e.status != 'exited' GROUP BY d.id ORDER BY count DESC, d.name`,
    )
    .all();
  const site = db.prepare("SELECT name, address, radius_m FROM sites ORDER BY id LIMIT 1").get();
  const balances = db
    .prepare(
      `SELECT t.name, b.allocated, b.used
       FROM leave_balances b JOIN leave_types t ON t.id = b.leave_type_id
       WHERE b.employee_id = ? AND b.year = ? ORDER BY t.name`,
    )
    .all(user.employee_id, Number(today.slice(0, 4)));
  const weekStart = shiftDays(today, -6);
  const week = db
    .prepare(
      `SELECT status, COUNT(*) AS count FROM attendance
       WHERE work_date >= ? AND work_date <= ? GROUP BY status`,
    )
    .all(weekStart, today);
  return {
    company: "Meridian Goods",
    role: user.role,
    today,
    workingDay,
    holidayName: holiday?.name ?? null,
    headcount,
    present,
    absent,
    unmarked,
    checkedIn,
    pendingLeave: user.role === "employee" ? 0 : pendingLeave,
    approvalsWaiting,
    ownPending,
    payroll:
      user.role === "admin" && latest
        ? { id: latest.id, year: latest.year, month: latest.month, status: latest.status, people: totals.people, gross: totals.gross, net: totals.net }
        : null,
    ownPay: ownSlip ? { id: ownSlip.id, year: ownSlip.year, month: ownSlip.month, status: ownSlip.status, net: ownSlip.net } : null,
    nextHoliday,
    anniversaries,
    departments,
    site,
    balances,
    weekPresent: week.filter((row) => ["present", "wfh", "half_day", "leave"].includes(row.status)).reduce((sum, row) => sum + row.count, 0),
    weekAbsent: week.find((row) => row.status === "absent")?.count ?? 0,
    absentNames: namesForStatus(db, today, "absent"),
    unmarkedNames: workingDay ? unmarkedNames(db, today) : [],
    studioNames: studioNames(db, today),
  };
}

function namesForStatus(db, today, status) {
  return db
    .prepare(
      `SELECT e.first_name, e.last_name FROM attendance a JOIN employees e ON e.id = a.employee_id
       WHERE a.work_date = ? AND a.status = ? ORDER BY e.first_name LIMIT 8`,
    )
    .all(today, status)
    .map(fullName);
}

function unmarkedNames(db, today) {
  return db
    .prepare(
      `SELECT first_name, last_name FROM employees e
       WHERE status = 'active'
         AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.employee_id = e.id AND a.work_date = ?)
       ORDER BY first_name LIMIT 8`,
    )
    .all(today)
    .map(fullName);
}

function studioNames(db, today) {
  return db
    .prepare(
      `SELECT e.first_name, e.last_name FROM punches p JOIN employees e ON e.id = p.employee_id
       WHERE p.work_date = ? AND p.action = 'in'
         AND NOT EXISTS (
           SELECT 1 FROM punches o WHERE o.employee_id = p.employee_id AND o.work_date = p.work_date AND o.action = 'out'
         )
       ORDER BY p.punched_at LIMIT 8`,
    )
    .all(today)
    .map(fullName);
}

function headcountAnswer(facts) {
  return {
    reply: `${facts.headcount} people are on the books and have not exited.`,
    tone: "answer",
    links: [{ href: "/people", label: "Employees" }],
  };
}

function unmarkedAnswer(facts) {
  if (!facts.workingDay) {
    return { reply: facts.holidayName ? `${facts.holidayName} — the studio is closed, so nobody is unmarked.` : "It’s the weekend, so the register is not taking attendance.", tone: "answer", links: [{ href: "/attendance", label: "Attendance" }] };
  }
  if (facts.unmarked === 0) return { reply: "Everyone active has a mark for today.", tone: "answer", links: [{ href: "/attendance", label: "Attendance" }] };
  return {
    reply: `${facts.unmarked} ${facts.unmarked === 1 ? "person is" : "people are"} unmarked: ${listNames(facts.unmarkedNames, facts.unmarked)}.`,
    tone: "answer",
    links: [{ href: "/attendance", label: "Open the register" }],
  };
}

function absentAnswer(facts) {
  if (facts.absent === 0) return { reply: "Nobody is marked absent today.", tone: "answer", links: [{ href: "/attendance", label: "Attendance" }] };
  return {
    reply: `${facts.absent} ${facts.absent === 1 ? "person is" : "people are"} absent: ${listNames(facts.absentNames, facts.absent)}.`,
    tone: "answer",
    links: [{ href: "/attendance", label: "Attendance" }],
  };
}

function studioAnswer(facts) {
  if (facts.checkedIn === 0) return { reply: "Nobody is currently checked in at the studio.", tone: "answer", links: [{ href: "/attendance", label: "Attendance" }] };
  return {
    reply: `${facts.checkedIn} ${facts.checkedIn === 1 ? "person is" : "people are"} checked in and not yet out: ${listNames(facts.studioNames, facts.checkedIn)}.`,
    tone: "answer",
    links: [{ href: "/attendance", label: "Attendance" }],
  };
}

function balanceAnswer(facts) {
  if (facts.balances.length === 0) return { reply: "No leave balance is on file for this year.", tone: "answer", links: [{ href: "/leave", label: "Leave" }] };
  const lines = facts.balances.map((row) =>
    row.allocated === 0 ? `${row.name}: ${row.used} used, not capped` : `${row.name}: ${row.allocated - row.used} of ${row.allocated} left`,
  );
  return { reply: `Your ${facts.today.slice(0, 4)} balances — ${lines.join("; ")}.`, tone: "answer", links: [{ href: "/leave", label: "Leave" }] };
}

function leaveAnswer(db, user, facts) {
  if (user.role === "employee") {
    return {
      reply: facts.ownPending === 0 ? "You have no leave waiting for approval." : `You have ${facts.ownPending} leave ${facts.ownPending === 1 ? "request" : "requests"} still pending.`,
      tone: "answer",
      links: [{ href: "/leave", label: "Leave" }],
    };
  }
  if (facts.approvalsWaiting === 0) {
    return { reply: "Nothing is waiting on you.", tone: "answer", links: [{ href: "/leave", label: "Leave" }] };
  }
  const scope = user.role === "manager" ? "AND e.manager_id = ?" : "";
  const params = user.role === "manager" ? [user.employee_id] : [];
  const rows = db
    .prepare(
      `SELECT e.first_name, e.last_name, t.name AS leave_type, r.start_date, r.days
       FROM leave_requests r
       JOIN employees e ON e.id = r.employee_id
       JOIN leave_types t ON t.id = r.leave_type_id
       WHERE r.status = 'pending' ${scope}
       ORDER BY r.start_date LIMIT 5`,
    )
    .all(...params);
  const list = rows.map((row) => `${row.first_name} ${row.last_name}, ${row.leave_type}, ${row.days} day${row.days === 1 ? "" : "s"} from ${prettyDate(row.start_date)}`).join("; ");
  return {
    reply: `${facts.approvalsWaiting} ${facts.approvalsWaiting === 1 ? "request is" : "requests are"} waiting. ${list}.`,
    tone: "answer",
    links: [{ href: "/leave", label: "Review leave" }],
  };
}

function holidayAnswer(facts) {
  if (!facts.nextHoliday) return { reply: "No holiday is left on the calendar.", tone: "answer", links: [{ href: "/holidays", label: "Holidays" }] };
  return {
    reply: `Next holiday is ${facts.nextHoliday.name} on ${prettyDate(facts.nextHoliday.date)}.`,
    tone: "answer",
    links: [{ href: "/holidays", label: "Calendar" }],
  };
}

function anniversaryAnswer(facts) {
  if (facts.anniversaries === 0) return { reply: "Nobody marks a joining anniversary this month.", tone: "answer", links: [{ href: "/", label: "Home" }] };
  return {
    reply: `${facts.anniversaries} ${facts.anniversaries === 1 ? "person marks" : "people mark"} a work anniversary this month.`,
    tone: "answer",
    links: [{ href: "/", label: "Home" }],
  };
}

function departmentAnswer(facts) {
  const list = facts.departments.map((row) => `${row.department} ${row.count}`).join(", ");
  return { reply: `Headcount by department: ${list}.`, tone: "answer", links: [{ href: "/people", label: "Employees" }] };
}

function siteAnswer(facts) {
  if (!facts.site) return { reply: "No studio site is on file.", tone: "answer", links: [] };
  return {
    reply: `Check-in is accepted within ${facts.site.radius_m} m of ${facts.site.name}, ${facts.site.address}. A day marked work-from-home is exempt. Location is read only when someone punches.`,
    tone: "answer",
    links: [{ href: "/attendance", label: "Attendance" }],
  };
}

function reportsAnswer(db, lower) {
  const match = lower.match(/reports to ([a-z][a-z .'-]{1,40})/);
  const name = match?.[1]?.trim();
  if (!name) return { reply: "Name the manager, for example “who reports to Arjun Mehta”.", tone: "answer", links: [{ href: "/people", label: "Employees" }] };
  const rows = db
    .prepare(
      `SELECT e.first_name, e.last_name, p.title
       FROM employees e
       JOIN employees m ON m.id = e.manager_id
       JOIN positions p ON p.id = e.position_id
       WHERE e.status != 'exited' AND lower(m.first_name || ' ' || m.last_name) LIKE ?
       ORDER BY e.first_name`,
    )
    .all(`%${name.replace(/[%_]/g, "")}%`);
  if (rows.length === 0) return { reply: `Nobody on the books reports to ${name}.`, tone: "answer", links: [{ href: "/people", label: "Employees" }] };
  return {
    reply: `${rows.length} ${rows.length === 1 ? "person reports" : "people report"} to that manager: ${rows.map((row) => `${row.first_name} ${row.last_name} (${row.title})`).join(", ")}.`,
    tone: "answer",
    links: [{ href: "/people", label: "Employees" }],
  };
}

function weekAnswer(facts) {
  return {
    reply: `Across the seven days ending ${prettyDate(facts.today)}, the register holds ${facts.weekPresent} present marks and ${facts.weekAbsent} absences. Weekends and holidays are not treated as unmarked.`,
    tone: "answer",
    links: [{ href: "/", label: "Home" }],
  };
}

function companyPay(user, facts) {
  if (user.role !== "admin" || !facts.payroll) {
    return {
      reply: "Company payroll totals stay with People & Payroll. I can still read your own slip.",
      tone: "guard",
      links: facts.ownPay ? [{ href: `/payslips/${facts.ownPay.id}`, label: "Your slip" }] : [],
    };
  }
  return {
    reply: `${monthName(facts.payroll.year, facts.payroll.month)} is ${facts.payroll.status}. It covers ${facts.payroll.people} people. Gross ${inr(facts.payroll.gross)}, net ${inr(facts.payroll.net)}.`,
    tone: "answer",
    links: [{ href: `/payroll/${facts.payroll.id}`, label: "Open the run" }],
  };
}

function ownPay(facts, user) {
  if (user.role === "admin" && facts.payroll && !facts.ownPay) return companyPay(user, facts);
  if (!facts.ownPay) return { reply: "No payslip is on file for you yet.", tone: "answer", links: [] };
  return {
    reply: `Your ${monthName(facts.ownPay.year, facts.ownPay.month)} slip is ${facts.ownPay.status}. Net pay is ${inr(facts.ownPay.net)}.`,
    tone: "answer",
    links: [{ href: `/payslips/${facts.ownPay.id}`, label: "Open the slip" }],
  };
}

function personPay(db, person, lower) {
  const wantsNet = /\b(net|payslip|slip)\b/.test(lower);
  if (wantsNet) {
    const slip = db
      .prepare(
        `SELECT p.id, r.year, r.month, r.status, p.net_pay AS net
         FROM payslips p JOIN payroll_runs r ON r.id = p.payroll_run_id
         WHERE p.employee_id = ? ORDER BY r.year DESC, r.month DESC LIMIT 1`,
      )
      .get(person.id);
    if (!slip) return { reply: `${person.first_name} ${person.last_name} has no payslip yet.`, tone: "answer", links: [{ href: `/people/${person.id}`, label: "Profile" }] };
    return {
      reply: `${person.first_name} ${person.last_name}’s ${monthName(slip.year, slip.month)} slip is ${slip.status}. Net pay is ${inr(slip.net)}.`,
      tone: "answer",
      links: [{ href: `/payslips/${slip.id}`, label: "Open the slip" }],
    };
  }
  if (/\bpan\b/.test(lower)) {
    const row = db.prepare("SELECT pan FROM employees WHERE id = ?").get(person.id);
    return {
      reply: row?.pan ? `${person.first_name} ${person.last_name}’s PAN on file ends ${maskPan(row.pan)}.` : "No PAN is on file.",
      tone: "answer",
      links: [{ href: `/people/${person.id}`, label: "Profile" }],
    };
  }
  const pay = db
    .prepare(
      `SELECT basic + hra + special_allowance + conveyance + medical AS total, basic
       FROM compensation WHERE employee_id = ?`,
    )
    .get(person.id);
  if (!pay) return { reply: `${person.first_name} ${person.last_name} has no compensation on file.`, tone: "answer", links: [{ href: `/people/${person.id}`, label: "Profile" }] };
  return {
    reply: `${person.first_name} ${person.last_name}’s monthly contract is ${inr(pay.total)}, with basic ${inr(pay.basic)}.`,
    tone: "answer",
    links: [{ href: `/people/${person.id}`, label: "Profile" }],
  };
}

function guardPay(person) {
  return {
    reply: `Compensation, PAN, and bank details for ${person.first_name} ${person.last_name} stay with People & Payroll, or with them. I can still tell you their role and today’s attendance.`,
    tone: "guard",
    links: [{ href: `/people/${person.id}`, label: "Profile" }],
  };
}

function profileAnswer(person) {
  return {
    reply: `${person.first_name} ${person.last_name} (${person.code}) is ${person.title} in ${person.department}. Status: ${person.status.replaceAll("_", " ")}.`,
    tone: "answer",
    links: [{ href: `/people/${person.id}`, label: "Open profile" }],
  };
}

function findPerson(db, lower) {
  const tokens = lower
    .replace(/[^a-z0-9@.\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP.has(token));
  if (tokens.length === 0) return null;
  const term = `%${tokens.join("%")}%`;
  return (
    db
      .prepare(
        `SELECT e.id, e.first_name, e.last_name, e.code, e.status, d.name AS department, p.title
         FROM employees e
         JOIN departments d ON d.id = e.department_id
         JOIN positions p ON p.id = e.position_id
         WHERE lower(e.first_name || ' ' || e.last_name) LIKE ?
            OR lower(e.email) LIKE ?
            OR lower(e.code) LIKE ?
         ORDER BY e.code LIMIT 1`,
      )
      .get(term, term, term) || null
  );
}

function canSeePay(user, employeeId) {
  return user.role === "admin" || user.employee_id === employeeId;
}

function fullName(row) {
  return `${row.first_name} ${row.last_name}`;
}

function listNames(names, total) {
  if (names.length === 0) return "names are on the register";
  if (total > names.length) return `${names.join(", ")}, and ${total - names.length} more`;
  return names.join(", ");
}

function monthName(year, month) {
  return `${MONTHS[month - 1]} ${year}`;
}

function labelStatus(status) {
  if (status === "half_day") return "half day";
  return status;
}

function prettyDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function inr(paise) {
  const negative = paise < 0;
  const absolute = Math.abs(Math.round(paise));
  const rupees = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${negative ? "-" : ""}₹${rupees.toLocaleString("en-IN")}.${fraction}`;
}

function maskPan(pan) {
  const value = String(pan);
  return value.length <= 4 ? value : `${"•".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

function shiftDays(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
