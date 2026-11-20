import type { Metadata } from 'next';
import { PublicInfoPage } from '../../components/PublicInfoPage';
import { MacBetaForm } from '../../components/MacBetaForm';

export const metadata: Metadata = {
  title: 'Mac Beta Testers — SyncBeats',
  description: 'Help test SyncBeats for Mac. Join the beta interest list and hear when invitations are available.',
  alternates: { canonical: '/mac-beta' },
};

export default function MacBetaPage() {
  return <PublicInfoPage title="Help shape SyncBeats for Mac" eyebrow="Mac beta" description="Test shared listening on your Mac and tell us where the experience needs work.">
    <section aria-labelledby="beta-about">
      <h2 id="beta-about">Join the first listeners</h2>
      <p>The native Mac app is still in development. We’re looking for people willing to try early builds and share feedback on setup, playback, and listening across devices.</p>
      <p>Leave your details below. Supported Mac models, build requirements, and testing instructions will be included with invitations. Joining this list doesn’t guarantee an invitation or a release date.</p>
    </section>
    <MacBetaForm />
  </PublicInfoPage>;
}
