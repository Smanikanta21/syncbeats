// lib/feedbackApi.ts — API client for submitting user feedback

import { getRestUrl, getAuthToken } from './api';

export interface FeedbackInput {
  rating: number;
  category?: 'general' | 'audio' | 'sync' | 'ui' | 'bug';
  comment?: string;
  page?: string;
  sessionId?: string;
}

export async function submitFeedback(input: FeedbackInput): Promise<{ ok: boolean; id: string }> {
  const SERVER = getRestUrl();
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const endpoint = SERVER === '/api' ? '/api/feedback' : `${SERVER}/feedback`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to send feedback');
  }

  return res.json();
}
