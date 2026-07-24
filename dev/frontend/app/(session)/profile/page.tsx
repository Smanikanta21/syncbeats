"use client";

import { useRouter } from "next/navigation";
import { ProfileModal } from "../../../components/ProfileModal";

export default function ProfilePage() {
  const router = useRouter();
  return <ProfileModal isOpen={true} onClose={() => router.back()} />;
}
