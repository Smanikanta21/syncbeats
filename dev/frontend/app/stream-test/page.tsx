import { notFound } from 'next/navigation';
import StreamTest from './StreamTest';

export default function StreamTestPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <StreamTest />;
}
