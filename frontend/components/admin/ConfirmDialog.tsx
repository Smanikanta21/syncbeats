"use client";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  pending?: boolean;
}

export function ConfirmDialog({ open, title, message, onCancel, onConfirm, pending }: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4">
      <div className="glass-panel w-full max-w-md rounded-2xl p-5">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm text-zinc-300">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-200">
            Cancel
          </button>
          <button
            disabled={pending}
            onClick={onConfirm}
            className="rounded-xl border px-4 py-2 text-sm disabled:opacity-60"
            style={{
              borderColor: "color-mix(in srgb, var(--accent-tertiary) 40%, transparent)",
              background: "color-mix(in srgb, var(--accent-tertiary) 14%, transparent)",
              color: "color-mix(in srgb, var(--accent-tertiary) 72%, white)",
            }}
          >
            {pending ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
