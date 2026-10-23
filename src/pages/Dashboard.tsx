import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Avatar } from "../components/Avatar";
import { Pipeline } from "../components/Pipeline";
import { PunchCard } from "../components/PunchCard";
import { dayCount, inr, kolkataTime, monthLabel, prettyDate, statusLabel } from "../format";

type WeekDay = {
  date: string;
  label: string;
  present: number;
  absent: number;
  unmarked: number;
  closed: boolean;
  holidayName: string | null;
};

type Activity = { at: string; kind: string; title: string; detail: string };
type Insight = { id: string; tone: string; title: string; detail: string; href: string };

type DashboardData = {
  today: string;
  workingDay: boolean;
  holidayName: string | null;
  headcount: number;
  byDepartment: { department: string; count: number }[];
  present: number;
  absent: number;
  unmarked: number;
  checkedIn: number;
  pendingLeave: number;
  approvalsWaiting: number;
  payroll: { id: number; year: number; month: number; status: string; people: number; gross: number; net: number } | null;
  ownPay: { id: number; year: number; month: number; status: string; net: number } | null;
  anniversaries: { id: number; name: string; code: string; hireDate: string; years: number }[];
  upcomingHolidays: { id: number; date: string; name: string }[];
  week: WeekDay[];
  activity: Activity[];
  pipeline: { status: string; year: number; month: number } | null;
};

export function Dashboard() {
  const { me } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<DashboardData>("/api/dashboard")
      .then(setData)
      .catch((caught) => setError(caught.message));
    api<{ insights: Insight[] }>("/api/assistant/brief")
      .then((brief) => setInsights(brief.insights))
      .catch(() => setInsights([]));
  }, []);

  if (error) return <p className="banner">{error}</p>;
  if (!data || !me) return <p className="boot">Gathering today’s figures…</p>;
  const headlinePay = me.user.role === "admin" ? data.payroll : data.ownPay;
  const scale = Math.max(data.headcount, 1);
  const coverage = data.workingDay ? data.present / Math.max(data.present + data.absent + data.unmarked, 1) : null;

  return (
    <div className="page">
      <header className="page-head hero">
        <div>
          <p className="eyebrow">{me.company.legalName} · {prettyDate(data.today)}</p>
          <h1>
            {greeting()}, {me.user.firstName}
          </h1>
          <p className="lede">{deskLine(data)}</p>
        </div>
        <Link className="primary button-link" to="/attendance">
          Attendance desk
        </Link>
      </header>
      {insights.length > 0 ? (
        <section className="signals" aria-label="Brief signals">
          {insights.slice(0, 3).map((insight) => (
            <Link key={insight.id} to={insight.href} className={`signal ${insight.tone}`}>
              <span>Brief</span>
              <strong>{insight.title}</strong>
              <em>{insight.detail}</em>
            </Link>
          ))}
        </section>
      ) : null}
      <PunchCard layout="strip" />

      <section className="stats">
        <article>
          <span>On the books</span>
          <strong>{data.headcount}</strong>
          <em>people not exited</em>
        </article>
        <article>
          <span>In the studio</span>
          <strong>{data.checkedIn}</strong>
          <em>checked in, not yet out</em>
        </article>
        <article>
          <span>Register</span>
          <strong>{data.present}</strong>
          <em>
            {data.absent} absent · {data.unmarked} unmarked
          </em>
        </article>
        <article>
          <span>{me.user.role === "admin" ? "Company net" : "Your net"}</span>
          <strong className="money">{headlinePay ? inr(headlinePay.net) : "—"}</strong>
          <em>
            {headlinePay
              ? `${monthLabel(headlinePay.year, headlinePay.month)} · ${statusLabel(headlinePay.status)}`
              : "No payslip yet"}
          </em>
        </article>
      </section>

      <div className="board">
        <section className="card">
          <div className="card-head">
            <h2>Seven-day attendance</h2>
            <Coverage value={coverage} />
          </div>
          <div className="week">
            {data.week.map((day) => (
              <div key={day.date} className={day.date === data.today ? "week-col today" : "week-col"}>
                <div className="week-plot" title={day.holidayName || day.date}>
                  <i className="absent" style={{ height: `${(day.absent / scale) * 100}%` }} />
                  <i className="present" style={{ height: `${(day.present / scale) * 100}%` }} />
                </div>
                <b>{day.label}</b>
                <small>{day.closed ? "Closed" : day.present}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Desk activity</h2>
            {me.user.role === "employee" ? <span>Yours</span> : <span>Studio</span>}
          </div>
          {data.activity.length === 0 ? <p className="empty">Nothing has moved on the desk yet.</p> : null}
          <ol className="activity">
            {data.activity.map((item) => (
              <li key={`${item.kind}-${item.at}-${item.title}`}>
                <span className={`tick ${item.kind}`} />
                <div>
                  <b>{item.title}</b>
                  <small>
                    {item.at.includes("T") ? kolkataTime(item.at) : prettyDate(item.at.slice(0, 10))} · {item.detail}
                  </small>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="split">
        <section className="card">
          <div className="card-head">
            <h2>{me.user.role === "admin" ? "Payroll pipeline" : "Your pay"}</h2>
            {me.user.role === "admin" && data.payroll ? <Link to={`/payroll/${data.payroll.id}`}>Open run</Link> : null}
            {me.user.role !== "admin" && data.ownPay ? <Link to={`/payslips/${data.ownPay.id}`}>Open slip</Link> : null}
          </div>
          {data.pipeline ? (
            <>
              <Pipeline status={data.pipeline.status} />
              <p className="pipeline-note">
                {monthLabel(data.pipeline.year, data.pipeline.month)} covers {data.payroll?.people ?? 0} people. Gross{" "}
                {inr(data.payroll?.gross ?? 0)}, net {inr(data.payroll?.net ?? 0)}.
              </p>
            </>
          ) : data.ownPay ? (
            <p>
              Your {monthLabel(data.ownPay.year, data.ownPay.month)} slip is {statusLabel(data.ownPay.status)}. Net pay is{" "}
              {inr(data.ownPay.net)}.
            </p>
          ) : (
            <p>Your payslips appear here after a month is paid.</p>
          )}
          {me.user.role !== "employee" ? (
            <p className="pipeline-note">
              {data.approvalsWaiting} leave {data.approvalsWaiting === 1 ? "request is" : "requests are"} waiting on you.{" "}
              {data.pendingLeave} open in the company.
            </p>
          ) : null}
        </section>
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
      </div>

      <div className="split">
        <section className="card">
          <h2>Work anniversaries</h2>
          {data.anniversaries.length === 0 ? <p className="empty">Nobody marks a joining anniversary this month.</p> : null}
          <ul className="people-rows">
            {data.anniversaries.map((person) => (
              <li key={person.id}>
                <Avatar name={person.name} />
                <div>
                  <Link to={`/people/${person.id}`}>{person.name}</Link>
                  <span>
                    {person.years === 0 ? "Joined this month" : `${person.years} ${person.years === 1 ? "year" : "years"}`} ·{" "}
                    {prettyDate(person.hireDate)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
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

function Coverage({ value }: { value: number | null }) {
  const amount = value ?? 0;
  const radius = 18;
  const circ = 2 * Math.PI * radius;
  return (
    <div className="coverage" aria-label={value == null ? "Studio closed" : `${Math.round(amount * 100)} percent marked in`}>
      <svg viewBox="0 0 44 44" width="44" height="44">
        <circle cx="22" cy="22" r={radius} />
        <circle cx="22" cy="22" r={radius} strokeDasharray={circ} strokeDashoffset={circ * (1 - amount)} />
      </svg>
      <span>{value == null ? "Closed" : `${Math.round(amount * 100)}%`}</span>
    </div>
  );
}

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23" }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function deskLine(data: DashboardData) {
  if (data.holidayName) return `${data.holidayName} — the studio is closed.`;
  if (!data.workingDay) return "It’s the weekend. Payroll and leave can still be reviewed.";
  if (data.unmarked === 0) return "Today’s attendance register is complete.";
  if (data.present === 0 && data.absent === 0) return "Attendance has not been taken today.";
  return `${data.unmarked} ${data.unmarked === 1 ? "person is" : "people are"} still unmarked for today.`;
}
