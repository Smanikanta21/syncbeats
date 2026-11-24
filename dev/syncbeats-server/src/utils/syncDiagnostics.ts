const statuses = new Set(['idle', 'paused', 'ended', 'clock-untrusted', 'audio-locked',
  'audio-not-ready', 'track-mismatch', 'scheduled', 'start-pending', 'position-unavailable', 'active']);
const numericFields = ['clockOffsetMs', 'renderPositionSec', 'outputPositionSec', 'expectedPositionSec',
  'signedDriftMs', 'measuredLatencyMs', 'estimatedLatencyMs', 'manualLatencyMs', 'thresholdMs'] as const;

/** Only diagnostic fields reach logs; arbitrary client payloads never do. */
export function normalizeSyncDiagnostic(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.roomId !== 'string' || !/^\d{6}$/.test(value.roomId) ||
      typeof value.status !== 'string' || !statuses.has(value.status)) return null;
  const result: Record<string, unknown> = { roomId: value.roomId, status: value.status };
  for (const key of numericFields) result[key] = typeof value[key] === 'number' &&
    Number.isFinite(value[key]) && Math.abs(value[key] as number) <= 1e9 ? value[key] : null;
  result.tabVisible = value.tabVisible === true;
  result.deviceType = typeof value.deviceType === 'string' && /^[a-zA-Z0-9_-]{1,30}$/.test(value.deviceType)
    ? value.deviceType : 'unknown';
  result.correction = ['synced', 'crossfade', 'emergency'].includes(value.correction as string)
    ? value.correction : 'unknown';
  return result;
}
