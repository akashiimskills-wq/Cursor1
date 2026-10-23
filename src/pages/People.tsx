import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { Avatar } from "../components/Avatar";
import { Modal } from "../components/Modal";
import { prettyDate, statusLabel } from "../format";
import type { Employee } from "../types";

type Position = { id: number; departmentId: number; department: string; title: string; grade: string };
type Department = { id: number; name: string };

export function People() {
  const { me } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const [draft, setDraft] = useState(query);
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  function load() {
    const search = new URLSearchParams();
    if (query.trim()) search.set("q", query.trim());
    if (departmentId) search.set("departmentId", departmentId);
    if (status) search.set("status", status);
    api<{ employees: Employee[] }>(`/api/employees?${search}`)
      .then((data) => {
        setEmployees(data.employees);
        setLoaded(true);
      })
      .catch((caught) => setError(caught.message));
  }

  useEffect(() => {
    setDraft(query);
  }, [query]);

  useEffect(() => {
    load();
  }, [query, departmentId, status]);

  useEffect(() => {
    api<{ departments: Department[] }>("/api/departments").then((data) => setDepartments(data.departments));
    if (me?.user.role === "admin") {
      api<{ positions: Position[] }>("/api/positions").then((data) => setPositions(data.positions));
    }
  }, [me]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Directory</p>
          <h1>Employees</h1>
          <p className="lede">Everyone on the Meridian books, with the role that drives their starting salary.</p>
        </div>
        {me?.user.role === "admin" ? (
          <button className="primary" type="button" onClick={() => setOpen(true)}>
            Add a person
          </button>
        ) : null}
      </header>
      <form
        className="filters"
        onSubmit={(event) => {
          event.preventDefault();
          const next = new URLSearchParams(params);
          const term = draft.trim();
          if (term) next.set("q", term);
          else next.delete("q");
          setParams(next);
        }}
      >
        <label>
          Search
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Name, email, or code"
            aria-label="Search people"
          />
        </label>
        <label>
          Department
          <select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} aria-label="Filter by department">
            <option value="">All departments</option>
            {(departments.length ? departments : uniqueDepartments(employees)).map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="on_leave">On leave</option>
            <option value="exited">Exited</option>
          </select>
        </label>
        <button type="submit">Search</button>
      </form>
      {error ? <p className="banner">{error}</p> : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Department</th>
              <th>Manager</th>
              <th>Joined</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((person) => (
              <tr key={person.id}>
                <td>
                  <div className="person-cell">
                    <Avatar name={`${person.firstName} ${person.lastName}`} />
                    <div>
                      <Link to={`/people/${person.id}`}>
                        {person.firstName} {person.lastName}
                      </Link>
                      <small>
                        {person.code} · {person.city || "—"}
                      </small>
                    </div>
                  </div>
                </td>
                <td>{person.title}</td>
                <td>{person.department}</td>
                <td>{person.managerName || "—"}</td>
                <td>{prettyDate(person.hireDate)}</td>
                <td>
                  <span className={`pill ${person.status}`}>{statusLabel(person.status)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loaded && employees.length === 0 ? <p className="empty">No one matches that search.</p> : null}
        {!loaded && !error ? <p className="boot">Opening the directory…</p> : null}
      </div>
      {open ? (
        <AddPerson
          departments={departments}
          positions={positions}
          managers={employees.filter((person) => person.status !== "exited")}
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function uniqueDepartments(employees: Employee[]): Department[] {
  const map = new Map<number, string>();
  for (const person of employees) map.set(person.departmentId, person.department);
  return [...map.entries()].map(([id, name]) => ({ id, name }));
}

function AddPerson({
  departments,
  positions,
  managers,
  onClose,
  onCreated,
}: {
  departments: Department[];
  positions: Position[];
  managers: Employee[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? 0);
  const roles = positions.filter((position) => position.departmentId === departmentId);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/api/employees", {
        method: "POST",
        body: JSON.stringify({
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          email: form.get("email"),
          phone: form.get("phone"),
          city: form.get("city"),
          departmentId: Number(form.get("departmentId")),
          positionId: Number(form.get("positionId")),
          managerId: form.get("managerId") ? Number(form.get("managerId")) : null,
          hireDate: form.get("hireDate"),
          employmentType: form.get("employmentType"),
          createLogin: form.get("createLogin") === "on",
        }),
      });
      onCreated();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not add this person.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Add a person" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="pair">
          <label>
            First name
            <input name="firstName" required />
          </label>
          <label>
            Last name
            <input name="lastName" required />
          </label>
        </div>
        <label>
          Email
          <input name="email" type="email" required placeholder="name@meridian.example" />
        </label>
        <div className="pair">
          <label>
            Phone
            <input name="phone" />
          </label>
          <label>
            City
            <input name="city" defaultValue="Kolkata" />
          </label>
        </div>
        <div className="pair">
          <label>
            Department
            <select
              name="departmentId"
              value={departmentId}
              onChange={(event) => setDepartmentId(Number(event.target.value))}
            >
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Role
            <select name="positionId" key={departmentId} defaultValue={roles[0]?.id}>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="pair">
          <label>
            Manager
            <select name="managerId" defaultValue="">
              <option value="">No manager</option>
              {managers.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.firstName} {person.lastName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Joined
            <input name="hireDate" type="date" required defaultValue="2026-10-23" />
          </label>
        </div>
        <label>
          Employment
          <select name="employmentType" defaultValue="full_time">
            <option value="full_time">Full time</option>
            <option value="contract">Contract</option>
          </select>
        </label>
        <label className="check">
          <input name="createLogin" type="checkbox" />
          Create a sign-in with the sample password
        </label>
        {error ? <p className="banner">{error}</p> : null}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Add to the books"}
        </button>
      </form>
    </Modal>
  );
}
