"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, ChevronLeft, ChevronRight, Layers3 } from "lucide-react";
import { AdminNavbar } from "@/components/admin/AdminNavbar";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { DataTable } from "@/components/admin/DataTable";
import { LoginModal } from "@/components/admin/LoginModal";
import { RecordModal } from "@/components/admin/RecordModal";
import { ToastStack } from "@/components/admin/ToastStack";
import { useAdminSession } from "@/hooks/useAdminSession";
import { useAdminTable } from "@/hooks/useAdminTable";
import { TableKey, TableRow, ToastMessage } from "@/types/admin";

export default function AdminPage() {
  const { session, isAuthenticated, bootstrapping, login, logout } = useAdminSession();
  const [activeTable, setActiveTable] = useState<TableKey>("users");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const table = useAdminTable(activeTable, session?.token ?? null);

  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [recordMode, setRecordMode] = useState<"create" | "edit" | "view">("view");
  const [selectedRow, setSelectedRow] = useState<TableRow | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = (title: string, type: ToastMessage["type"] = "info") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [{ id, title, type }, ...prev].slice(0, 4));
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 2600);
  };

  const baseCreateRecord = useMemo(() => {
    const empty: TableRow = {};
    table.schema.columns.forEach((column) => {
      if (column.type === "boolean") empty[column.key] = false;
      else empty[column.key] = "";
    });
    return empty;
  }, [table.schema.columns]);

  const openCreate = () => {
    setRecordMode("create");
    setSelectedRow(baseCreateRecord);
    setRecordModalOpen(true);
  };

  const openView = (row: TableRow) => {
    setRecordMode("view");
    setSelectedRow(row);
    setRecordModalOpen(true);
  };

  const openEdit = (row: TableRow) => {
    setRecordMode("edit");
    setSelectedRow(row);
    setRecordModalOpen(true);
  };

  const openDelete = (row: TableRow) => {
    setPendingDeleteId(String(row[table.schema.primaryKey]));
    setConfirmOpen(true);
  };

  const handleSubmitRecord = async (payload: TableRow) => {
    try {
      if (recordMode === "create") {
        await table.create(payload);
        pushToast("Record created", "success");
      }
      if (recordMode === "edit" && selectedRow) {
        const id = String(selectedRow[table.schema.primaryKey]);
        await table.update(id, payload);
        pushToast("Changes saved", "success");
      }
      setRecordModalOpen(false);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Operation failed", "error");
    }
  };

  const handleDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      await table.remove(pendingDeleteId);
      pushToast("Record deleted", "success");
      setConfirmOpen(false);
      setPendingDeleteId(null);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Delete failed", "error");
    }
  };

  if (bootstrapping) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="mesh-bg" />
      <div className="pointer-events-none absolute left-1/4 top-24 h-72 w-72 rounded-full bg-white/5 blur-[100px]" />
      <div className="pointer-events-none absolute bottom-20 right-20 h-80 w-80 rounded-full bg-zinc-400/5 blur-[120px]" />

      <div className={`transition-all duration-300 ${isAuthenticated ? "" : "pointer-events-none blur-sm"}`}>
        <AdminNavbar
          search={table.query}
          onSearch={table.setQuery}
          onRefresh={() => {
            void table.refresh();
            pushToast("Data refreshed", "info");
          }}
          refreshing={table.loading}
          onLogout={logout}
          onOpenDrawer={() => setDrawerOpen(true)}
        />

        <main className="mx-auto flex w-full max-w-[1500px] gap-4 px-3 pb-10 pt-30 sm:px-6 sm:pt-34">
          <AdminSidebar
            active={activeTable}
            onSelect={(key) => {
              setActiveTable(key);
              table.setPage(1);
            }}
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
          />

          <section className="flex-1">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="glass-panel rounded-[2rem] p-5 sm:p-7"
            >
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-5">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-zinc-100 sm:text-3xl">{table.schema.title}</h2>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-500">Session: {session?.email}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    disabled
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-400"
                  >
                    <Layers3 className="h-4 w-4" />
                    Bulk Actions (soon)
                  </button>
                  <button
                    onClick={openCreate}
                    className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold tracking-wide text-white"
                    style={{
                      background: "linear-gradient(120deg, var(--accent-secondary), var(--accent-primary))",
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Add Record
                  </button>
                </div>
              </div>

              <DataTable
                schema={table.schema}
                rows={table.pagedRows}
                sortKey={table.sortKey}
                sortDir={table.sortDir}
                onSort={table.toggleSort}
                onView={openView}
                onEdit={openEdit}
                onDelete={openDelete}
              />

              <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300">
                <span>
                  Page {table.page} of {table.totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => table.setPage(Math.max(1, table.page - 1))}
                    disabled={table.page <= 1}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4" /> Prev
                  </button>
                  <button
                    onClick={() => table.setPage(Math.min(table.totalPages, table.page + 1))}
                    disabled={table.page >= table.totalPages}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 disabled:opacity-50"
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          </section>
        </main>
      </div>

      <AnimatePresence>
        {!isAuthenticated ? <div className="fixed inset-0 z-40 bg-black/55" /> : null}
      </AnimatePresence>

      <LoginModal
        open={!isAuthenticated}
        onSubmit={async (email, password) => {
          await login(email, password);
          pushToast("Welcome to admin dashboard", "success");
        }}
      />

      <RecordModal
        mode={recordMode}
        open={recordModalOpen}
        schema={table.schema}
        initial={selectedRow}
        onClose={() => setRecordModalOpen(false)}
        onSubmit={handleSubmitRecord}
        saving={table.saving}
      />

      <ConfirmDialog
        open={confirmOpen}
        title="Delete record"
        message="This action cannot be undone. Please confirm deletion."
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          void handleDelete();
        }}
        pending={table.saving}
      />

      <ToastStack messages={toasts} />
    </div>
  );
}
