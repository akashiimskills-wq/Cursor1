import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth";
import { Shell } from "./components/Shell";
import { Attendance } from "./pages/Attendance";
import { Dashboard } from "./pages/Dashboard";
import { Holidays } from "./pages/Holidays";
import { Leave } from "./pages/Leave";
import { Login } from "./pages/Login";
import { Payroll, PayrollRun } from "./pages/Payroll";
import { PayslipPage } from "./pages/Payslip";
import { People } from "./pages/People";
import { Person } from "./pages/Person";

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Shell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/people" element={<People />} />
          <Route path="/people/:id" element={<Person />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/leave" element={<Leave />} />
          <Route path="/payroll" element={<Payroll />} />
          <Route path="/payroll/:id" element={<PayrollRun />} />
          <Route path="/payslips/:id" element={<PayslipPage />} />
          <Route path="/holidays" element={<Holidays />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
