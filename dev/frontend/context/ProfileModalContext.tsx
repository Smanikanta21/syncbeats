"use client";

// context/ProfileModalContext.tsx — Manages profile modal open/close state
// Renders the ProfileModal at the layout level so it's completely decoupled
// from RoomDashboard's high-frequency re-renders (audio ticks, settings, etc.)

import {
  createContext, useContext, useState, useCallback, useRef,
  useEffect, type ReactNode,
} from "react";

interface ProfileModalContextType {
  isOpen: boolean;
  open:  () => void;
  close: () => void;
}

const ProfileModalContext = createContext<ProfileModalContextType | null>(null);

export function ProfileModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open  = useCallback(() => setIsOpen(true),  []);
  const close = useCallback(() => setIsOpen(false), []);

  // Listen for the legacy custom event so existing code that dispatches
  // window "open-profile-modal" still works.
  useEffect(() => {
    window.addEventListener("open-profile-modal", open);
    return () => window.removeEventListener("open-profile-modal", open);
  }, [open]);

  // Stable context value — only changes when isOpen changes, which is rare
  // (only on user click). Functions are already useCallback-stable.
  const value = useRef<ProfileModalContextType>({ isOpen, open, close });
  value.current = { isOpen, open, close };

  return (
    <ProfileModalContext.Provider value={value.current}>
      {children}
    </ProfileModalContext.Provider>
  );
}

export function useProfileModal(): ProfileModalContextType {
  const ctx = useContext(ProfileModalContext);
  if (!ctx) throw new Error("useProfileModal must be used inside <ProfileModalProvider>");
  return ctx;
}
