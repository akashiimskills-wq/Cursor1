export function Mark({ size = 32 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#e2a12f" />
      <g fill="#fff8ea">
        <ellipse cx="32" cy="15" rx="6.5" ry="11" />
        <ellipse cx="32" cy="15" rx="6.5" ry="11" transform="rotate(45 32 32)" />
        <ellipse cx="32" cy="15" rx="6.5" ry="11" transform="rotate(90 32 32)" />
        <ellipse cx="32" cy="15" rx="6.5" ry="11" transform="rotate(135 32 32)" />
      </g>
      <circle cx="32" cy="32" r="7.5" fill="#24312b" />
      <circle cx="32" cy="32" r="3.5" fill="#9c4034" />
    </svg>
  );
}
