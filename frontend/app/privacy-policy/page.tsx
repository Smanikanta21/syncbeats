import type { Metadata } from "next";
import Link from "next/link";
import { Disc } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy — SyncBeats",
  description: "Learn how SyncBeats collects, uses, and protects your data.",
  robots: { index: true, follow: true },
};

export default function PrivacyPolicy() {
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
        <div className="absolute -top-[10%] -left-[10%] w-[500px] h-[500px] bg-red-500/5 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute top-[40%] -right-[10%] w-[400px] h-[400px] bg-blue-500/5 blur-[100px] rounded-full mix-blend-screen" />
      </div>

      <div className="max-w-4xl mx-auto px-6 py-24 relative z-10">
        <div className="mb-12 text-center md:text-left">
          <h1 className="text-4xl md:text-6xl font-bold mb-4 tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/50">
            Privacy Policy
          </h1>
          <p className="text-foreground/50 font-bold uppercase tracking-widest text-sm">Last updated: {lastUpdated}</p>
        </div>

        <div className="glass-panel bg-background/50 backdrop-blur-xl border border-foreground/10 rounded-[2rem] p-8 md:p-12 shadow-[0_8px_40px_rgba(0,0,0,0.04)] space-y-12">
          
          <section>
            <h2 className="text-2xl font-bold mb-4 tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-foreground/5 flex items-center justify-center text-sm">1</div>
              Introduction
            </h2>
            <p className="text-foreground/70 leading-relaxed font-medium pl-11">
              SyncBeats ("we," "us," "our," or "Company") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website and use our service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-6 tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-foreground/5 flex items-center justify-center text-sm">2</div>
              Information We Collect
            </h2>
            
            <div className="space-y-6 pl-11">
              <div className="p-6 rounded-2xl bg-foreground/5 border border-foreground/10">
                <h3 className="text-lg font-bold mb-3">2.1 Information You Provide Directly</h3>
                <ul className="space-y-2 text-foreground/70 font-medium">
                  <li className="flex gap-2"><span>•</span> Account information (email address, name) when you create an account</li>
                  <li className="flex gap-2"><span>•</span> Audio files you upload to create listening rooms</li>
                  <li className="flex gap-2"><span>•</span> Room settings and preferences you configure</li>
                  <li className="flex gap-2"><span>•</span> Messages you send through our service</li>
                </ul>
              </div>

              <div className="p-6 rounded-2xl bg-foreground/5 border border-foreground/10">
                <h3 className="text-lg font-bold mb-3">2.2 Information Collected Automatically</h3>
                <ul className="space-y-2 text-foreground/70 font-medium">
                  <li className="flex gap-2"><span>•</span> Browser type, device type, and operating system</li>
                  <li className="flex gap-2"><span>•</span> IP address and approximate location (country/region)</li>
                  <li className="flex gap-2"><span>•</span> Pages visited and time spent on each page</li>
                  <li className="flex gap-2"><span>•</span> Referrer information (how you found us)</li>
                  <li className="flex gap-2"><span>•</span> Cookies and similar tracking technologies</li>
                  <li className="flex gap-2"><span>•</span> Network performance metrics (latency, jitter, packet loss)</li>
                </ul>
              </div>

              <div className="p-6 rounded-2xl bg-foreground/5 border border-foreground/10">
                <h3 className="text-lg font-bold mb-3">2.3 Third-Party Information</h3>
                <ul className="space-y-2 text-foreground/70 font-medium">
                  <li className="flex gap-2"><span>•</span> If you authenticate via Google, we receive basic profile information</li>
                  <li className="flex gap-2"><span>•</span> Analytics data from Google Analytics</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-foreground/5 flex items-center justify-center text-sm">3</div>
              How We Use Your Information
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-11 text-foreground/70 font-medium mt-6">
              <li className="flex items-center gap-3 p-4 rounded-xl bg-foreground/5 border border-foreground/5"><div className="w-1.5 h-1.5 rounded-full bg-foreground/40" /> To provide, maintain, and improve our service</li>
              <li className="flex items-center gap-3 p-4 rounded-xl bg-foreground/5 border border-foreground/5"><div className="w-1.5 h-1.5 rounded-full bg-foreground/40" /> To create and manage your account</li>
              <li className="flex items-center gap-3 p-4 rounded-xl bg-foreground/5 border border-foreground/5"><div className="w-1.5 h-1.5 rounded-full bg-foreground/40" /> To synchronize audio across devices</li>
              <li className="flex items-center gap-3 p-4 rounded-xl bg-foreground/5 border border-foreground/5"><div className="w-1.5 h-1.5 rounded-full bg-foreground/40" /> To diagnose technical issues</li>
              <li className="flex items-center gap-3 p-4 rounded-xl bg-foreground/5 border border-foreground/5"><div className="w-1.5 h-1.5 rounded-full bg-foreground/40" /> To send important announcements</li>
              <li className="flex items-center gap-3 p-4 rounded-xl bg-foreground/5 border border-foreground/5"><div className="w-1.5 h-1.5 rounded-full bg-foreground/40" /> To prevent fraud and ensure security</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-foreground/5 flex items-center justify-center text-sm">4</div>
              Data Retention & Security
            </h2>
            <div className="pl-11 space-y-4">
              <p className="text-foreground/70 leading-relaxed font-medium">
                We implement industry-standard security measures including SSL/TLS encryption, secure password hashing, and regular security audits.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div className="p-4 rounded-xl bg-foreground/5 border border-foreground/10">
                  <strong className="block mb-1">Account data</strong> Retained until deleted
                </div>
                <div className="p-4 rounded-xl bg-foreground/5 border border-foreground/10">
                  <strong className="block mb-1">Audio files</strong> Deleted when room expires
                </div>
                <div className="p-4 rounded-xl bg-foreground/5 border border-foreground/10">
                  <strong className="block mb-1">Analytics</strong> Retained for 13 months
                </div>
                <div className="p-4 rounded-xl bg-foreground/5 border border-foreground/10">
                  <strong className="block mb-1">Security Logs</strong> Retained for 90 days
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-foreground/5 flex items-center justify-center text-sm">5</div>
              Sharing Your Information
            </h2>
            <p className="text-foreground/70 leading-relaxed font-medium pl-11 mb-4">
              We do not sell your data. We may share information in these cases:
            </p>
            <ul className="space-y-3 pl-11 text-foreground/70 font-medium">
              <li className="flex gap-3"><div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-foreground/40 shrink-0" /> With service providers (hosting, analytics, email) under confidentiality agreements</li>
              <li className="flex gap-3"><div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-foreground/40 shrink-0" /> When required by law or to protect our rights</li>
              <li className="flex gap-3"><div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-foreground/40 shrink-0" /> In case of merger, acquisition, or sale of assets</li>
              <li className="flex gap-3"><div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-foreground/40 shrink-0" /> With your explicit consent</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-foreground/5 flex items-center justify-center text-sm">6</div>
              Your Rights & Contact
            </h2>
            <div className="pl-11 space-y-4">
              <p className="text-foreground/70 leading-relaxed font-medium">
                Depending on your location, you have the right to access, correct, delete, or port your data.
                SyncBeats is not intended for children under 13. We do not knowingly collect data from children under 13.
              </p>
              <div className="mt-6 p-6 bg-foreground/5 rounded-2xl border border-foreground/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold mb-1">Questions about privacy?</h4>
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