import { useEffect, useState } from "react";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { prettyDate } from "../format";

type Holiday = { id: number; date: string; name: string };

export function Holidays() {
  const { me } = useAuth();
  const [year, setYear] = useState(2026);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  function load(nextYear = year) {
    api<{ holidays: Holiday[] }>(`/api/holidays?year=${nextYear}`)
      .then((data) => {
        setHolidays(data.holidays);
        setLoaded(true);
      })
      .catch((caught) => setError(caught.message));
  }

  useEffect(() => {
    if (!me) return;
    setYear(Number(me.today.slice(0, 4)));
    load(Number(me.today.slice(0, 4)));
  }, [me]);

  if (!me) return <p className="boot">Opening the calendar…</p>;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{year}</p>
          <h1>Holidays</h1>
          <p className="lede">A holiday that falls on a weekday is not a working day, so it is not loss of pay and it is not a leave day.</p>
        </div>
      </header>
      {error ? <p className="banner">{error}</p> : null}
      {me.user.role === "admin" ? (
        <form
          className="filters"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setError("");
            try {
              await api("/api/holidays", {
                method: "POST",
                body: JSON.stringify({ date: form.get("date"), name: form.get("name") }),
              });
              event.currentTarget.reset();
              load();
            } catch (caught) {
              setError(caught instanceof ApiError ? caught.message : "Could not add the holiday.");
            }
          }}
        >
          <label>
            Date
            <input name="date" type="date" required />
          </label>
          <label>
            Name
            <input name="name" required placeholder="Company day" />
          </label>
          <button className="primary" type="submit">
            Add holiday
          </button>
        </form>
      ) : null}
      <ul className="holiday-list">
        {holidays.map((holiday) => (
          <li key={holiday.id}>
            <div>
              <b>{holiday.name}</b>
              <span>{prettyDate(holiday.date)}</span>
            </div>
            {me.user.role === "admin" ? (
              <button
                type="button"
                onClick={async () => {
                  await api(`/api/holidays/${holiday.id}`, { method: "DELETE" });
                  load();
                }}
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {loaded && holidays.length === 0 ? <p className="empty">No holidays in {year}.</p> : null}
    </div>
  );
}
