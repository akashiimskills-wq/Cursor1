import { useState } from "react";
import { Navigate } from "react-router-dom";
import { ApiError } from "../api";
import { useAuth } from "../auth";
import { Mark } from "../components/Mark";

const desks = [
  { name: "Priya Shah", role: "People & Payroll", email: "priya.shah@meridian.example" },
  { name: "Arjun Mehta", role: "Engineering manager", email: "arjun.mehta@meridian.example" },
  { name: "Leela Nair", role: "Senior engineer", email: "leela.nair@meridian.example" },
];

export function Login() {
  const { me, loading, signIn } = useAuth();
  const [email, setEmail] = useState(desks[0].email);
  const [password, setPassword] = useState("marigold-demo");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return <p className="boot">Opening the studio books…</p>;
  if (me) return <Navigate to="/" replace />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(email, password);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login-story">
        <div>
          <Mark size={36} />
          <p className="eyebrow">Meridian Goods</p>
          <h1>Marigold HRMS</h1>
          <p>Employees, attendance, leave, and payroll in one workspace.</p>
          <ul className="login-index">
            <li>Employee directory</li>
            <li>Geofenced attendance</li>
            <li>Leave approvals</li>
            <li>Payroll and payslips</li>
          </ul>
        </div>
        <p className="letterfoot">
          Meridian Goods Pvt Ltd
          <br />
          18 Park Street, Kolkata 700016
        </p>
      </section>
      <section className="login-panel">
        <p className="eyebrow">Desk</p>
        <h2>Sign in</h2>
        <p className="lede">Sample password for every desk: marigold-demo.</p>
        <div className="desks">
          {desks.map((desk) => (
            <button
              key={desk.email}
              type="button"
              className={email === desk.email ? "desk selected" : "desk"}
              onClick={() => {
                setEmail(desk.email);
                setPassword("marigold-demo");
                setError("");
              }}
            >
              <b>{desk.name}</b>
              <span>{desk.role}</span>
            </button>
          ))}
        </div>
        <form onSubmit={submit}>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" type="email" required />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              type="password"
              required
            />
          </label>
          {error ? (
            <p className="banner" role="alert">
              {error}
            </p>
          ) : null}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </div>
  );
}
