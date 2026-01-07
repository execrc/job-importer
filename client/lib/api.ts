const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface ImportError {
  externalId?: string;
  title?: string;
  reason: string;
  errorType: string;
}

export interface ImportLogItem {
  id: string;
  fileName: string;
  importDateTime: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total: number;
  new: number;
  updated: number;
  failed: number;
  errors: ImportError[];
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function fetchImportLogs(page = 1, limit = 20): Promise<PaginatedResponse<ImportLogItem>> {
  const response = await fetch(`${API_URL}/api/import/logs?page=${page}&limit=${limit}`);
  if (!response.ok) {
    throw new Error('Failed to fetch import logs');
  }
  return response.json();
}

export async function triggerImport(feedUrl: string): Promise<{ message: string; importLogId: string }> {
  const response = await fetch(`${API_URL}/api/import/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedUrl }),
  });
  if (!response.ok) {
    throw new Error('Failed to trigger import');
  }
  return response.json();
}

export async function triggerAllImports(): Promise<{ message: string; feedCount: number }> {
  const response = await fetch(`${API_URL}/api/import/trigger-all`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to trigger imports');
  }
  return response.json();
}

export async function fetchFeeds(): Promise<{ feeds: string[] }> {
  const response = await fetch(`${API_URL}/api/import/feeds`);
  if (!response.ok) {
    throw new Error('Failed to fetch feeds');
  }
  return response.json();
}

// SSE Types
export interface SSEEvent {
  type: 'connected' | 'import:started' | 'import:progress' | 'import:completed' | 'import:failed';
  importLogId?: string;
  clientId?: string;
  timestamp?: string;
  data?: {
    feedUrl?: string;
    newJobs?: number;
    updatedJobs?: number;
    failedJobs?: number;
    totalFetched?: number;
    error?: string;
  };
}

// SSE Connection utility
export function connectToSSE(
  onEvent: (event: SSEEvent) => void,
  onError: () => void
): EventSource {
  const eventSource = new EventSource(`${API_URL}/api/import/events`);

  eventSource.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data) as SSEEvent;
      onEvent(event);
    } catch {
      console.error('Failed to parse SSE event:', e.data);
    }
  };

  eventSource.onerror = () => {
    console.error('SSE connection error');
    eventSource.close();
    onError();
  };

  return eventSource;
}
