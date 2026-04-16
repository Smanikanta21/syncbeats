"use client";

import { Loader2, Plus, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { TableRow, TableSchema } from "@/types/admin";

interface RecordModalProps {
  mode: "create" | "edit" | "view";
  open: boolean;
  schema: TableSchema;
  initial: TableRow | null;
  onClose: () => void;
  onSubmit: (payload: TableRow) => Promise<void>;
  saving?: boolean;
}

export function RecordModal({ mode, open, schema, initial, onClose, onSubmit, saving }: RecordModalProps) {
  const [error, setError] = useState("");
  const [form, setForm] = useState<TableRow>(() => initial ?? {});

  useEffect(() => {
    setForm(initial ?? {});
    setError("");
  }, [initial]);

  if (!open || !initial) return null;

  const readOnly = mode === "view";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (readOnly) return;

    const missing = schema.columns.find((column) => column.required && !String(form[column.key] ?? "").trim());
    if (missing) {
      setError(`${missing.label} is required`);
      return;
    }

    setError("");
    await onSubmit(form);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <form onSubmit={submit} className="glass-panel max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            {mode === "create" ? `Add ${schema.title.slice(0, -1)}` : mode === "edit" ? "Edit Record" : "Record Details"}
          </h3>
          <button onClick={onClose} type="button" className="rounded-lg border border-white/10 p-2 text-zinc-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {schema.columns.map((column) => {
            const disabled = readOnly || column.editable === false;
            const value = form[column.key] ?? "";

            return (
              <label key={column.key} className="space-y-1 text-sm">
                <span className="text-xs uppercase tracking-wider text-zinc-400">{column.label}</span>
                {column.type === "boolean" ? (
                  <select
                    value={String(value)}
                    disabled={disabled}
                    onChange={(e) => setForm((prev) => ({ ...prev, [column.key]: e.target.value === "true" }))}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-2 text-zinc-100 outline-none disabled:opacity-50"
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    value={String(value)}
                    type={column.type === "number" ? "number" : "text"}
                    disabled={disabled}
                    onChange={(e) => {
                      const next: string | number = column.type === "number" ? Number(e.target.value) : e.target.value;
                      setForm((prev) => ({ ...prev, [column.key]: next }));
                    }}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-2 text-zinc-100 outline-none disabled:opacity-50"
                  />
                )}
              </label>
            );
          })}
        </div>

        {error ? (
          <p className="mt-3 text-sm" style={{ color: "color-mix(in srgb, var(--accent-tertiary) 72%, white)" }}>
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-200">
            Close
          </button>
          {readOnly ? null : (
            <button
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm text-white disabled:opacity-60"
              style={{
                background: "linear-gradient(120deg, var(--accent-secondary), var(--accent-primary))",
              }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "create" ? <Plus className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving" : mode === "create" ? "Add" : "Save"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
