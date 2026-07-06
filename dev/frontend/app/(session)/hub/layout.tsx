import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Hub',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
