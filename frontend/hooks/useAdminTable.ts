"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createRow, deleteRow, listRows, updateRow } from "@/lib/admin/api";
import { TABLE_SCHEMAS } from "@/lib/admin/schema";
import { TableKey, TableRow } from "@/types/admin";

const PAGE_SIZE = 8;

export function useAdminTable(table: TableKey, token: string | null) {
  const schema = useMemo(() => TABLE_SCHEMAS.find((item) => item.key === table)!, [table]);

  const [rows, setRows] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState(schema.primaryKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const refresh = useCallback(async () => {
    if (!token) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const next = await listRows(table, token);
      setRows(next);
    } finally {
      setLoading(false);
    }
  }, [table, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredRows = useMemo(() => {
    const lower = query.trim().toLowerCase();
    const searched = lower
      ? rows.filter((row) =>
          Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(lower)),
        )
      : rows;

    const sorted = [...searched].sort((a, b) => {
      const left = String(a[sortKey] ?? "").toLowerCase();
      const right = String(b[sortKey] ?? "").toLowerCase();
      if (left === right) return 0;
      return sortDir === "asc" ? (left > right ? 1 : -1) : left > right ? -1 : 1;
    });

    return sorted;
  }, [rows, query, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, page]);

  const toggleSort = useCallback((key: string) => {
    if (key === sortKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  }, [sortKey]);

  const create = useCallback(async (payload: TableRow) => {
    if (!token) return;
    setSaving(true);
    try {
      await createRow(table, payload, token);
      await refresh();
    } finally {
      setSaving(false);
    }
  }, [refresh, table, token]);

  const update = useCallback(async (id: string, patch: TableRow) => {
    if (!token) return;
    setSaving(true);
    try {
      await updateRow(table, id, patch, token);
      await refresh();
    } finally {
      setSaving(false);
    }
  }, [refresh, table, token]);

  const remove = useCallback(async (id: string) => {
    if (!token) return;
    setSaving(true);
    try {
      await deleteRow(table, id, token);
      await refresh();
    } finally {
      setSaving(false);
    }
  }, [refresh, table, token]);

  return {
    schema,
    rows,
    pagedRows,
    loading,
    saving,
    query,
    setQuery,
    sortKey,
    sortDir,
    toggleSort,
    page,
    totalPages,
    setPage,
    refresh,
    create,
    update,
    remove,
  };
}
