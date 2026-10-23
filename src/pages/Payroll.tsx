import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { Pipeline } from "../components/Pipeline";
import { dayCount, inr, monthLabel, statusLabel } from "../format";
import type { Payslip } from "../types";

type RunSummary = {
  id: number;
  year: number;
  month: number;
  status: string;
  people: number;
  gross: number;
  net: number;
};

type RunDetail = {
  run: { id: number; year: number; month: number; status: string };
  slips: Payslip[];
  totals: { gross: number; pf: number; professionalTax: number; tds: number; net: number };
};

export function Payroll() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(10);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  function load() {
    api<{ runs: RunSummary[] }>("/api/payroll/runs")
      .then((data) => {
        setRuns(data.runs);
        setLoaded(true);
      })
      .catch((caught) => setError(caught.message));
  }

  useEffect(() => {
    if (!me) return;
    if (me.user.role !== "admin") return;
    const [y, m] = me.today.split("-").map(Number);
    setYear(y);
    setMonth(m);
    load();
  }, [me]);

  if (me && me.user.role !== "admin") return <p className="banner">Payroll is limited to People & Payroll.</p>;
  if (!me) return <p className="boot">Opening payroll…</p>;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Compensation</p>
          <h1>Payroll</h1>
          <p className="lede">
            A run prorates each contract for days in service and loss of pay, then deducts PF, professional tax, and estimated TDS.
          </p>
        </div>
      </header>
      {error ? <p className="banner">{error}</p> : null}
      {runs[0] ? (
        <section className="card pipeline-card">
          <div className="card-head">
            <h2>{monthLabel(runs[0].year, runs[0].month)}</h2>
            <Link to={`/payroll/${runs[0].id}`}>Open the latest run</Link>
          </div>
          <Pipeline status={runs[0].status} />
          <p className="pipeline-note">
            {runs[0].people} people · gross {inr(runs[0].gross)} · net {inr(runs[0].net)}. A run moves from draft to approved, then to paid.
          </p>
        </section>
      ) : null}
      <form
        className="filters"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            const created = await api<RunDetail>("/api/payroll/runs", {
              method: "POST",
              body: JSON.stringify({ year, month }),
            });
            navigate(`/payroll/${created.run.id}`);
          } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Could not prepare payroll.");
          }
        }}
      >
        <label>
          Month
          <select value={month} onChange={(event) => setMonth(Number(event.target.value))} aria-label="Payroll month">
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                {monthLabel(year, index + 1).replace(` ${year}`, "")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Year
          <input
            aria-label="Payroll year"
            type="number"
            value={year}
            min={2000}
            max={2100}
            onChange={(event) => setYear(Number(event.target.value))}
          />
        </label>
        <button className="primary" type="submit">
          Prepare payroll
        </button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Period</th>
              <th>People</th>
              <th>Gross</th>
              <th>Net</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>
                  <Link to={`/payroll/${run.id}`}>{monthLabel(run.year, run.month)}</Link>
                </td>
                <td>{run.people}</td>
                <td className="num">{inr(run.gross)}</td>
                <td className="num">{inr(run.net)}</td>
                <td>
                  <span className={`pill ${run.status}`}>{statusLabel(run.status)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loaded && runs.length === 0 ? <p className="empty">No payroll runs yet.</p> : null}
      </div>
    </div>
  );
}

export function PayrollRun() {
  const { id } = useParams();
  const { me } = useAuth();
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    api<RunDetail>(`/api/payroll/runs/${id}`)
      .then(setDetail)
      .catch((caught) => setError(caught.message));
  }

  useEffect(() => {
    if (me?.user.role === "admin") load();
  }, [id, me]);

  async function act(path: string) {
    setBusy(true);
    setError("");
    try {
      setDetail(await api<RunDetail>(path, { method: "POST" }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not update the run.");
    } finally {
      setBusy(false);
    }
  }

  if (me && me.user.role !== "admin") return <p className="banner">Payroll is limited to People & Payroll.</p>;
  if (error && !detail) return <p className="banner">{error}</p>;
  if (!detail) return <p className="boot">Adding up the month…</p>;

  return (
    <div className="page">
      <p className="eyebrow">
        <Link to="/payroll">Payroll</Link> / {monthLabel(detail.run.year, detail.run.month)}
      </p>
      <header className="page-head">
        <div>
          <h1>{monthLabel(detail.run.year, detail.run.month)}</h1>
          <p className="lede">
            Net {inr(detail.totals.net)} for {detail.slips.length} people. PF {inr(detail.totals.pf)}, professional tax{" "}
            {inr(detail.totals.professionalTax)}, TDS {inr(detail.totals.tds)}.
          </p>
        </div>
        <span className={`pill ${detail.run.status}`}>{statusLabel(detail.run.status)}</span>
      </header>
      {error ? <p className="banner">{error}</p> : null}
      <div className="actions">
        {detail.run.status === "draft" ? (
          <>
            <button type="button" disabled={busy} onClick={() => act(`/api/payroll/runs/${id}/recalculate`)}>
              Recalculate
            </button>
            <button className="primary" type="button" disabled={busy} onClick={() => act(`/api/payroll/runs/${id}/approve`)}>
              Approve run
            </button>
          </>
        ) : null}
        {detail.run.status === "approved" ? (
          <button className="primary" type="button" disabled={busy} onClick={() => act(`/api/payroll/runs/${id}/pay`)}>
            Mark paid
          </button>
        ) : null}
        <a className="button-link" href={`/api/payroll/runs/${id}/register.csv`}>
          Download register
        </a>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Paid</th>
              <th>LOP</th>
              <th>Gross</th>
              <th>PF</th>
              <th>Tax</th>
              <th>Net</th>
            </tr>
          </thead>
          <tbody>
            {detail.slips.map((slip) => (
              <tr key={slip.id}>
                <td>
                  <Link to={`/payslips/${slip.id}`}>
                    {slip.firstName} {slip.lastName}
                  </Link>
                  <small>{slip.department}</small>
                </td>
                <td>{dayCount(slip.paidDays)}</td>
                <td>{dayCount(slip.lopDays)}</td>
                <td className="num">{inr(slip.grossPayable)}</td>
                <td className="num">{inr(slip.pf)}</td>
                <td className="num">{inr(slip.professionalTax + slip.tds)}</td>
                <td className="num">{inr(slip.netPay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
