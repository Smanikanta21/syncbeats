import type { TrackActivity } from './types';

/** Keep concurrent transfers, so one sender finishing cannot dismiss another sender. */
export function updateTransferActivities(previous: ReadonlyMap<string, TrackActivity>, activity: TrackActivity): Map<string, TrackActivity> {
  const next = new Map([...previous].filter(([, entry]) => entry.status === 'active'));
  next.delete(activity.id);
  next.set(activity.id, activity);
  return next;
}

export function visibleTransferActivity(activities: ReadonlyMap<string, TrackActivity>): TrackActivity | null {
  const entries = [...activities.values()];
  return entries.filter(entry => entry.status === 'active').at(-1) ?? entries.at(-1) ?? null;
}
