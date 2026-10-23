import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { fullName, useAuth } from "../auth";
import { roleLabel } from "../format";
import { Mark } from "./Mark";

const links = [
  { to: "/", label: "Today", end: true },
  { to: "/people", label: "People" },
  { to: "/attendance", label: "Attendance" },
  { to: "/leave", label: "Leave" },
  { to: "/payroll", label: "Payroll", admin: true },
  { to: "/holidays", label: "Holidays" },
];

export function Shell() {
  const { me, loading, signOut } = useAuth();
  const navigate = useNavigate();

  if (loading) return <p className="boot">Opening the studio books…</p>;
  if (!me) return <Navigate to="/login" replace />;

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <Mark />
          <div>
            <strong>Marigold</strong>
            <span>{me.company.name}</span>
          </div>
        </div>
        <nav>
          {links
            .filter((link) => !link.admin || me.user.role === "admin")
            .map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => (isActive ? "active" : "")}>
                {link.label}
              </NavLink>
            ))}
        </nav>
        <div className="who">
          <b>
            {fullName(me.user)}
          </b>
          <span>
            {me.user.code} · {roleLabel(me.user.role)}
          </span>
          <button
            type="button"
            onClick={() => {
              signOut().then(() => navigate("/login"));
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
