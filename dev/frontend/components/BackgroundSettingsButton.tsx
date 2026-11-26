"use client";

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal, X } from 'lucide-react';
import { AmbientModeControl } from './room/AmbientModeControl';

export function BackgroundSettingsButton() {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Background settings" aria-haspopup="dialog" className="inline-flex items-center gap-2 text-foreground/70 hover:text-foreground">
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Background</span>
      </button>
      {open && createPortal(
        <dialog ref={dialog} onClose={() => setOpen(false)} aria-label="Background settings" className="fixed inset-0 m-auto max-h-[85dvh] w-[min(560px,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-foreground/15 bg-background p-5 text-foreground shadow-2xl backdrop:bg-black/55 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Background</h2>
            <button autoFocus type="button" aria-label="Close background settings" onClick={() => dialog.current?.close()} className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-foreground/5"><X className="h-5 w-5" aria-hidden="true" /></button>
          </div>
          <AmbientModeControl expanded />
        </dialog>, document.body
      )}
    </>
  );
}
