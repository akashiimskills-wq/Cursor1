import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { dayCount, inr, inrWords, monthLabel, prettyDate, statusLabel } from "../format";
import type { Company, Payslip } from "../types";

const lines = [
  ["basic", "Basic"],
  ["hra", "House rent allowance"],
  ["specialAllowance", "Special allowance"],
  ["conveyance", "Conveyance"],
  ["medical", "Medical"],
] as const;

export function PayslipPage() {
  const { id } = useParams();
  const [payload, setPayload] = useState<{ company: Company; payslip: Payslip } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ company: Company; payslip: Payslip }>(`/api/payslips/${id}`)
      .then(setPayload)
      .catch((caught) => setError(caught.message));
  }, [id]);

  if (error) return <p className="banner">{error}</p>;
  if (!payload) return <p className="boot">Fetching the slip…</p>;
  const { company, payslip } = payload;
  const deductions = payslip.pf + payslip.professionalTax + payslip.tds;

  return (
    <div className="page">
      <p className="eyebrow no-print">
        <Link to={`/people/${payslip.employeeId}`}>
          {payslip.firstName} {payslip.lastName}
        </Link>{" "}
        / Slip {payslip.id}
      </p>
      <article className="slip">
        <header>
          <div>
            <p className="eyebrow">{company.product}</p>
            <h1>{company.legalName}</h1>
            <p>{company.address}</p>
          </div>
          <div className="slip-period">
            <span>Salary slip</span>
            <strong>{monthLabel(payslip.year || 0, payslip.month || 1)}</strong>
            <em>{statusLabel(payslip.runStatus || "draft")}</em>
          </div>
        </header>
        <dl className="slip-meta">
          <div>
            <dt>Employee</dt>
            <dd>
              {payslip.firstName} {payslip.lastName}
            </dd>
          </div>
          <div>
            <dt>Code</dt>
            <dd>{payslip.code}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{payslip.title}</dd>
          </div>
          <div>
            <dt>Department</dt>
            <dd>{payslip.department}</dd>
          </div>
          <div>
            <dt>PAN</dt>
            <dd>{payslip.panMasked || "—"}</dd>
          </div>
          <div>
            <dt>Bank</dt>
            <dd>{payslip.bankLast4 ? `${payslip.bankName} ····${payslip.bankLast4}` : "—"}</dd>
          </div>
          <div>
            <dt>Paid days</dt>
            <dd>
              {dayCount(payslip.paidDays)} of {payslip.workingDays}
            </dd>
          </div>
          <div>
            <dt>Loss of pay</dt>
            <dd>{dayCount(payslip.lopDays)}</dd>
          </div>
        </dl>
        <div className="slip-columns">
          <table>
            <caption>Earnings</caption>
            <tbody>
              {lines.map(([key, label]) => (
                <tr key={key}>
                  <th>{label}</th>
                  <td>{inr(payslip.earned[key])}</td>
                </tr>
              ))}
              <tr className="total">
                <th>Gross earnings</th>
                <td>{inr(payslip.grossPayable)}</td>
              </tr>
            </tbody>
          </table>
          <table>
            <caption>Deductions</caption>
            <tbody>
              <tr>
                <th>Provident fund (12% of basic, capped)</th>
                <td>{inr(payslip.pf)}</td>
              </tr>
              <tr>
                <th>Professional tax</th>
                <td>{inr(payslip.professionalTax)}</td>
              </tr>
              <tr>
                <th>Estimated TDS</th>
                <td>{inr(payslip.tds)}</td>
              </tr>
              <tr className="total">
                <th>Total deductions</th>
                <td>{inr(deductions)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="net">
          <span>Net pay</span>
          <strong>{inr(payslip.netPay)}</strong>
        </p>
        <p className="words">{inrWords(payslip.netPay)}</p>
        {payslip.note ? <p className="note">{payslip.note}</p> : null}
        <p className="footnote">
          Joined {payslip.hireDate ? prettyDate(payslip.hireDate) : "—"}. TDS is an illustrative new-regime estimate with a ₹75,000
          standard deduction, rebate through ₹12 lakh, and 4% cess. It is not tax advice.
        </p>
        <button className="no-print" type="button" onClick={() => window.print()}>
          Print slip
        </button>
      </article>
    </div>
  );
}
