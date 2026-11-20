import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Your rooms",
  robots: { index: false, follow: false },
};
export default function HubLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
