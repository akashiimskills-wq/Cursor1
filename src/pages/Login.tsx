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
        <Mark size={54} />
        <p className="eyebrow">Meridian Goods · Kolkata</p>
        <h1>Pay people properly.</h1>
        <p>
          Marigold keeps the studio’s people, attendance, leave, and monthly payroll in one set of books. Salaries,
          provident fund, professional tax, and estimated TDS are calculated from the register, not from a spreadsheet.
        </p>
      </section>
      <section className="login-panel">
        <h2>Sign in</h2>
        <p className="lede">The sample password for every desk is marigold-demo.</p>
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
            {busy ? "Checking…" : "Enter Marigold"}
          </button>
        </form>
      </section>
    </div>
  );
}
