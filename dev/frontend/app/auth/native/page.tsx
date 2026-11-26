import NativeGoogleStart from './NativeGoogleStart';
import { nativeGoogleRequest } from '../../../lib/nativeGoogle';

export const metadata = { title: 'Sign in to the SyncBeats app', robots: { index: false, follow: false } };
export default async function NativeGooglePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <NativeGoogleStart flow={nativeGoogleRequest(await searchParams)} />;
}
