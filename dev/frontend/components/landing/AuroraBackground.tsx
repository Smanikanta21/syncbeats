export function AuroraBackground() {
  return (
    <div
      className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      aria-hidden="true"
    >
      {/* Opaque dark matte base — covers root layout background */}
      <div className="absolute inset-0 bg-[#050507]" />

      {/* Aurora Layer 1 — Mint (Brightened & Vibrant) */}
      <div
        className="absolute w-[85vw] h-[85vw] max-w-[900px] max-h-[900px] top-[-20%] left-[-10%] rounded-full opacity-[0.35] md:opacity-[0.50] mix-blend-screen"
        style={{
          background:
            "radial-gradient(circle, #00FFB2 0%, #10b981 50%, transparent 70%)",
          filter: "blur(60px)",
          animation: "aurora-drift-1 20s ease-in-out infinite",
          willChange: "transform",
        }}
      />

      {/* Aurora Layer 2 — Violet/Cyan (Brightened & Vibrant) */}
      <div
        className="absolute w-[75vw] h-[75vw] max-w-[800px] max-h-[800px] top-[30%] right-[-15%] rounded-full opacity-[0.30] md:opacity-[0.45] mix-blend-screen"
        style={{
          background:
            "radial-gradient(circle, #38bdf8 0%, #7B61FF 50%, transparent 70%)",
          filter: "blur(75px)",
          animation: "aurora-drift-2 15s ease-in-out infinite",
          willChange: "transform",
        }}
      />

      {/* Aurora Layer 3 — Coral/Emerald (Brightened) */}
      <div
        className="absolute w-[65vw] h-[65vw] max-w-[700px] max-h-[700px] bottom-[-10%] left-[20%] rounded-full opacity-[0.25] md:opacity-[0.38] mix-blend-screen"
        style={{
          background:
            "radial-gradient(circle, #059669 0%, #FF3D71 55%, transparent 70%)",
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
