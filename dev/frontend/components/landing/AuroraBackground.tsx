export function AuroraBackground() {
  return (
    <div
      className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      aria-hidden="true"
    >
      {/* Opaque dark matte base — covers root layout background */}
      <div className="absolute inset-0 bg-[#050507]" />

      {/* Aurora Layer 1 — Mint (slow, top-left drift) */}
      <div
        className="absolute w-[80vw] h-[80vw] max-w-[800px] max-h-[800px] top-[-20%] left-[-10%] rounded-full opacity-[0.12] md:opacity-[0.18] mix-blend-screen"
        style={{
          background:
            "radial-gradient(circle, #00FFB2 0%, transparent 70%)",
          filter: "blur(60px)",
          animation: "aurora-drift-1 20s ease-in-out infinite",
          willChange: "transform",
        }}
      />

      {/* Aurora Layer 2 — Violet (medium, center-right drift) */}
      <div
        className="absolute w-[70vw] h-[70vw] max-w-[700px] max-h-[700px] top-[30%] right-[-15%] rounded-full opacity-[0.10] md:opacity-[0.15] mix-blend-screen"
        style={{
          background:
            "radial-gradient(circle, #7B61FF 0%, transparent 70%)",
          filter: "blur(80px)",
          animation: "aurora-drift-2 15s ease-in-out infinite",
          willChange: "transform",
        }}
      />

      {/* Aurora Layer 3 — Coral (fast, bottom drift) */}
      <div
        className="absolute w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] bottom-[-10%] left-[20%] rounded-full opacity-[0.08] md:opacity-[0.12] mix-blend-screen"
        style={{
          background:
            "radial-gradient(circle, #FF3D71 0%, transparent 70%)",
          filter: "blur(70px)",
          animation: "aurora-drift-3 12s ease-in-out infinite",
          willChange: "transform",
        }}
      />

      {/* Noise texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}
