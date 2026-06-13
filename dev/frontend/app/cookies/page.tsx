import { LandingNavbar } from "../../components/landing/LandingNavbar";
import { Footer } from "../../components/landing/Footer";

export default function CookiesPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col overflow-hidden relative selection:bg-foreground/20 selection:text-foreground">
      {/* Dynamic Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-[30%] -left-[10%] w-[70vw] h-[70vw] bg-foreground/5 blur-[120px] rounded-full" />
      </div>

      <LandingNavbar />

      <main className="relative z-10 flex-1 flex flex-col items-center px-6 py-20">
        <div className="w-full max-w-3xl glass-panel p-8 md:p-12 rounded-[3rem] border border-foreground/5 shadow-[0_10px_40px_rgba(0,0,0,0.15)] bg-background/40 text-left">
          <h1 className="text-4xl md:text-5xl font-black mb-8 tracking-tighter">Cookies Policy</h1>
          
          <div className="space-y-6 text-foreground/60 leading-relaxed font-medium">
            <p><strong>Last Updated:</strong> June 2026</p>
            
            <h2 className="text-xl font-bold text-foreground mt-8 mb-4 tracking-tight">1. What Are Cookies?</h2>
            <p>
              Cookies are small text files that are placed on your computer or mobile device when you visit a website. 
              They are widely used to make websites work, or work more efficiently, as well as to provide information to the owners of the site.
            </p>

            <h2 className="text-xl font-bold text-foreground mt-8 mb-4 tracking-tight">2. How We Use Cookies</h2>
            <p>
              SyncBeats uses cookies strictly for essential operational purposes:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong>Authentication:</strong> To keep you logged in and securely manage your session.</li>
              <li><strong>Preferences:</strong> To remember your UI preferences, such as Dark Mode settings.</li>
              <li><strong>Room State:</strong> To help persist your active audio room connections if you accidentally refresh the page.</li>
            </ul>

            <h2 className="text-xl font-bold text-foreground mt-8 mb-4 tracking-tight">3. Third-Party Cookies</h2>
            <p>
              We do not use third-party tracking or advertising cookies. Any third-party cookies present are strictly related to our infrastructure providers (like Supabase for auth sessions).
            </p>

            <h2 className="text-xl font-bold text-foreground mt-8 mb-4 tracking-tight">4. Managing Cookies</h2>
            <p>
              You can set your browser not to accept cookies. However, please note that disabling cookies will prevent you from logging into SyncBeats and participating in synchronized rooms.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
