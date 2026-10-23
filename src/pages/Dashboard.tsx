import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { dayCount, inr, monthLabel, prettyDate, statusLabel } from "../format";

type DashboardData = {
  today: string;
  workingDay: boolean;
  holidayName: string | null;
  headcount: number;
  byDepartment: { department: string; count: number }[];
  present: number;
  absent: number;
  unmarked: number;
  pendingLeave: number;
  approvalsWaiting: number;
  payroll: { id: number; year: number; month: number; status: string; people: number; gross: number; net: number } | null;
  anniversaries: { id: number; name: string; code: string; hireDate: string; years: number }[];
  upcomingHolidays: { id: number; date: string; name: string }[];
};

export function Dashboard() {
  const { me } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<DashboardData>("/api/dashboard")
      .then(setData)
      .catch((caught) => setError(caught.message));
  }, []);

  if (error) return <p className="banner">{error}</p>;
  if (!data || !me) return <p className="boot">Gathering today’s figures…</p>;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{prettyDate(data.today)}</p>
          <h1>Good day, {me.user.firstName}.</h1>
          <p className="lede">
            {data.holidayName
              ? `${data.holidayName} — the studio is closed.`
              : data.workingDay
                ? data.unmarked === 0
                  ? "Today’s attendance register is complete."
                  : data.present === 0 && data.absent === 0
                    ? "Attendance has not been taken today."
                    : `${data.unmarked} ${data.unmarked === 1 ? "person is" : "people are"} still unmarked for today.`
                : "It’s the weekend. Payroll and leave can still be reviewed."}
          </p>
        </div>
        <Link className="primary button-link" to="/attendance">
          Open the register
        </Link>
      </header>

      <section className="stats">
        <article>
          <span>On the books</span>
          <strong>{data.headcount}</strong>
          <em>people not exited</em>
        </article>
        <article>
          <span>Marked present</span>
          <strong>{data.present}</strong>
          <em>{data.absent} absent today</em>
        </article>
        <article>
          <span>Leave waiting</span>
          <strong>{me.user.role === "employee" ? "—" : data.approvalsWaiting}</strong>
          <em>{me.user.role === "employee" ? "Your requests live under Leave" : `${data.pendingLeave} open in the company`}</em>
        </article>
        <article>
          <span>Latest net pay</span>
          <strong>{data.payroll ? inr(data.payroll.net) : "—"}</strong>
          <em>
            {data.payroll
              ? `${monthLabel(data.payroll.year, data.payroll.month)} · ${statusLabel(data.payroll.status)}`
              : "No payroll yet"}
          </em>
        </article>
      </section>

      <div className="split">
        <section className="card">
          <h2>Departments</h2>
          <ul className="bars">
            {data.byDepartment.map((row) => (
              <li key={row.department}>
                <div>
                  <b>{row.department}</b>
                  <span>{row.count}</span>
                </div>
                <i style={{ width: `${(row.count / data.headcount) * 100}%` }} />
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2>Work anniversaries</h2>
          {data.anniversaries.length === 0 ? <p className="empty">Nobody marks a joining anniversary this month.</p> : null}
          <ul className="plain">
            {data.anniversaries.map((person) => (
              <li key={person.id}>
                <Link to={`/people/${person.id}`}>{person.name}</Link>
                <span>
                  {person.years === 0 ? "Joined this month" : `${person.years} ${person.years === 1 ? "year" : "years"}`} · {prettyDate(person.hireDate)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="split">
        <section className="card">
          <div className="card-head">
            <h2>Payroll</h2>
            {me.user.role === "admin" && data.payroll ? <Link to={`/payroll/${data.payroll.id}`}>Open run</Link> : null}
          </div>
          {data.payroll ? (
            <p>
              {monthLabel(data.payroll.year, data.payroll.month)} covers {data.payroll.people} people. Gross{" "}
              {inr(data.payroll.gross)}, net {inr(data.payroll.net)}. The run is {data.payroll.status}.
            </p>
          ) : (
            <p>No payroll run has been prepared.</p>
          )}
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Coming up</h2>
            <Link to="/holidays">Calendar</Link>
          </div>
          <ul className="plain">
            {data.upcomingHolidays.map((holiday) => (
              <li key={holiday.id}>
                <b>{holiday.name}</b>
                <span>{prettyDate(holiday.date)}</span>
              </li>
            ))}
          </ul>
          {data.upcomingHolidays.length === 0 ? <p className="empty">No holidays left on the calendar.</p> : null}
        </section>
      </div>
      <p className="footnote">Paid days on a slip are working days minus loss of pay. {dayCount(1)} of unpaid leave counts as absence.</p>
    </div>
  );
}
