# Marigold

Marigold is the HRMS for Meridian Goods, a product studio in Kolkata. It covers the people directory, attendance, leave, holidays, and monthly payroll.

Payroll is calculated in integer paise:

- Earnings are prorated for days actually in service and for loss of pay.
- Unmarked working days, absences, half days, and approved unpaid leave become loss of pay. Future days in the current month do not.
- Provident fund is 12% of earned basic, capped at a ₹15,000 wage.
- Professional tax follows the company slab.
- TDS is an illustrative new-regime estimate (₹75,000 standard deduction, rebate through ₹12 lakh, slab rates, 4% cess). It is not tax advice.

## Run it

```bash
npm ci
npm run dev
```

Open http://localhost:5173. Sample password for every desk: `marigold-demo`.

| Desk | Email | Can do |
| --- | --- | --- |
| Priya Shah | priya.shah@meridian.example | Payroll, people, the attendance register |
| Arjun Mehta | arjun.mehta@meridian.example | Approve his team's leave |
| Leela Nair | leela.nair@meridian.example | Her own attendance, leave, and payslips |

```bash
npm test
npm run typecheck
```

The database is created at `data/marigold.sqlite` on first launch. Set `HRMS_DB` to use another file. `npm start` serves a production build from `dist/` after `npm run build`.
