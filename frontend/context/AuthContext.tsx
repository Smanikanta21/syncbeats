"use client";

// context/AuthContext.tsx — Global auth state
// Persists token in localStorage, exposes user + helpers to all children.

import {
  createContext, useContext, useEffect, useState, useCallback,
  type ReactNode,
} from "react";
import { authApi, devicesApi, type Device, type User } from "../lib/api";

interface AuthContextType {
  user:     User | null;
  device:   Device | null;
  needsDeviceRename: boolean;
  token:    string | null;
  loading:  boolean;
  login:    (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  renameDevice: (name: string) => Promise<void>;
  replaceDevice: (targetDeviceId: string) => Promise<void>;
  logout:   () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [device,  setDevice]   = useState<Device | null>(null);
  const [needsDeviceRename, setNeedsDeviceRename] = useState(false);
  const [token,   setToken]   = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("sb_token");
  });
  const [loading, setLoading] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return !!localStorage.getItem("sb_token");
  });

  // ── Rehydrate from localStorage on mount ───────────────────────────────
  useEffect(() => {
    if (!token) return;

    authApi.me()
      .then(({ user, device, needsDeviceRename }) => {
        setUser(user);
        setDevice(device);
        setNeedsDeviceRename(needsDeviceRename);
      })
      .catch(() => {
        // Token expired or invalid — clear it
        localStorage.removeItem("sb_token");
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const persist = (token: string, user: User) => {
    localStorage.setItem("sb_token", token);
    setToken(token);
    setUser(user);
  };

  const login = useCallback(async (email: string, password: string) => {
    const { token, user, device, needsDeviceRename } = await authApi.login(email, password);
    persist(token, user);
    setDevice(device);
    setNeedsDeviceRename(needsDeviceRename);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const { token, user, device, needsDeviceRename } = await authApi.register(name, email, password);
    persist(token, user);
    setDevice(device);
    setNeedsDeviceRename(needsDeviceRename);
  }, []);

  const renameDevice = useCallback(async (name: string) => {
    if (!device) return;

    const { device: updated } = await devicesApi.rename(device.id, name);
    setDevice(updated);
    setNeedsDeviceRename(false);
  }, [device]);

  const replaceDevice = useCallback(async (targetDeviceId: string) => {
    const { device: updated } = await devicesApi.replace(targetDeviceId);
    setDevice(updated);
    setNeedsDeviceRename(false);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("sb_token");
    setToken(null);
    setUser(null);
    setDevice(null);
    setNeedsDeviceRename(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, device, needsDeviceRename, token, loading, login, register, renameDevice, replaceDevice, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
