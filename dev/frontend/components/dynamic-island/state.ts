export type IslandView = 'pill' | 'extended' | 'expanded';

export interface IslandActivity {
  id: string;
  label: string;
  status: 'active' | 'complete' | 'failed' | 'cancelled';
  progress: number | null;
}

export interface IslandModel {
  expanded: boolean;
  preview: boolean;
  compact: boolean;
  playing: boolean;
  requests: boolean;
  activity: IslandActivity | null;
  notice: IslandActivity | null;
}

export const INITIAL_ISLAND: IslandModel = {
  expanded: false, preview: false, compact: false,
  playing: false, requests: false, activity: null, notice: null,
};

export type IslandEvent =
  | { type: 'context'; playing: boolean; requests: boolean; activity: IslandActivity | null }
  | { type: 'open' | 'close' | 'compact' | 'preview' | 'end-preview' | 'reset' }
  | { type: 'submitted'; id: string }
  | { type: 'dismiss'; id: string };

/** User expansion is deliberate; progress and completion never close it. */
export function islandReducer(state: IslandModel, event: IslandEvent): IslandModel {
  switch (event.type) {
    case 'reset': return INITIAL_ISLAND;
    case 'open': return { ...state, expanded: true, preview: false, notice: null };
    case 'close': return { ...state, expanded: false, preview: false, compact: false };
    case 'compact': return { ...state, expanded: false, preview: false, compact: true, notice: null };
    case 'preview': return { ...state, preview: true, compact: false };
    case 'end-preview': return { ...state, preview: false };
    case 'submitted': return {
      ...state, expanded: false, preview: false, compact: false,
      notice: { id: event.id, label: 'Added to queue', status: 'complete', progress: 100 },
    };
    case 'dismiss':
      if (state.expanded || state.activity?.status === 'active' || state.notice?.id !== event.id) return state;
      return { ...state, notice: null };
    case 'context': {
      const activity = event.activity;
      const changed = activity?.id !== state.activity?.id || activity?.status !== state.activity?.status;
      let notice = state.notice;
      if (activity?.status === 'active') notice = null;
      else if (changed && !state.expanded) {
        if (activity) notice = { ...activity, id: activity.id + ':' + activity.status };
        else if (state.activity?.status === 'active') {
          notice = { id: state.activity.id + ':complete', label: 'Ready', status: 'complete', progress: 100 };
        }
      }
      return {
        ...state, activity, notice, playing: event.playing, requests: event.requests,
        compact: changed || event.playing !== state.playing ? false : state.compact,
      };
    }
  }
}

export function islandView(state: IslandModel): IslandView {
  if (state.expanded) return 'expanded';
  if (state.activity?.status === 'active' || state.notice || state.preview || state.requests) return 'extended';
  if (!state.compact && state.playing) return 'extended';
  return 'pill';
}
