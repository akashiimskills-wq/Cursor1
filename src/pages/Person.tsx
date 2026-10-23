import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { inr, monthLabel, prettyDate, rupees, statusLabel } from "../format";
import type { Compensation, Employee } from "../types";

type Profile = {
  employee: Employee;
  reports: { id: number; code: string; name: string }[];
  balances: { id: number; name: string; paid: number; allocated: number; used: number }[];
  compensation: Compensation | null;
  payslips: { id: number; year: number; month: number; status: string; netPay: number; grossPayable: number }[];
};

export function Person() {
  const { id } = useParams();
  const { me } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function load() {
    api<Profile>(`/api/employees/${id}`)
      .then(setProfile)
      .catch((caught) => setError(caught.message));
  }

  useEffect(() => {
    load();
  }, [id]);

  if (error) return <p className="banner">{error}</p>;
  if (!profile || !me) return <p className="boot">Opening the file…</p>;
  const person = profile.employee;
  const admin = me.user.role === "admin";

  return (
    <div className="page">
      <p className="eyebrow">
        <Link to="/people">People</Link> / {person.code}
      </p>
      <header className="page-head">
        <div>
          <h1>
            {person.firstName} {person.lastName}
          </h1>
          <p className="lede">
            {person.title}, {person.department}. {person.managerName ? `Reports to ${person.managerName}.` : "No manager on file."}
          </p>
        </div>
        <span className={`pill ${person.status}`}>{statusLabel(person.status)}</span>
      </header>
      {notice ? <p className="note">{notice}</p> : null}
      <div className="facts">
        <Fact label="Email" value={person.email} />
        <Fact label="Phone" value={person.phone || "—"} />
        <Fact label="City" value={person.city || "—"} />
        <Fact label="Joined" value={prettyDate(person.hireDate)} />
        <Fact label="Type" value={statusLabel(person.employmentType)} />
        {person.panMasked != null ? <Fact label="PAN" value={person.panMasked || "—"} /> : null}
        {person.bankName != null || person.bankLast4 != null ? (
          <Fact label="Bank" value={person.bankLast4 ? `${person.bankName} ····${person.bankLast4}` : person.bankName || "—"} />
        ) : null}
        <Fact label="Exit" value={person.exitDate ? prettyDate(person.exitDate) : "—"} />
      </div>

      <div className="split">
        <section className="card">
          <h2>Direct reports</h2>
          {profile.reports.length === 0 ? <p className="empty">No one reports here.</p> : null}
          <ul className="plain">
            {profile.reports.map((report) => (
              <li key={report.id}>
                <Link to={`/people/${report.id}`}>{report.name}</Link>
                <span>{report.code}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2>Leave this year</h2>
          {profile.balances.length === 0 ? <p className="empty">Balances are visible to the person, their manager, and payroll.</p> : null}
          <ul className="plain">
            {profile.balances.map((balance) => (
              <li key={balance.name}>
                <b>{balance.name}</b>
                <span>
                  {balance.paid ? `${balance.allocated - balance.used} of ${balance.allocated} left` : "Unpaid, no quota"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {profile.compensation ? (
        <section className="card">
          <div className="card-head">
            <h2>Monthly compensation</h2>
            <span>Effective {prettyDate(profile.compensation.effectiveFrom)}</span>
          </div>
          <div className="money-grid">
            <Fact label="Basic" value={inr(profile.compensation.basic)} />
            <Fact label="HRA" value={inr(profile.compensation.hra)} />
            <Fact label="Special allowance" value={inr(profile.compensation.specialAllowance)} />
            <Fact label="Conveyance" value={inr(profile.compensation.conveyance)} />
            <Fact label="Medical" value={inr(profile.compensation.medical)} />
            <Fact label="Monthly gross" value={inr(profile.compensation.total)} />
          </div>
          {admin ? (
            <CompensationForm
              employeeId={person.id}
              compensation={profile.compensation}
              onSaved={(message) => {
                setNotice(message);
                load();
              }}
            />
          ) : null}
        </section>
      ) : null}

      {profile.payslips.length > 0 ? (
        <section className="card">
          <h2>Payslips</h2>
          <ul className="plain">
            {profile.payslips.map((slip) => (
              <li key={slip.id}>
                <Link to={`/payslips/${slip.id}`}>{monthLabel(slip.year, slip.month)}</Link>
                <span>
                  Net {inr(slip.netPay)} · {statusLabel(slip.status)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function CompensationForm({
  employeeId,
  compensation,
  onSaved,
}: {
  employeeId: number;
  compensation: Compensation;
  onSaved: (message: string) => void;
}) {
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      basic: Number(form.get("basic")),
      hra: Number(form.get("hra")),
      specialAllowance: Number(form.get("specialAllowance")),
      conveyance: Number(form.get("conveyance")),
      medical: Number(form.get("medical")),
      effectiveFrom: form.get("effectiveFrom"),
    };
    try {
      await api(`/api/employees/${employeeId}/compensation`, { method: "PUT", body: JSON.stringify(body) });
      setError("");
      onSaved("Compensation updated. Recalculate any draft payroll that should pick this up.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save compensation.");
    }
  }

  return (
    <form className="comp-form" key={`${compensation.effectiveFrom}-${compensation.total}`} onSubmit={submit}>
      <div className="pair">
        <Money name="basic" label="Basic (₹)" value={rupees(compensation.basic)} />
        <Money name="hra" label="HRA (₹)" value={rupees(compensation.hra)} />
        <Money name="specialAllowance" label="Special (₹)" value={rupees(compensation.specialAllowance)} />
        <Money name="conveyance" label="Conveyance (₹)" value={rupees(compensation.conveyance)} />
        <Money name="medical" label="Medical (₹)" value={rupees(compensation.medical)} />
        <label>
          Effective from
          <input name="effectiveFrom" type="date" defaultValue={compensation.effectiveFrom} required />
        </label>
      </div>
      {error ? <p className="banner">{error}</p> : null}
      <button type="submit">Save compensation</button>
    </form>
  );
}

function Money({ name, label, value }: { name: string; label: string; value: number }) {
  return (
    <label>
      {label}
      <input name={name} type="number" min={0} step={1} defaultValue={value} required />
    </label>
  );
}
