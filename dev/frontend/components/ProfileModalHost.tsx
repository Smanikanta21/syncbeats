"use client";

// components/ProfileModalHost.tsx — Layout-level host for ProfileModal.
// Renders once at the root layout and connects to ProfileModalContext.
// Completely isolated from RoomDashboard and its high-frequency re-renders.

import { useProfileModal } from "../context/ProfileModalContext";
import { ProfileModal } from "./ProfileModal";

export function ProfileModalHost() {
  const { isOpen, close } = useProfileModal();
  return <ProfileModal isOpen={isOpen} onClose={close} />;
}
