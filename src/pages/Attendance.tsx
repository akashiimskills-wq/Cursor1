import { useEffect, useState } from "react";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { PunchCard } from "../components/PunchCard";
import { kolkataTime, prettyDate, statusLabel } from "../format";
import type { Employee } from "../types";

type Point = { at: string; distanceM: number };
type Entry = { employee: Employee; status: string | null; checkIn: Point | null; checkOut: Point | null };
type Board = { date: string; workingDay: boolean; holidayName: string | null; entries: Entry[] };

const options = ["present", "wfh", "half_day", "leave", "absent"];

export function Attendance() {
  const { me } = useAuth();
  const [date, setDate] = useState("");
  const [board, setBoard] = useState<Board | null>(null);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (me && !date) setDate(me.today);
  }, [me, date]);

  function load(nextDate = date) {
    if (!nextDate) return;
    api<Board>(`/api/attendance?date=${nextDate}`)
      .then((data) => {
        setBoard(data);
        const next: Record<number, string> = {};
        for (const entry of data.entries) next[entry.employee.id] = entry.status ?? "";
        setDraft(next);
      })
      .catch((caught) => setError(caught.message));
  }

  useEffect(() => {
    load(date);
  }, [date]);

  async function save() {
    if (!board) return;
    const entries = board.entries
      .filter((entry) => draft[entry.employee.id])
      .map((entry) => ({ employeeId: entry.employee.id, status: draft[entry.employee.id] }));
    if (entries.length === 0) {
      setError("Choose a status before saving.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await api<Board>("/api/attendance", {
        method: "PUT",
        body: JSON.stringify({ date: board.date, entries }),
      });
      setBoard(data);
      setNotice(`Saved ${entries.length} ${entries.length === 1 ? "row" : "rows"} for ${prettyDate(board.date)}.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save the register.");
    } finally {
      setBusy(false);
    }
  }

  if (!board || !me) return <p className="boot">Opening the register…</p>;
  const counts = countStatuses(board.entries);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Time</p>
          <h1>Attendance</h1>
          <p className="lede">
            {board.holidayName
              ? `${board.holidayName} is a holiday.`
              : board.workingDay
                ? "Unmarked working days count as absence when payroll is prepared."
                : "Weekends are outside the working-day count."}
          </p>
        </div>
        <label className="date-label">
          Date
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
      </header>
      <PunchCard onPunched={() => load(date)} />
      <div className="chips">
        <span>{counts.present} present</span>
        <span>{counts.absent} absent</span>
        <span>{counts.unmarked} unmarked</span>
      </div>
      {error ? <p className="banner">{error}</p> : null}
      {notice ? <p className="note">{notice}</p> : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Department</th>
              <th>In</th>
              <th>Out</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {board.entries.map((entry) => (
              <tr key={entry.employee.id}>
                <td>
                  {entry.employee.firstName} {entry.employee.lastName}
                  <small>{entry.employee.code}</small>
                </td>
                <td>{entry.employee.department}</td>
                <td>{entry.checkIn ? kolkataTime(entry.checkIn.at) : "—"}</td>
                <td>{entry.checkOut ? kolkataTime(entry.checkOut.at) : "—"}</td>
                <td>
                  {me.user.role === "manager" ? (
                    statusLabel(entry.status || "unmarked")
                  ) : (
                    <select
                      aria-label={`Status for ${entry.employee.firstName} ${entry.employee.lastName}`}
                      value={draft[entry.employee.id] ?? ""}
                      onChange={(event) => setDraft({ ...draft, [entry.employee.id]: event.target.value })}
                    >
                      <option value="">Unmarked</option>
                      {options.map((option) => (
                        <option key={option} value={option}>
                          {statusLabel(option)}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {me.user.role !== "manager" ? (
        <button className="primary" type="button" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save register"}
        </button>
      ) : (
        <p className="footnote">Managers can read the register. People & Payroll marks it, and each person can mark their own today.</p>
      )}
    </div>
  );
}

function countStatuses(entries: Entry[]) {
  let present = 0;
  let absent = 0;
  let unmarked = 0;
  for (const entry of entries) {
    if (!entry.status) unmarked += 1;
    else if (entry.status === "absent") absent += 1;
    else present += 1;
  }
  return { present, absent, unmarked };
}
