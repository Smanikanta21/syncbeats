import { TableSchema } from "@/types/admin";

export const TABLE_SCHEMAS: TableSchema[] = [
  {
    key: "users",
    title: "Users",
    primaryKey: "id",
    columns: [
      { key: "id", label: "ID", type: "text", editable: false },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "email", label: "Email", type: "text", required: true },
      { key: "auth_provider", label: "Auth Provider", type: "text", required: true },
      { key: "email_verified_at", label: "Email Verified At", type: "datetime" },
      { key: "created_at", label: "Created At", type: "datetime", editable: false },
    ],
  },
  {
    key: "rooms",
    title: "Rooms",
    primaryKey: "id",
    columns: [
      { key: "id", label: "ID", type: "text", editable: false },
      { key: "host_id", label: "Host ID", type: "text", required: true },
      { key: "track_url", label: "Track URL", type: "text" },
      { key: "playback_state", label: "Playback", type: "text", required: true },
      { key: "position_ms", label: "Position (ms)", type: "number", required: true },
      { key: "created_at", label: "Created At", type: "datetime", editable: false },
    ],
  },
  {
    key: "devices",
    title: "Devices",
    primaryKey: "id",
    columns: [
      { key: "id", label: "ID", type: "text", editable: false },
      { key: "user_id", label: "User ID", type: "text", required: true },
      { key: "device_key", label: "Device Key", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "user_agent", label: "User Agent", type: "text" },
      { key: "last_seen_at", label: "Last Seen", type: "datetime", required: true },
    ],
  },
  {
    key: "room_participants",
    title: "Room Participants",
    primaryKey: "id",
    columns: [
      { key: "id", label: "ID", type: "text", editable: false },
      { key: "room_id", label: "Room ID", type: "text", required: true },
      { key: "user_id", label: "User ID", type: "text", required: true },
      { key: "socket_id", label: "Socket ID", type: "text", required: true },
      { key: "display_name", label: "Display Name", type: "text", required: true },
      { key: "joined_at", label: "Joined At", type: "datetime", required: true },
      { key: "left_at", label: "Left At", type: "datetime" },
    ],
  },
];
