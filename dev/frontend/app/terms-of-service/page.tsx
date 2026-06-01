import type { Metadata } from "next";
import Link from "next/link";
import { Disc } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service — SyncBeats",
  description: "Read SyncBeats' Terms of Service. By using our service, you agree to these terms.",
  robots: { index: true, follow: true },
};

export default function TermsOfService() {
  const lastUpdated = "May 2026";

  return (
    <main className="min-h-screen bg-background text-foreground relative overflow-hidden">
      {/* Back to Home Button */}
      <Link href="/" className="absolute top-6 left-6 md:top-8 md:left-8 z-50 flex items-center gap-2 group">
        <div className="w-8 h-8 rounded-full bg-foreground/5 border border-foreground/10 flex items-center justify-center group-hover:bg-foreground/10 transition-colors">
          <Disc className="w-4 h-4 text-foreground/80 animate-[spin_4s_linear_infinite]" />
        </div>
        <span className="text-sm font-bold tracking-widest text-foreground/60 group-hover:text-foreground transition-colors">HOME</span>
      </Link>

      {/* Background Gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -right-[10%] w-[500px] h-[500px] bg-red-500/5 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute top-[40%] -left-[10%] w-[400px] h-[400px] bg-blue-500/5 blur-[100px] rounded-full mix-blend-screen" />
      </div>

      <div className="max-w-4xl mx-auto px-6 py-24 relative z-10">
        <div className="mb-12 text-center md:text-left">
          <h1 className="text-4xl md:text-6xl font-bold mb-4 tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/50">
            Terms of Service
          </h1>
          <p className="text-foreground/50 font-bold uppercase tracking-widest text-sm">Last updated: {lastUpdated}</p>
        </div>

        <div className="glass-panel bg-background/50 backdrop-blur-xl border border-foreground/10 rounded-[2rem] p-8 md:p-12 shadow-[0_8px_40px_rgba(0,0,0,0.04)] space-y-12">
          
          <section>
            <h2 className="text-2xl font-bold mb-4 tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-foreground/5 flex items-center justify-center text-sm">1</div>
              Acceptance of Terms
            </h2>
            <p className="text-foreground/70 leading-relaxed font-medium pl-11">
              By accessing and using SyncBeats ("Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, you may not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-6 tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-foreground/5 flex items-center justify-center text-sm">2</div>
              Use License
            </h2>
            <div className="pl-11 space-y-4">
              <p className="text-foreground/70 leading-relaxed font-medium">
                SyncBeats grants you a limited, non-exclusive, revocable license to access and use the Service for personal, non-commercial purposes, subject to these Terms. You agree not to:
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-foreground/70 font-medium">
                <li className="flex gap-3 p-4 rounded-xl bg-foreground/5 border border-foreground/5"><div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500/50 shrink-0" /> Reproduce, copy, or sell the Service</li>
                <li className="flex gap-3 p-4 rounded-xl bg-foreground/5 border border-foreground/5"><div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500/50 shrink-0" /> Attempt unauthorized access</li>
                <li className="flex gap-3 p-4 rounded-xl bg-foreground/5 border border-foreground/5"><div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500/50 shrink-0" /> Upload copyrighted material you don't own</li>
                <li className="flex gap-3 p-4 rounded-xl bg-foreground/5 border border-foreground/5"><div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500/50 shrink-0" /> Reverse engineer source code</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-foreground/5 flex items-center justify-center text-sm">3</div>
              User Accounts
            </h2>
            <div className="pl-11">
              <p className="text-foreground/70 leading-relaxed font-medium mb-4">
                If you create an account, you are responsible for maintaining the confidentiality of your password and all activities under your account. You must notify us immediately of any unauthorized access.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-foreground/5 flex items-center justify-center text-sm">4</div>
              User Content
            </h2>
            <div className="pl-11 space-y-4">
              <p className="text-foreground/70 leading-relaxed font-medium">
                By uploading audio files to SyncBeats, you represent that you own or have rights to the content. You grant us a license to store and transmit it.
              </p>
              <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-400 font-medium text-sm">
                <strong>You are solely responsible for uploaded content.</strong> We do not monitor user content. Do not upload copyrighted material unless you have permission.
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-foreground/5 flex items-center justify-center text-sm">5</div>
              Disclaimer & Liability
            </h2>
            <div className="pl-11 space-y-4">
              <p className="text-foreground/70 leading-relaxed font-medium">
                The Service is provided "as is" without warranties of any kind. SyncBeats does not warrant that the Service will be uninterrupted, error-free, or perfectly synchronized at all times.
              </p>
              <p className="text-foreground/70 leading-relaxed font-medium">
                To the extent permitted by law, SyncBeats shall not be liable for lost data, business interruption, or indirect damages. Our total liability shall not exceed the amount you paid to us in the past 12 months.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-foreground/5 flex items-center justify-center text-sm">6</div>
              DMCA & Contact
            </h2>
            <div className="pl-11 space-y-4">
              <p className="text-foreground/70 leading-relaxed font-medium">
                If you believe your copyright is infringed, notify us in writing at <a href="mailto:legal@syncbeats.app" className="text-foreground underline">legal@syncbeats.app</a>.
              </p>
              <div className="mt-6 p-6 bg-foreground/5 rounded-2xl border border-foreground/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold mb-1">Questions about our Terms?</h4>
                  <p className="text-sm text-foreground/60 font-medium">Reach out to our support team.</p>
                </div>
                <a href="mailto:support@syncbeats.app" className="inline-flex items-center justify-center px-6 py-3 bg-foreground text-background font-bold rounded-xl hover:scale-105 active:scale-95 transition-all shadow-lg">
                  support@syncbeats.app
                </a>
              </div>
            </div>
          </section>

        </div>
      </div>
    </main>
  );
}