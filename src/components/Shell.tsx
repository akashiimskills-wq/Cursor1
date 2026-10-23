import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { fullName, useAuth } from "../auth";
import { prettyDate, roleLabel } from "../format";
import { Mark } from "./Mark";

const links = [
  { to: "/", label: "Home", icon: "home", end: true },
  { to: "/people", label: "Employees", icon: "people" },
  { to: "/attendance", label: "Attendance", icon: "clock" },
  { to: "/leave", label: "Leave", icon: "leave" },
  { to: "/payroll", label: "Payroll", icon: "pay", admin: true },
  { to: "/holidays", label: "Holidays", icon: "calendar" },
];

export function Shell() {
  const { me, loading, signOut } = useAuth();
  const navigate = useNavigate();

  if (loading) return <p className="boot">Opening Marigold…</p>;
  if (!me) return <Navigate to="/login" replace />;

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <Mark size={28} />
          <div>
            <strong>Marigold</strong>
            <span>HRMS</span>
          </div>
        </div>
        <nav>
          {links
            .filter((link) => !link.admin || me.user.role === "admin")
            .map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => (isActive ? "active" : "")}>
                <Icon name={link.icon} />
                {link.label}
              </NavLink>
            ))}
        </nav>
        <div className="who">
          <b>{fullName(me.user)}</b>
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
      <div className="workspace">
        <header className="topbar">
          <div>
            <strong>{me.company.legalName}</strong>
            <span>{prettyDate(me.today)}</span>
          </div>
          <span className="topbar-role">{roleLabel(me.user.role)}</span>
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      {name === "home" ? <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" /> : null}
      {name === "people" ? (
        <>
          <path d="M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1" />
          <circle cx="10" cy="8" r="3" />
          <path d="M20 19v-1a3.2 3.2 0 0 0-2.4-3.1M16 5.2a3 3 0 0 1 0 5.6" />
        </>
      ) : null}
      {name === "clock" ? (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v5l3 2" />
        </>
      ) : null}
      {name === "leave" ? (
        <>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16" />
        </>
      ) : null}
      {name === "pay" ? (
        <>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M3 10h18M7 15h4" />
        </>
      ) : null}
      {name === "calendar" ? (
        <>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01" />
        </>
      ) : null}
    </svg>
  );
}
