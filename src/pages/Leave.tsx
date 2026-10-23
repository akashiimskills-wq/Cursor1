import { useEffect, useState } from "react";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { prettyDate, statusLabel } from "../format";
import type { LeaveRequest } from "../types";

type Meta = {
  year: number;
  types: { id: number; name: string; annualQuota: number | null; paid: number }[];
  balances: { leaveTypeId: number; name: string; paid: number; allocated: number; used: number }[];
};

export function Leave() {
  const { me } = useAuth();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [mine, setMine] = useState<LeaveRequest[]>([]);
  const [queue, setQueue] = useState<LeaveRequest[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function load() {
    api<Meta>("/api/leave/meta").then(setMeta).catch((caught) => setError(caught.message));
    api<{ requests: LeaveRequest[] }>("/api/leave/requests?scope=mine")
      .then((data) => setMine(data.requests))
      .catch((caught) => setError(caught.message));
    if (me && me.user.role !== "employee") {
      api<{ requests: LeaveRequest[] }>("/api/leave/requests?scope=queue")
        .then((data) => setQueue(data.requests))
        .catch((caught) => setError(caught.message));
    }
  }

  useEffect(() => {
    if (me) load();
  }, [me]);

  if (!meta || !me) return <p className="boot">Opening leave…</p>;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{meta.year}</p>
          <h1>Leave</h1>
          <p className="lede">Requests count working days only. Weekends and holidays are skipped. Approval writes the day onto the register.</p>
        </div>
      </header>
      {error ? <p className="banner">{error}</p> : null}
      {notice ? <p className="note">{notice}</p> : null}
      <div className="stats slim">
        {meta.balances.map((balance) => (
          <article key={balance.leaveTypeId}>
            <span>{balance.name}</span>
            <strong>{balance.paid ? balance.allocated - balance.used : "∞"}</strong>
            <em>{balance.paid ? `of ${balance.allocated} remaining` : "unpaid days"}</em>
          </article>
        ))}
      </div>
      <div className="split">
        <section className="card">
          <h2>Request leave</h2>
          <form
            className="stack"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setError("");
              try {
                const result = await api<{ request: LeaveRequest }>("/api/leave/requests", {
                  method: "POST",
                  body: JSON.stringify({
                    leaveTypeId: Number(form.get("leaveTypeId")),
                    startDate: form.get("startDate"),
                    endDate: form.get("endDate"),
                    reason: form.get("reason"),
                  }),
                });
                setNotice(`Requested ${result.request.days} ${result.request.leaveType.toLowerCase()} day${result.request.days === 1 ? "" : "s"}.`);
                event.currentTarget.reset();
                load();
              } catch (caught) {
                setError(caught instanceof ApiError ? caught.message : "Could not request leave.");
              }
            }}
          >
            <label>
              Type
              <select name="leaveTypeId" defaultValue={meta.types[0]?.id}>
                {meta.types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="pair">
              <label>
                From
                <input name="startDate" type="date" required />
              </label>
              <label>
                To
                <input name="endDate" type="date" required />
              </label>
            </div>
            <label>
              Reason
              <textarea name="reason" required minLength={3} rows={3} placeholder="Where you’ll be, and who is covering" />
            </label>
            <button className="primary" type="submit">
              Submit request
            </button>
          </form>
        </section>
        <section className="card">
          <h2>{me.user.role === "employee" ? "Your requests" : "Waiting on you"}</h2>
          <RequestList
            requests={me.user.role === "employee" ? mine : queue}
            canDecide={me.user.role !== "employee"}
            onDecided={(message) => {
              setNotice(message);
              load();
            }}
            onError={setError}
          />
        </section>
      </div>
      {me.user.role !== "employee" ? (
        <section className="card">
          <h2>Your own requests</h2>
          <RequestList requests={mine} canDecide={false} onDecided={() => undefined} onError={setError} />
        </section>
      ) : null}
    </div>
  );
}

function RequestList({
  requests,
  canDecide,
  onDecided,
  onError,
}: {
  requests: LeaveRequest[];
  canDecide: boolean;
  onDecided: (message: string) => void;
  onError: (message: string) => void;
}) {
  if (requests.length === 0) return <p className="empty">Nothing here.</p>;
  return (
    <ul className="requests">
      {requests.map((request) => (
        <li key={request.id}>
          <div>
            <b>
              {request.employeeName} · {request.leaveType}
            </b>
            <span>
              {prettyDate(request.startDate)} – {prettyDate(request.endDate)} · {request.days} day{request.days === 1 ? "" : "s"}
            </span>
            <p>{request.reason}</p>
            {request.reviewNote ? <small>Note: {request.reviewNote}</small> : null}
          </div>
          <div className="request-actions">
            <span className={`pill ${request.status}`}>{statusLabel(request.status)}</span>
            {canDecide && request.status === "pending" ? (
              <>
                <button
                  type="button"
                  className="primary"
                  onClick={() => decide(request.id, "approve", onDecided, onError)}
                >
                  Approve
                </button>
                <button type="button" onClick={() => decide(request.id, "reject", onDecided, onError)}>
                  Reject
                </button>
              </>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

async function decide(
  id: number,
  decision: "approve" | "reject",
  onDecided: (message: string) => void,
  onError: (message: string) => void,
) {
  try {
    await api(`/api/leave/requests/${id}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
    onDecided(decision === "approve" ? "Leave approved and written onto the register." : "Leave rejected.");
  } catch (caught) {
    onError(caught instanceof ApiError ? caught.message : "Could not update the request.");
  }
}
