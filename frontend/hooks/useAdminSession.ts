"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminLogin } from "@/lib/admin/api";
import { AdminSession } from "@/types/admin";

const SESSION_KEY = "syncbeats-admin-session";

export function useAdminSession() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) setSession(JSON.parse(raw) as AdminSession);
    } catch {
      localStorage.removeItem(SESSION_KEY);
    } finally {
      setBootstrapping(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const next = await adminLogin(email, password);
    setSession(next);
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  }, []);

  const logout = useCallback(() => {
    setSession(null);
    localStorage.removeItem(SESSION_KEY);
  }, []);

  return useMemo(
    () => ({
      session,
      isAuthenticated: !!session,
      bootstrapping,
      login,
      logout,
    }),
    [session, bootstrapping, login, logout],
  );
}
