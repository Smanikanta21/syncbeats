import Link from "next/link";

export default function Magnetic({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={className}>
      {children}
    </span>
  );
}
