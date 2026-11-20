"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ListMusic, MessageSquare, Pin, Radio, UserRound, Users, X } from "lucide-react";
import styles from "./RoomSideRail.module.css";

type PanelTab = "devices" | "queue" | "chat" | "connection";
interface Props {
  side: "left" | "right";
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  participants: { userId?: string; displayName: string }[];
  queueCount: number;
  unreadCount: number;
  children: ReactNode;
}
const PIN_KEY = "syncbeats-room-panel-pinned";

export function RoomSideRail({ side, tab, onTabChange, participants, queueCount, unreadCount, children }: Props) {
  const [open, setOpen] = useState(false), [pinned, setPinned] = useState(false);
  const root = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null), leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressFocus = useRef(false), interacting = useRef(false);
  const focusPanel = useRef(false);
  const expanded = open || pinned;
  const users = participants.filter((p, index, all) => all.findIndex(other => (other.userId || other.displayName) === (p.userId || p.displayName)) === index);
  const finePointer = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const cancelTimers = () => {
    if (enterTimer.current) clearTimeout(enterTimer.current);
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
  };
  useEffect(() => {
    const frame = requestAnimationFrame(() => { try { setPinned(localStorage.getItem(PIN_KEY) === "true"); } catch {} });
    return () => { cancelAnimationFrame(frame); cancelTimers(); };
  }, []);
  useEffect(() => {
    if (!expanded || !focusPanel.current) return;
    let frame = 0;
    const deadline = performance.now() + 1000;
    const focusWhenVisible = () => {
      const target = panel.current;
      if (!target) return;
      if (!target.inert && getComputedStyle(target).visibility === "visible") {
        target.focus({ preventScroll: true });
        if (document.activeElement === target) { focusPanel.current = false; return; }
      }
      if (performance.now() >= deadline) { focusPanel.current = false; return; }
      frame = requestAnimationFrame(focusWhenVisible);
    };
    frame = requestAnimationFrame(focusWhenVisible);
    return () => cancelAnimationFrame(frame);
  }, [expanded, tab]);
  useEffect(() => {
    const release = () => { interacting.current = false; };
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", release);
    return () => { document.removeEventListener("pointerup", release); document.removeEventListener("pointercancel", release); };
  }, []);
  const close = () => {
    cancelTimers(); suppressFocus.current = true; setOpen(false); setPinned(false);
    try { localStorage.setItem(PIN_KEY, "false"); } catch {}
    trigger.current?.focus(); queueMicrotask(() => { suppressFocus.current = false; });
  };
  const previewTab = (value: PanelTab) => {
    cancelTimers();
    if (!finePointer() || interacting.current) return;
    enterTimer.current = setTimeout(() => {
      enterTimer.current = null;
      onTabChange(value);
      setOpen(true);
    }, 120);
  };
  const togglePin = () => {
    const next = !pinned; setPinned(next); setOpen(true);
    try { localStorage.setItem(PIN_KEY, String(next)); } catch {}
  };
  const scheduleClose = () => {
    cancelTimers(); if (!finePointer() || pinned) return;
    leaveTimer.current = setTimeout(() => {
      if (!interacting.current && !root.current?.matches(":hover") && !root.current?.contains(document.activeElement)) setOpen(false);
    }, 250);
  };

  return <div ref={root} className={`${styles.root} ${side === "right" ? styles.right : styles.left} ${pinned ? styles.pinned : ""}`}
    onPointerEnter={cancelTimers}
    onPointerLeave={scheduleClose}
    onFocusCapture={() => { cancelTimers(); if (!suppressFocus.current && finePointer()) setOpen(true); }}
    onBlurCapture={scheduleClose}
    onKeyDown={event => {
      if (event.key === "Escape" && expanded) { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key === "Tab" && expanded && !finePointer()) {
        const targets = Array.from(panel.current?.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex="0"]') ?? []).filter(el => !el.closest('[hidden]') && el.getClientRects().length > 0 && !el.hasAttribute('disabled'));
        const first = targets[0], last = targets.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first?.focus(); }
      }
    }}>
    {expanded && <button className={styles.backdrop} aria-label="Dismiss room panel" onClick={close} />}
    <nav className={styles.rail} aria-label="Room panels">
      {([
        ["devices", Users, `Devices, ${participants.length} connected`, participants.length],
        ["queue", ListMusic, `Queue, ${queueCount} tracks`, queueCount],
        ["chat", MessageSquare, "Chat", unreadCount],
        ["connection", Radio, "Connection", 0],
      ] as const).map(([value, Icon, label, count]) => <button key={value} ref={value === tab ? trigger : undefined}
        type="button" aria-label={label} aria-controls="room-side-panel" aria-expanded={expanded && value === tab}
        className={tab === value ? styles.active : ""}
        onPointerEnter={event => { if (event.pointerType !== "touch") previewTab(value); }}
        onPointerLeave={() => { if (enterTimer.current) clearTimeout(enterTimer.current); enterTimer.current = null; }}
        onFocus={() => { if (finePointer() && !suppressFocus.current) { cancelTimers(); onTabChange(value); setOpen(true); } }}
        onClick={() => {
          cancelTimers();
          if (!finePointer() && expanded && tab === value && !pinned) { close(); return; }
          focusPanel.current = !finePointer();
          onTabChange(value); setOpen(true);
          if (!finePointer() && expanded) panel.current?.focus();
        }}><Icon size={19} aria-hidden="true" />{count > 0 && <span className={styles.badge}>{count > 99 ? "99+" : count}</span>}</button>)}
      <div className={styles.people} aria-label={`${users.length} users`}>
        {users.slice(0, 3).map((user, index) => <span key={user.userId || `${user.displayName}-${index}`} title={user.displayName}>{user.displayName.slice(0, 2).toUpperCase()}</span>)}
        <small>{users.length} {users.length === 1 ? "user" : "users"}</small>
      </div>
      <button className={styles.pin} type="button" aria-label={pinned ? "Unpin room panel" : "Pin room panel"} aria-pressed={pinned} onClick={togglePin}><Pin size={17} aria-hidden="true" /></button>
      <Link href="/profile" className={styles.profile} aria-label="Profile" title="Profile"><UserRound size={19} aria-hidden="true" /></Link>
    </nav>
    <div id="room-side-panel" ref={panel} tabIndex={-1} inert={!expanded} role="region" aria-label={`${tab} panel`}
      className={`${styles.panel} ${expanded ? styles.expanded : ""}`}
      onPointerEnter={cancelTimers}
      onPointerDownCapture={() => { interacting.current = true; }}
      onPointerUpCapture={() => { interacting.current = false; scheduleClose(); }}
      onPointerCancel={() => { interacting.current = false; scheduleClose(); }}>
      <div className={styles.tools}>
        <button type="button" aria-label={pinned ? "Unpin room panel" : "Pin room panel"} aria-pressed={pinned} onClick={togglePin}><Pin size={15} /></button>
        <button type="button" aria-label="Close room panel" onClick={close}><X size={16} /></button>
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  </div>;
}
