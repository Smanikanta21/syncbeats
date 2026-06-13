import { LandingNavbar } from "../../components/landing/LandingNavbar";
import { Footer } from "../../components/landing/Footer";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col overflow-hidden relative selection:bg-foreground/20 selection:text-foreground">
      {/* Dynamic Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-[30%] -left-[10%] w-[70vw] h-[70vw] bg-foreground/5 blur-[120px] rounded-full" />
      </div>

      <LandingNavbar />

      <main className="relative z-10 flex-1 flex flex-col items-center px-6 py-20">
        <div className="w-full max-w-3xl glass-panel p-8 md:p-12 rounded-[3rem] border border-foreground/5 shadow-[0_10px_40px_rgba(0,0,0,0.15)] bg-background/40 text-left">
          <h1 className="text-4xl md:text-5xl font-black mb-8 tracking-tighter">Terms of Service</h1>
          
          <div className="space-y-6 text-foreground/60 leading-relaxed font-medium">
            <p><strong>Last Updated:</strong> June 2026</p>
            
            <h2 className="text-xl font-bold text-foreground mt-8 mb-4 tracking-tight">1. Acceptance of Terms</h2>
            <p>
              By accessing and using SyncBeats ("the App"), you accept and agree to be bound by the terms and provision of this agreement. 
              If you do not agree to abide by these terms, please do not use this App.
            </p>

            <h2 className="text-xl font-bold text-foreground mt-8 mb-4 tracking-tight">2. Description of Service</h2>
            <p>
              SyncBeats provides a peer-to-peer web audio synchronization platform. The service is provided "as is" and we assume no responsibility 
              for the timeliness, deletion, misdelivery, or failure to store any user data, communications, or personalization settings.
            </p>

            <h2 className="text-xl font-bold text-foreground mt-8 mb-4 tracking-tight">3. User Conduct</h2>
            <p>
              You agree to not use the Service to:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Upload, post, or transmit any audio content that infringes any patent, trademark, trade secret, copyright, or other proprietary rights.</li>
              <li>Upload, post, or transmit any material that contains software viruses or any other computer code designed to interrupt or destroy functionality.</li>
              <li>Interfere with or disrupt the Service or servers connected to the Service.</li>
            </ul>

            <h2 className="text-xl font-bold text-foreground mt-8 mb-4 tracking-tight">4. Modifications to Service</h2>
            <p>
              We reserve the right at any time and from time to time to modify or discontinue, temporarily or permanently, the Service (or any part thereof) 
              with or without notice.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
