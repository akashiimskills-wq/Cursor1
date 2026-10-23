const TONES = ["#3d3428", "#5c4632", "#2c3a36", "#4a382c", "#243044", "#5a3d45"];

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  const tone = TONES[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % TONES.length];
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: tone }} aria-hidden="true">
      {initials}
    </span>
  );
}
