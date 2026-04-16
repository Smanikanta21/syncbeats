import { getServerUrl } from "@/lib/api";
import { AdminSession, TableKey, TableRow } from "@/types/admin";

const BASE = getServerUrl();

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

export async function adminLogin(email: string, password: string): Promise<AdminSession> {
  return request<AdminSession>("/admin/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function listRows(table: TableKey, token: string): Promise<TableRow[]> {
  const data = await request<{ rows: TableRow[] }>(`/admin/${table}`, {}, token);
  return data.rows;
}

export async function createRow(table: TableKey, payload: TableRow, token: string): Promise<TableRow> {
  const data = await request<{ row: TableRow }>(
    `/admin/${table}`,
    {
      method: "POST",
      body: JSON.stringify({ payload }),
    },
    token,
  );
  return data.row;
}

export async function updateRow(table: TableKey, id: string, patch: TableRow, token: string): Promise<TableRow> {
  const data = await request<{ row: TableRow }>(
    `/admin/${table}/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ payload: patch }),
    },
    token,
  );
  return data.row;
}

export async function deleteRow(table: TableKey, id: string, token: string): Promise<void> {
  await request<{ ok: boolean }>(
    `/admin/${table}/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    token,
  );
}
