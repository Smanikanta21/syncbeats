import { nativeGoogleReturnLink } from '../../../../lib/nativeGoogle';
import NativeGoogleReturn from './NativeGoogleReturn';

export const metadata = { title: 'Return to SyncBeats', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function NativeGoogleReturnPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const values = await searchParams;
  return <NativeGoogleReturn callback={nativeGoogleReturnLink(values)} failed={values.error === 'sign_in_failed'} />;
}
