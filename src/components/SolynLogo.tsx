export function SolynLogo({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-lg flex items-center justify-center font-bold"
      style={{
        width: size, height: size,
        background: "linear-gradient(135deg, #C9A14A, #a37e2b)",
        color: "#1B2228", fontSize: size * 0.5,
      }}
      aria-label="Solyn Global"
    >
      S
    </div>
  );
}
