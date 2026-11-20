"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Play, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export function RoomEntry() {
  const { user } = useAuth();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(normalized)) {
      setError("Enter the 6-digit code your friend shared with you.");
      input.current?.focus();
      return;
    }
    router.push(`/room/${normalized}`);
  }

  function tryDemo() {
    document
      .getElementById("landing-demo-play")
      ?.focus({ preventScroll: true });
    document
      .getElementById("room-demo")
      ?.scrollIntoView({ block: "center", behavior: "auto" });
  }

  return (
    <div className="landing-entry">
      <div className="landing-actions">
        <Link
          href="/room/default"
          className="landing-button landing-button-primary"
        >
          <Plus size={17} aria-hidden="true" />
          {user ? "Open my room" : "Create a room"}
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
        <button
          type="button"
          className="landing-button landing-button-secondary"
          onClick={tryDemo}
        >
          <Play size={15} aria-hidden="true" /> Try the demo
        </button>
      </div>
      <p className="landing-entry-note">
        {user
          ? "Your room, ready for company."
          : "Free account. No download. Invite anyone with a code."}
      </p>
      <form
        className="landing-join"
        onSubmit={joinRoom}
        noValidate
        aria-label="Join a listening room"
      >
        <label htmlFor="join-room-code">
          Have a room code? <span>Join your friends.</span>
        </label>
        <div className={`landing-join-field${error ? " has-error" : ""}`}>
          <input
            ref={input}
            id="join-room-code"
            name="room-code"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            placeholder="6-digit room code"
            maxLength={12}
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setError("");
            }}
            aria-label="6-digit room code"
            aria-invalid={!!error}
            aria-describedby={
              error ? "landing-join-error" : "landing-join-help"
            }
          />
          <button type="submit">
            Join room <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
        {error ? (
          <p
            id="landing-join-error"
            className="landing-join-error"
            role="alert"
          >
            {error}
          </p>
        ) : (
          <p id="landing-join-help" className="landing-join-help">
            {user
              ? "Enter the code to go straight to their room."
              : "We’ll keep your room code while you sign in."}
          </p>
        )}
      </form>
    </div>
  );
}
