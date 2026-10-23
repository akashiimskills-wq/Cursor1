export function Mark({ size = 32 }: { size?: number }) {
  return (
    <span className="monogram" style={{ width: size, height: size, fontSize: Math.round(size * 0.52) }} aria-hidden="true">
      M
    </span>
  );
}
