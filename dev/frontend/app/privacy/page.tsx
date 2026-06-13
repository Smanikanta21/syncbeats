import { LandingNavbar } from "../../components/landing/LandingNavbar";
import { Footer } from "../../components/landing/Footer";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col overflow-hidden relative selection:bg-foreground/20 selection:text-foreground">
      {/* Dynamic Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-[30%] -left-[10%] w-[70vw] h-[70vw] bg-foreground/5 blur-[120px] rounded-full" />
      </div>

      <LandingNavbar />

      <main className="relative z-10 flex-1 flex flex-col items-center px-6 py-20">
        <div className="w-full max-w-3xl glass-panel p-8 md:p-12 rounded-[3rem] border border-foreground/5 shadow-[0_10px_40px_rgba(0,0,0,0.15)] bg-background/40 text-left">
          <h1 className="text-4xl md:text-5xl font-black mb-8 tracking-tighter">Privacy Policy</h1>
          
          <div className="space-y-6 text-foreground/60 leading-relaxed font-medium">
            <p><strong>Last Updated:</strong> June 2026</p>
            
            <h2 className="text-xl font-bold text-foreground mt-8 mb-4 tracking-tight">1. Information We Collect</h2>
            <p>
              SyncBeats respects your privacy. Because our core service relies on peer-to-peer (P2P) WebTorrent and WebRTC technologies, 
              we minimize the data that passes through our central servers. We may collect basic account information (email, username) when you sign up, 
              and technical data (IP address, browser type) to facilitate connections.
            </p>

            <h2 className="text-xl font-bold text-foreground mt-8 mb-4 tracking-tight">2. How We Use Your Information</h2>
            <p>
              We use the collected information solely to:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Create and manage your user account.</li>
              <li>Provide signaling to connect your devices for P2P audio streaming.</li>
              <li>Improve platform performance and troubleshoot synchronization issues.</li>
            </ul>

            <h2 className="text-xl font-bold text-foreground mt-8 mb-4 tracking-tight">3. Audio Data</h2>
            <p>
              Audio files uploaded to SyncBeats are distributed directly between connected devices using WebTorrent. 
              We do not permanently store your personal audio files on our servers.
            </p>

            <h2 className="text-xl font-bold text-foreground mt-8 mb-4 tracking-tight">4. Third-Party Services</h2>
            <p>
              We may use third-party services like Supabase for authentication and database management, and Vercel for hosting and analytics. 
              These services have their own privacy policies governing their use of your data.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
