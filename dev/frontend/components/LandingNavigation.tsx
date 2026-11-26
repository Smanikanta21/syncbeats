"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Grid2X2, X } from "lucide-react";
import { BackgroundSettingsButton } from "./BackgroundSettingsButton";
import { ThemeToggle } from "./ThemeToggle";
import { BrandMark } from "./landing/BrandMark";
import { useAuth } from "@/context/AuthContext";

const sections = [
  {
    href: "/#use-cases",
    label: "Find your reason",
    detail: "Ways to listen together",
  },
  {
    href: "/#how-it-works",
    label: "Make it happen",
    detail: "From room code to first track",
  },
  {
    href: "/#mac-app",
    label: "Next up: Mac",
    detail: "A native app, coming soon",
  },
  { href: "/#faq", label: "Good to know", detail: "Your questions, answered" },
];

export function LandingNavigation() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const pathname = usePathname();
  const dock = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !dock.current?.contains(event.target))
        setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <>
      <header className="landing-masthead landing-container">
        <Link href="/" className="landing-brand" aria-label="SyncBeats home">
          <BrandMark size={40} />
          <span>
            SyncBeats<span className="landing-brand-dot">.</span>
          </span>
        </Link>
        <Link href={user ? "/hub" : "/login"} className="landing-account-link">
          {user ? "Your rooms" : "Sign in"}{" "}
          <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </header>
      <div className="landing-navigation" ref={dock}>
        <nav className="landing-dock" aria-label="Quick navigation">
          <button
            ref={trigger}
            type="button"
            className="landing-explore-button"
            aria-label={open ? "Close page menu" : "Explore SyncBeats"}
            aria-expanded={open}
            aria-controls="landing-page-menu"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? (
              <X size={18} aria-hidden="true" />
            ) : (
              <Grid2X2 size={18} aria-hidden="true" />
            )}
            <span>Explore</span>
          </button>
          <span className="landing-dock-divider" aria-hidden="true" />
          <Link
            href="/room/default"
            className="landing-dock-start"
            onClick={() => setOpen(false)}
          >
            {user ? "My room" : "Start a room"}{" "}
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
          <Link
            href="/#join-room-code"
            className="landing-dock-join"
            onClick={() => setOpen(false)}
          >
            Join
          </Link>
          <span className="landing-dock-divider" aria-hidden="true" />
          <BackgroundSettingsButton />
        <ThemeToggle />
        </nav>
        <nav
          id="landing-page-menu"
          className="landing-page-menu"
          aria-label="Page sections"
          hidden={!open}
        >
          <p>
            FIND YOUR WAY <span>SYNCBEATS / 01</span>
          </p>
          {sections.map((section, index) => (
            <Link
              key={section.href}
              href={pathname === "/" ? section.href.slice(1) : section.href}
              onClick={() => setOpen(false)}
            >
              <span className="landing-menu-number">0{index + 1}</span>
              <span>
                <strong>{section.label}</strong>
                <small>{section.detail}</small>
              </span>
              <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          ))}
          <Link
            href="/how-it-works"
            className="landing-menu-guide"
            onClick={() => setOpen(false)}
          >
            Read the listening guide{" "}
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </nav>
      </div>
    </>
  );
}
