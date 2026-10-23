const STAGES = [
  { id: "draft", label: "Draft" },
  { id: "approved", label: "Approved" },
  { id: "paid", label: "Paid" },
];

export function Pipeline({ status }: { status: string }) {
  const index = STAGES.findIndex((stage) => stage.id === status);
  return (
    <ol className="pipeline" aria-label="Payroll pipeline">
      {STAGES.map((stage, position) => (
        <li key={stage.id} className={position < index ? "done" : position === index ? "current" : ""}>
          <b>{stage.label}</b>
        </li>
      ))}
    </ol>
  );
}
