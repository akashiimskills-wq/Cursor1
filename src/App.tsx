import { FormEvent, useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Clock3,
  FileText,
  Grid2X2,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sparkles,
  Users,
  X,
} from 'lucide-react'

type Page = 'Dashboard' | 'Employees' | 'Attendance' | 'Leave'
type Employee = {
  id: number
  name: string
  role: string
  department: string
  email: string
  status: 'Active' | 'On leave'
  avatar: string
  color: string
}
type Leave = {
  id: number
  employee: string
  initials: string
  type: string
  dates: string
  days: number
  status: 'Pending' | 'Approved' | 'Declined'
  color: string
}

const seedEmployees: Employee[] = [
  { id: 1, name: 'Olivia Martin', role: 'Product Designer', department: 'Design', email: 'olivia@peopleflow.io', status: 'Active', avatar: 'OM', color: '#d8e8df' },
  { id: 2, name: 'Jackson Lee', role: 'Frontend Engineer', department: 'Engineering', email: 'jackson@peopleflow.io', status: 'Active', avatar: 'JL', color: '#e8dfcc' },
  { id: 3, name: 'Sophia Brown', role: 'People Partner', department: 'People', email: 'sophia@peopleflow.io', status: 'On leave', avatar: 'SB', color: '#e3d9e9' },
  { id: 4, name: 'Noah Williams', role: 'Account Executive', department: 'Sales', email: 'noah@peopleflow.io', status: 'Active', avatar: 'NW', color: '#d9e5ed' },
  { id: 5, name: 'Emma Davis', role: 'Marketing Lead', department: 'Marketing', email: 'emma@peopleflow.io', status: 'Active', avatar: 'ED', color: '#f0ddd6' },
  { id: 6, name: 'Liam Wilson', role: 'Backend Engineer', department: 'Engineering', email: 'liam@peopleflow.io', status: 'Active', avatar: 'LW', color: '#dce6d5' },
]

const initialLeaves: Leave[] = [
  { id: 1, employee: 'Sophia Brown', initials: 'SB', type: 'Annual leave', dates: 'Oct 23 – Oct 25', days: 3, status: 'Pending', color: '#e3d9e9' },
  { id: 2, employee: 'Noah Williams', initials: 'NW', type: 'Sick leave', dates: 'Oct 24', days: 1, status: 'Pending', color: '#d9e5ed' },
  { id: 3, employee: 'Emma Davis', initials: 'ED', type: 'Personal leave', dates: 'Oct 28 – Oct 29', days: 2, status: 'Approved', color: '#f0ddd6' },
]

const attendance = [
  { employee: seedEmployees[0], date: 'Today', checkIn: '8:54 AM', checkOut: '—', hours: '7h 06m', state: 'Working' },
  { employee: seedEmployees[1], date: 'Today', checkIn: '9:08 AM', checkOut: '—', hours: '6h 52m', state: 'Working' },
  { employee: seedEmployees[3], date: 'Today', checkIn: '8:47 AM', checkOut: '5:15 PM', hours: '8h 28m', state: 'Complete' },
  { employee: seedEmployees[4], date: 'Today', checkIn: '9:21 AM', checkOut: '—', hours: '6h 39m', state: 'Working' },
  { employee: seedEmployees[5], date: 'Today', checkIn: '8:38 AM', checkOut: '5:04 PM', hours: '8h 26m', state: 'Complete' },
]

const nav: { name: Page; icon: typeof LayoutDashboard }[] = [
  { name: 'Dashboard', icon: LayoutDashboard },
  { name: 'Employees', icon: Users },
  { name: 'Attendance', icon: Clock3 },
  { name: 'Leave', icon: CalendarDays },
]

function Avatar({ initials, color, small = false }: { initials: string; color: string; small?: boolean }) {
  return <span className={`avatar ${small ? 'avatar-small' : ''}`} style={{ background: color }}>{initials}</span>
}

function Status({ children, tone = 'green' }: { children: React.ReactNode; tone?: 'green' | 'amber' | 'gray' | 'red' }) {
  return <span className={`status status-${tone}`}><i />{children}</span>
}

function App() {
  const [page, setPage] = useState<Page>('Dashboard')
  const [mobileNav, setMobileNav] = useState(false)
  const [search, setSearch] = useState('')
  const [employeeModal, setEmployeeModal] = useState(false)
  const [employees, setEmployees] = useState(seedEmployees)
  const [leaves, setLeaves] = useState(initialLeaves)
  const [checkedIn, setCheckedIn] = useState(false)

  const filteredEmployees = useMemo(() => {
    const query = search.toLowerCase()
    return employees.filter((item) => `${item.name} ${item.role} ${item.department}`.toLowerCase().includes(query))
  }, [employees, search])

  const openPage = (next: Page) => {
    setPage(next)
    setSearch('')
    setMobileNav(false)
  }

  const addEmployee = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name'))
    const parts = name.split(' ')
    setEmployees((current) => [
      ...current,
      {
        id: Date.now(),
        name,
        role: String(data.get('role')),
        department: String(data.get('department')),
        email: String(data.get('email')),
        status: 'Active',
        avatar: parts.map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
        color: '#d8e8df',
      },
    ])
    setEmployeeModal(false)
  }

  const updateLeave = (id: number, status: Leave['status']) => {
    setLeaves((items) => items.map((item) => item.id === id ? { ...item, status } : item))
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand"><span className="brand-mark"><Sparkles size={19} /></span><span>PeopleFlow</span></div>
        <button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X /></button>
        <nav>
          <p className="nav-label">Workspace</p>
          {nav.map(({ name, icon: Icon }) => (
            <button className={page === name ? 'nav-item active' : 'nav-item'} onClick={() => openPage(name)} key={name}>
              <Icon size={19} strokeWidth={1.8} /><span>{name}</span>
              {name === 'Leave' && leaves.filter((leave) => leave.status === 'Pending').length > 0 && <b>{leaves.filter((leave) => leave.status === 'Pending').length}</b>}
            </button>
          ))}
          <p className="nav-label nav-label-second">Manage</p>
          <button className="nav-item"><FileText size={19} strokeWidth={1.8} /><span>Documents</span></button>
          <button className="nav-item"><Grid2X2 size={19} strokeWidth={1.8} /><span>Reports</span></button>
          <button className="nav-item"><Settings size={19} strokeWidth={1.8} /><span>Settings</span></button>
        </nav>
        <div className="sidebar-tip">
          <div className="tip-icon"><Sparkles size={17} /></div>
          <strong>Explore People Insights</strong>
          <p>Turn workforce data into better decisions.</p>
          <button>View insights <ChevronRight size={14} /></button>
        </div>
        <div className="profile-card">
          <Avatar initials="AR" color="#d4e6dc" small />
          <div><strong>Alex Rivera</strong><span>Administrator</span></div>
          <MoreHorizontal size={18} />
        </div>
      </aside>
      {mobileNav && <button className="scrim" onClick={() => setMobileNav(false)} aria-label="Close menu" />}

      <main>
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu /></button>
          <div className="global-search"><Search size={18} /><input aria-label="Global search" placeholder="Search people, documents, reports..." /><kbd>⌘ K</kbd></div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Notifications"><Bell size={20} /><i /></button>
            <span className="top-divider" />
            <Avatar initials="AR" color="#d4e6dc" small />
            <ChevronDown size={16} />
          </div>
        </header>

        <div className="content">
          {page === 'Dashboard' && <Dashboard employees={employees} leaves={leaves} onNavigate={openPage} />}
          {page === 'Employees' && (
            <EmployeesPage employees={filteredEmployees} search={search} setSearch={setSearch} onAdd={() => setEmployeeModal(true)} />
          )}
          {page === 'Attendance' && <AttendancePage checkedIn={checkedIn} setCheckedIn={setCheckedIn} />}
          {page === 'Leave' && <LeavePage leaves={leaves} updateLeave={updateLeave} />}
        </div>
      </main>

      {employeeModal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEmployeeModal(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setEmployeeModal(false)}><X size={20} /></button>
            <p className="eyebrow">Team directory</p>
            <h2 id="modal-title">Add a new employee</h2>
            <p className="modal-copy">Create their profile now. You can add employment details later.</p>
            <form onSubmit={addEmployee}>
              <label>Full name<input name="name" placeholder="e.g. Maya Patel" required autoFocus /></label>
              <div className="form-row">
                <label>Role<input name="role" placeholder="Product Manager" required /></label>
                <label>Department<select name="department"><option>Engineering</option><option>Design</option><option>People</option><option>Sales</option><option>Marketing</option><option>Finance</option></select></label>
              </div>
              <label>Work email<input name="email" type="email" placeholder="maya@peopleflow.io" required /></label>
              <div className="modal-actions"><button type="button" className="button-secondary" onClick={() => setEmployeeModal(false)}>Cancel</button><button className="button-primary" type="submit">Add employee</button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

function PageHeading({ eyebrow, title, copy, actions }: { eyebrow: string; title: string; copy: string; actions?: React.ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{copy}</p></div>{actions && <div className="heading-actions">{actions}</div>}</div>
}

function Dashboard({ employees, leaves, onNavigate }: { employees: Employee[]; leaves: Leave[]; onNavigate: (page: Page) => void }) {
  const pending = leaves.filter((leave) => leave.status === 'Pending')
  return <>
    <PageHeading eyebrow="Friday, October 23" title="Good morning, Alex" copy="Here’s what’s happening with your team today." actions={<><button className="button-secondary"><CalendarDays size={17} /> Oct 19 – 25</button><button className="button-primary" onClick={() => onNavigate('Employees')}><Plus size={17} /> Add employee</button></>} />
    <section className="metrics-grid">
      <Metric label="Total employees" value={employees.length + 118} change="+4.2%" note="vs last month" icon={<Users />} color="mint" />
      <Metric label="Present today" value="112" change="94.1%" note="attendance rate" icon={<Clock3 />} color="blue" />
      <Metric label="On leave" value="7" change="-2" note="vs yesterday" icon={<CalendarDays />} color="peach" down />
      <Metric label="Open positions" value="9" change="+3" note="this month" icon={<CircleUserRound />} color="purple" />
    </section>
    <div className="dashboard-grid">
      <section className="panel attendance-card">
        <div className="panel-title"><div><h2>Weekly attendance</h2><p>Daily attendance rate across your organization.</p></div><button className="text-button" onClick={() => onNavigate('Attendance')}>View report <ChevronRight size={15} /></button></div>
        <div className="chart-wrap">
          <div className="chart-y"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
          <div className="bar-chart">
            {[['Mon', 92], ['Tue', 95], ['Wed', 89], ['Thu', 97], ['Fri', 94], ['Sat', 22], ['Sun', 14]].map(([day, height]) => (
              <div className="bar-item" key={day}><div className="bar-track"><div className={`bar ${day === 'Thu' ? 'bar-highlight' : ''}`} style={{ height: `${height}%` }}><span>{height}%</span></div></div><b>{day}</b></div>
            ))}
          </div>
        </div>
        <div className="attendance-summary"><span><i className="legend green" /> Present <b>94.1%</b></span><span><i className="legend tan" /> Absent <b>3.5%</b></span><span><i className="legend gray" /> On leave <b>2.4%</b></span></div>
      </section>
      <section className="panel leave-card">
        <div className="panel-title"><div><h2>Leave requests</h2><p>{pending.length} requests waiting for review.</p></div><button className="text-button" onClick={() => onNavigate('Leave')}>View all <ChevronRight size={15} /></button></div>
        <div className="request-list">
          {pending.map((leave) => <div className="request-row" key={leave.id}><Avatar initials={leave.initials} color={leave.color} /><div className="request-info"><strong>{leave.employee}</strong><span>{leave.type} · {leave.days} {leave.days === 1 ? 'day' : 'days'}</span></div><div className="request-date"><strong>{leave.dates}</strong><Status tone="amber">Pending</Status></div></div>)}
          <div className="request-row"><Avatar initials="ED" color="#f0ddd6" /><div className="request-info"><strong>Emma Davis</strong><span>Remote work · 1 day</span></div><div className="request-date"><strong>Oct 26</strong><Status>Approved</Status></div></div>
        </div>
        <button className="full-button" onClick={() => onNavigate('Leave')}>Review all requests <ChevronRight size={15} /></button>
      </section>
      <section className="panel birthdays-card">
        <div className="panel-title"><div><h2>Upcoming moments</h2><p>Celebrate your people.</p></div><MoreHorizontal size={20} /></div>
        <div className="moment"><span className="date-tile"><b>25</b>OCT</span><Avatar initials="JL" color="#e8dfcc" /><div><strong>Jackson’s birthday</strong><p>Frontend Engineer</p></div><span>In 2 days</span></div>
        <div className="moment"><span className="date-tile"><b>28</b>OCT</span><Avatar initials="OM" color="#d8e8df" /><div><strong>Olivia’s 3-year anniversary</strong><p>Product Designer</p></div><span>In 5 days</span></div>
      </section>
    </div>
  </>
}

function Metric({ label, value, change, note, icon, color, down }: { label: string; value: string | number; change: string; note: string; icon: React.ReactNode; color: string; down?: boolean }) {
  return <article className="metric-card"><div className={`metric-icon ${color}`}>{icon}</div><div className="metric-copy"><p>{label}</p><strong>{value}</strong><span className={down ? 'change down' : 'change'}>{down ? <ArrowDownRight /> : <ArrowUpRight />}{change}</span><small>{note}</small></div><MoreHorizontal className="metric-more" size={19} /></article>
}

function EmployeesPage({ employees, search, setSearch, onAdd }: { employees: Employee[]; search: string; setSearch: (value: string) => void; onAdd: () => void }) {
  return <>
    <PageHeading eyebrow="People" title="Employee directory" copy={`${employees.length} people across your organization.`} actions={<button className="button-primary" onClick={onAdd}><Plus size={17} /> Add employee</button>} />
    <section className="panel table-panel">
      <div className="table-tools"><div className="search-field"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employees..." /></div><button className="button-secondary">All departments <ChevronDown size={16} /></button></div>
      <div className="responsive-table">
        <table><thead><tr><th>Employee</th><th>Department</th><th>Status</th><th>Role</th><th /></tr></thead>
          <tbody>{employees.map((employee) => <tr key={employee.id}><td><div className="employee-cell"><Avatar initials={employee.avatar} color={employee.color} /><div><strong>{employee.name}</strong><span>{employee.email}</span></div></div></td><td>{employee.department}</td><td><Status tone={employee.status === 'Active' ? 'green' : 'amber'}>{employee.status}</Status></td><td>{employee.role}</td><td><button className="table-action"><MoreHorizontal size={18} /></button></td></tr>)}</tbody>
        </table>
        {employees.length === 0 && <div className="empty"><Search size={26} /><strong>No employees found</strong><p>Try a different name or department.</p></div>}
      </div>
    </section>
  </>
}

function AttendancePage({ checkedIn, setCheckedIn }: { checkedIn: boolean; setCheckedIn: (value: boolean) => void }) {
  return <>
    <PageHeading eyebrow="Time & attendance" title="Today’s attendance" copy="Monitor work hours and attendance in real time." actions={<><button className="button-secondary"><CalendarDays size={17} /> Oct 23, 2026</button><button className={checkedIn ? 'button-danger' : 'button-primary'} onClick={() => setCheckedIn(!checkedIn)}><Clock3 size={17} /> {checkedIn ? 'Check out' : 'Check in'}</button></>} />
    {checkedIn && <div className="notice"><span><Check size={17} /></span><div><strong>You checked in at 9:02 AM</strong><p>Your timer is running. Have a productive day!</p></div></div>}
    <section className="mini-metrics"><div><span>Present</span><strong>112</strong><small>of 119 scheduled</small></div><div><span>Late arrivals</span><strong>6</strong><small>5.0% of team</small></div><div><span>On leave</span><strong>7</strong><small>Approved leave</small></div><div><span>Avg. workday</span><strong>8h 12m</strong><small>Last 30 days</small></div></section>
    <section className="panel table-panel">
      <div className="table-tools"><div><h2>Attendance log</h2><p>Live status for today</p></div><div className="search-field compact"><Search size={18} /><input placeholder="Search people..." /></div></div>
      <div className="responsive-table"><table><thead><tr><th>Employee</th><th>Check in</th><th>Check out</th><th>Hours</th><th>Status</th></tr></thead><tbody>
        {attendance.map((row) => <tr key={row.employee.id}><td><div className="employee-cell"><Avatar initials={row.employee.avatar} color={row.employee.color} /><div><strong>{row.employee.name}</strong><span>{row.employee.department}</span></div></div></td><td>{row.checkIn}</td><td>{row.checkOut}</td><td>{row.hours}</td><td><Status tone={row.state === 'Working' ? 'amber' : 'green'}>{row.state}</Status></td></tr>)}
      </tbody></table></div>
    </section>
  </>
}

function LeavePage({ leaves, updateLeave }: { leaves: Leave[]; updateLeave: (id: number, status: Leave['status']) => void }) {
  return <>
    <PageHeading eyebrow="Time off" title="Leave management" copy="Review requests and keep the team calendar in sync." actions={<button className="button-primary"><Plus size={17} /> Request leave</button>} />
    <section className="leave-balance">
      <div><span className="balance-icon green-bg"><CalendarDays /></span><p>Annual leave</p><strong>16 <small>days available</small></strong><div className="progress"><i style={{ width: '42%' }} /></div></div>
      <div><span className="balance-icon blue-bg"><Sparkles /></span><p>Sick leave</p><strong>8 <small>days available</small></strong><div className="progress blue-progress"><i style={{ width: '20%' }} /></div></div>
      <div><span className="balance-icon peach-bg"><Clock3 /></span><p>Personal leave</p><strong>3 <small>days available</small></strong><div className="progress peach-progress"><i style={{ width: '50%' }} /></div></div>
    </section>
    <section className="panel requests-panel">
      <div className="panel-title"><div><h2>Team requests</h2><p>Approve or decline pending time off.</p></div><button className="button-secondary">All requests <ChevronDown size={16} /></button></div>
      <div className="leave-list">
        {leaves.map((leave) => <article key={leave.id}><Avatar initials={leave.initials} color={leave.color} /><div className="leave-person"><strong>{leave.employee}</strong><span>{leave.type}</span></div><div className="leave-dates"><strong>{leave.dates}</strong><span>{leave.days} {leave.days === 1 ? 'day' : 'days'}</span></div><Status tone={leave.status === 'Pending' ? 'amber' : leave.status === 'Approved' ? 'green' : 'red'}>{leave.status}</Status><div className="leave-actions">{leave.status === 'Pending' ? <><button className="decline" onClick={() => updateLeave(leave.id, 'Declined')}><X size={16} /> Decline</button><button className="approve" onClick={() => updateLeave(leave.id, 'Approved')}><Check size={16} /> Approve</button></> : <button className="table-action"><MoreHorizontal size={18} /></button>}</div></article>)}
      </div>
    </section>
  </>
}

export default App
