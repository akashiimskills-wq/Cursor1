# Marigold

Marigold is the HRMS for Meridian Goods, a product studio in Kolkata. It covers the people directory, attendance, leave, holidays, and monthly payroll.

Check-in and check-out read the browser’s location once, at the punch. The punch is accepted within 150 m of the Park Street studio. A day already marked work-from-home is exempt. Location is not tracked between punches.

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

`HRMS_ENV` is `development`, `staging`, or `production`. It is returned by `/api/health` and shown in the desk. Anything else is treated as development.

```bash
npm run release
```

That runs the tests, typecheck, and production build, then boots a staging desk on port 4181 (`data/staging.sqlite`) and, only after that smoke passes, a production desk on port 4182 (`data/production.sqlite`). Both stay running on this machine. There is no external host: production here is that local process, not a public URL.

GitHub Actions repeats the same order: tests, then a staging smoke, then a production smoke. The production job does not publish anywhere.
