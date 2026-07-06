interface WaveformBarProps {
  barCount?: number;
  className?: string;
}

export function WaveformBar({ barCount = 12, className = "" }: WaveformBarProps) {
  return (
    <div
      className={`flex items-end justify-center gap-[3px] h-8 ${className}`}
      aria-hidden="true"
    >
      {Array.from({ length: barCount }).map((_, i) => (
        <div
          key={i}
          className="w-[3px] md:w-1 rounded-full origin-bottom"
          style={{
            height: "100%",
            background:
              "linear-gradient(to top, #00FFB2, rgba(123, 97, 255, 0.6))",
            animation: `waveform-pulse ${0.6 + (i * 0.07)}s ease-in-out ${i * 0.08}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
