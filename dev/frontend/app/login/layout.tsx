import { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Login",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="site-gradient-page">{children}</div>;
}
