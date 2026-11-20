import type { ReactNode } from 'react';
import { LandingNavigation } from './LandingNavigation';
import { LandingFooter } from './landing/LandingFooter';
import '../app/landing.css';
import '../app/public-info.css';

interface PublicInfoPageProps {
  title: string;
  description: string;
  eyebrow: string;
  updated?: string;
  contents?: { id: string; label: string }[];
  children: ReactNode;
}

export function PublicInfoPage({ title, description, eyebrow, updated, contents, children }: PublicInfoPageProps) {
  return <div className="site-gradient-page landing-page public-info-page">
    <a href="#main-content" className="landing-skip-link">Skip to content</a>
    <LandingNavigation />
    <main id="main-content" className="landing-container public-info-main">
      <header className="public-info-header">
        <p className="public-info-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="public-info-description">{description}</p>
        {updated && <p className="public-info-updated">Last updated {updated}</p>}
      </header>
      <div className={`public-info-layout${contents ? '' : ' public-info-layout--single'}`}>
        {contents && <aside className="public-info-index"><nav aria-label="On this page"><p>On this page</p>{contents.map(item => <a key={item.id} href={`#${item.id}`}>{item.label}</a>)}</nav></aside>}
        <div className="public-info-content">{children}</div>
      </div>
    </main>
    <LandingFooter />
  </div>;
}
