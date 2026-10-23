export type Role = "admin" | "manager" | "employee";

export type SessionUser = {
  id: number;
  email: string;
  role: Role;
  employeeId: number;
  firstName: string;
  lastName: string;
  code: string;
};

export type Company = {
  product: string;
  name: string;
  legalName: string;
  address: string;
};

export type Me = {
  user: SessionUser;
  company: Company;
  today: string;
  env: "development" | "staging" | "production";
};

export type Employee = {
  id: number;
  code: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  departmentId: number;
  department: string;
  positionId: number;
  title: string;
  grade: string;
  managerId: number | null;
  managerName: string | null;
  hireDate: string;
  exitDate: string | null;
  status: "active" | "on_leave" | "exited";
  employmentType: "full_time" | "contract";
  city: string;
  bankName: string | null;
  bankLast4: string | null;
  panMasked: string | null;
};

export type Compensation = {
  basic: number;
  hra: number;
  specialAllowance: number;
  conveyance: number;
  medical: number;
  total: number;
  effectiveFrom: string;
};

export type LeaveRequest = {
  id: number;
  employeeId: number;
  employeeName: string;
  code: string;
  leaveTypeId: number;
  leaveType: string;
  paid: boolean;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewNote: string;
  reviewedAt: string | null;
};

export type Payslip = {
  id: number;
  employeeId: number;
  code: string;
  firstName: string;
  lastName: string;
  department: string;
  workingDays: number;
  employedDays: number;
  paidDays: number;
  lopDays: number;
  unmarked: number;
  earned: Record<"basic" | "hra" | "specialAllowance" | "conveyance" | "medical", number>;
  contract: Record<"basic" | "hra" | "specialAllowance" | "conveyance" | "medical", number>;
  grossPayable: number;
  pf: number;
  professionalTax: number;
  tds: number;
  netPay: number;
  note: string;
  year?: number;
  month?: number;
  runStatus?: string;
  paidAt?: string | null;
  hireDate?: string;
  panMasked?: string;
  bankName?: string;
  bankLast4?: string;
  title?: string;
};
