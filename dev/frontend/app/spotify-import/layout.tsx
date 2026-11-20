import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Spotify import",
  robots: { index: false, follow: false },
};
export default function SpotifyImportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
