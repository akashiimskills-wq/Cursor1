import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

type PersonHit = { id: number; firstName: string; lastName: string; code: string; title: string };

const destinations = [
  { label: "Home", to: "/", hint: "Signals and attendance" },
  { label: "Employees", to: "/people", hint: "Directory" },
  { label: "Attendance", to: "/attendance", hint: "Register and geofence" },
  { label: "Leave", to: "/leave", hint: "Requests and balances" },
  { label: "Payroll", to: "/payroll", hint: "Runs and payslips", admin: true },
  { label: "Holidays", to: "/holidays", hint: "Studio calendar" },
];

export function CommandPalette({ open, onClose, onAsk }: { open: boolean; onClose: () => void; onAsk: (question: string) => void }) {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<PersonHit[]>([]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setPeople([]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (term.length < 2) {
      setPeople([]);
      return;
    }
    const timer = window.setTimeout(() => {
      api<{ employees: PersonHit[] }>(`/api/employees?q=${encodeURIComponent(term)}`)
        .then((data) => setPeople(data.employees.slice(0, 5)))
        .catch(() => setPeople([]));
    }, 140);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  if (!open) return null;
  const needle = query.trim().toLowerCase();
  const places = destinations.filter((item) => (!item.admin || me?.user.role === "admin") && (!needle || item.label.toLowerCase().includes(needle)));

  function go(path: string) {
    navigate(path);
    onClose();
  }

  return (
    <div className="palette-back" role="presentation" onMouseDown={onClose}>
      <form
        className="palette"
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          const term = query.trim();
          if (!term) return;
          onAsk(term);
          onClose();
        }}
      >
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search people, jump, or ask the brief"
          aria-label="Command"
        />
        {query.trim() ? (
          <button className="palette-ask" type="submit">
            Ask the brief · {query.trim()}
          </button>
        ) : (
          <p className="palette-hint">Ask a question, or jump to a desk. Ctrl K or ⌘K opens this.</p>
        )}
        {people.length > 0 ? (
          <div className="palette-group">
            <span>People</span>
            {people.map((person) => (
              <button key={person.id} type="button" onClick={() => go(`/people/${person.id}`)}>
                <b>
                  {person.firstName} {person.lastName}
                </b>
                <small>
                  {person.code} · {person.title}
                </small>
              </button>
            ))}
          </div>
        ) : null}
        {places.length > 0 ? (
          <div className="palette-group">
            <span>Go to</span>
            {places.map((place) => (
              <button key={place.to} type="button" onClick={() => go(place.to)}>
                <b>{place.label}</b>
                <small>{place.hint}</small>
              </button>
            ))}
          </div>
        ) : null}
      </form>
    </div>
  );
}
