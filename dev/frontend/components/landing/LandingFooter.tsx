import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="w-full px-6 py-8 border-t border-white/[0.06]">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-white/25">
          SYNCBEATS &copy; {new Date().getFullYear()}
        </div>

        {/* Links */}
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-5 text-[10px] font-bold uppercase tracking-[0.15em] text-white/70">
          <Link
            href="/privacy-policy"
            className="hover:text-white/60 transition-colors"
          >
            Privacy
          </Link>
          <Link
            href="/terms-of-service"
            className="hover:text-white/60 transition-colors"
          >
            Terms
          </Link>
          <Link
            href="/cookie-settings"
            className="hover:text-white/60 transition-colors"
          >
            Cookies
          </Link>
          <a
            href="/contact"
            onClick={(e) => {
              const el = document.getElementById("contact");
              if (el) {
                e.preventDefault();
                el.scrollIntoView({ behavior: "smooth" });
              }
            }}
            className="hover:text-white/60 transition-colors cursor-pointer"
          >
            Contact
          </a>

          {/* Social */}
          <div className="flex items-center gap-3 border-l border-white/[0.06] pl-4">
            <a
              href="https://www.instagram.com/syncbeats.in/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white/60 transition-colors"
              aria-label="Instagram"
              title="Instagram @syncbeats.in"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
            </a>
            <a
              href="https://github.com/smanikanta21"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white/60 transition-colors"
              aria-label="GitHub"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.02c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A4.8 4.8 0 0 0 8 18v4" />
              </svg>
            </a>
            <a
              href="https://www.linkedin.com/in/siraparapu-shiva-sankar-mani-kanta-622a85323"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white/60 transition-colors"
              aria-label="LinkedIn"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
                <rect x="2" y="9" width="4" height="12" />
                <circle cx="4" cy="4" r="2" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
