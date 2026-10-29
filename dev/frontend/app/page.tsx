import type { Metadata } from "next";
import { Mail, MapPin } from "lucide-react";
import Image from "next/image";
import { InstagramIcon } from "../components/InstagramFollowButton";
import { LandingNavbar } from "../components/LandingNavbar";
import { ContactForm } from "../components/ContactForm";
import { LandingFooterLinks } from "../components/LandingFooterLinks";
import { SyncScrollProvider } from "../context/SyncScrollContext";
import { AmbientField } from "../components/landing/AmbientField";
import { Hero } from "../components/landing/Hero";
import { SyncRoom } from "../components/landing/SyncRoom";
import { Capabilities } from "../components/landing/Capabilities";
import { FAQ } from "../components/landing/FAQ";
import { PwaRootRedirect } from "../components/pwa/PwaRootRedirect";

// Title and description come from the root layout, which already describes the
// homepage. Only the canonical is set here — see the note in app/layout.tsx for
// why it is no longer inherited.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const CONTACTS = [
  { Icon: Mail, label: "Email", value: "support@syncbeats.in", href: "mailto:support@syncbeats.in" },
  { Icon: MapPin, label: "Location", value: "India" },
  {
    Icon: InstagramIcon,
    label: "Instagram",
    value: "@syncbeats.in",
    href: "https://www.instagram.com/syncbeats.in/",
    external: true,
  },
];

export default function LandingPage() {
  return (
    // SyncScrollProvider holds the resting alignment read by the ambient field.
    <SyncScrollProvider>
      <div className="relative w-full overflow-x-clip bg-transparent font-sans text-foreground selection:bg-foreground selection:text-background">
        <PwaRootRedirect />
        <AmbientField />
        <LandingNavbar />

        <Hero />
        <SyncRoom />
        <Capabilities />
        <FAQ />

        <section className="relative z-10 flex w-full flex-col items-center px-5 pb-16 sm:px-6">
          <div id="contact" className="mx-auto mb-12 flex w-full max-w-6xl flex-col gap-10">
            <h2 className="max-w-[20ch] font-display text-display font-semibold text-balance">
              Something broken, or an idea?
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col justify-center rounded-3xl border border-foreground/10 bg-foreground/2.5 p-7 md:p-10">
                <h3 className="mb-8 font-display text-title font-semibold">Reach us directly</h3>
                <div className="space-y-6">
                  {CONTACTS.map(({ Icon, label, value, href, external }) => (
                    <div key={label} className="flex items-center gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-foreground/10">
                        <Icon className="h-4.5 w-4.5 text-foreground/50" />
                      </div>
                      <div>
                        <p className="mb-0.5 text-xs text-foreground/40">{label}</p>
                        {href ? (
                          <a
                            href={href}
                            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                            className="text-base font-medium transition-opacity hover:opacity-70"
                          >
                            {value}
                          </a>
                        ) : (
                          <p className="text-base font-medium">{value}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <ContactForm />
            </div>
          </div>

          <footer className="mx-auto mt-6 flex w-full max-w-6xl flex-col items-center justify-between gap-4 border-t border-foreground/10 pt-8 text-xs text-foreground/45 md:flex-row">
            <div className="flex items-center gap-3">
              <Image
                src="/favicon.svg"
                alt=""
                width={18}
                height={18}
                className="block opacity-50 grayscale"
              />
              SyncBeats © {new Date().getFullYear()}
            </div>
            <LandingFooterLinks />
          </footer>
        </section>
      </div>
    </SyncScrollProvider>
  );
}
