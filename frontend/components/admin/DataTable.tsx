"use client";

import { ArrowDownWideNarrow, Eye, Pencil, Trash2 } from "lucide-react";
import { TableRow, TableSchema } from "@/types/admin";

interface DataTableProps {
  schema: TableSchema;
  rows: TableRow[];
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
  onView: (row: TableRow) => void;
  onEdit: (row: TableRow) => void;
  onDelete: (row: TableRow) => void;
}

export function DataTable({
  schema,
  rows,
  sortKey,
  sortDir,
  onSort,
  onView,
  onEdit,
  onDelete,
}: DataTableProps) {
  if (!rows.length) {
    return (
      <div className="glass-panel rounded-3xl border border-white/10 p-10 text-center">
        <p className="text-sm uppercase tracking-[0.16em] text-zinc-500">No Records</p>
        <h3 className="mt-2 text-xl font-semibold text-zinc-200">This table is currently empty</h3>
        <p className="mt-2 text-sm text-zinc-400">Use Add Record to insert the first row for this dataset.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="hidden overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/40 lg:block">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-[0.14em] text-zinc-400">
            <tr>
              {schema.columns.map((column) => (
                <th key={column.key} className="px-4 py-3 text-left font-medium">
                  <button className="inline-flex items-center gap-1" onClick={() => onSort(column.key)}>
                    {column.label}
                    <ArrowDownWideNarrow
                      className={`h-3 w-3 ${sortKey === column.key ? "" : "text-zinc-600"}`}
                      style={sortKey === column.key ? { color: "var(--accent-secondary)" } : undefined}
                    />
                    {sortKey === column.key ? <span className="text-[10px]">{sortDir}</span> : null}
                  </button>
                </th>
              ))}
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row[schema.primaryKey])} className="border-t border-white/5 text-zinc-200 hover:bg-white/[0.04]">
                {schema.columns.map((column) => (
                  <td key={column.key} className="max-w-[220px] truncate px-4 py-3 text-xs">
                    {formatValue(row[column.key], column.type)}
                  </td>
                ))}
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-1">
                    <ActionButton label="View" onClick={() => onView(row)} icon={<Eye className="h-4 w-4" />} />
                    <ActionButton label="Edit" onClick={() => onEdit(row)} icon={<Pencil className="h-4 w-4" />} />
                    <ActionButton
                      label="Delete"
                      onClick={() => onDelete(row)}
                      icon={<Trash2 className="h-4 w-4" />}
                      danger
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 lg:hidden">
        {rows.map((row) => (
          <article key={String(row[schema.primaryKey])} className="glass-panel rounded-3xl p-4">
            <div className="space-y-2">
              {schema.columns.map((column) => (
                <div key={column.key} className="flex items-start justify-between gap-3 text-xs">
                  <span className="text-zinc-400">{column.label}</span>
                  <span className="text-right text-zinc-100">{formatValue(row[column.key], column.type)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <ActionButton label="View" onClick={() => onView(row)} icon={<Eye className="h-4 w-4" />} />
              <ActionButton label="Edit" onClick={() => onEdit(row)} icon={<Pencil className="h-4 w-4" />} />
              <ActionButton label="Delete" onClick={() => onDelete(row)} icon={<Trash2 className="h-4 w-4" />} danger />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  icon,
  danger,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs"
      style={
        danger
          ? {
              borderColor: "color-mix(in srgb, var(--accent-tertiary) 40%, transparent)",
              background: "color-mix(in srgb, var(--accent-tertiary) 14%, transparent)",
              color: "color-mix(in srgb, var(--accent-tertiary) 72%, white)",
            }
          : undefined
      }
    >
      {icon}
      {label}
    </button>
  );
}

function formatValue(value: unknown, type: string) {
  if (value == null || value === "") return "-";
  if (type === "boolean") return value ? "Yes" : "No";
  if (type === "datetime") {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  }
  return String(value);
}
