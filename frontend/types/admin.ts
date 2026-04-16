export type TableKey = "users" | "rooms" | "devices" | "room_participants";

export type ColumnType = "text" | "number" | "boolean" | "datetime";

export type CellValue = string | number | boolean | null;

export type TableRow = Record<string, CellValue>;

export interface ColumnDef {
  key: string;
  label: string;
  type: ColumnType;
  editable?: boolean;
  required?: boolean;
}

export interface TableSchema {
  key: TableKey;
  title: string;
  primaryKey: string;
  columns: ColumnDef[];
}

export interface AdminStore {
  users: TableRow[];
  rooms: TableRow[];
  devices: TableRow[];
  room_participants: TableRow[];
}

export interface AdminSession {
  token: string;
  email: string;
  loginAt: string;
}

export interface ToastMessage {
  id: string;
  title: string;
  type: "success" | "error" | "info";
}
