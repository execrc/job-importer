'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  fetchImportLogs,
  triggerAllImports,
  connectToSSE,
  type ImportLogItem,
  type PaginatedResponse,
  type SSEEvent,
} from '@/lib/api';

export default function Home() {
  const [data, setData] = useState<PaginatedResponse<ImportLogItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [page, setPage] = useState(1);
  const [isPolling, setIsPolling] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const loadData = useCallback(
    async (pageNum: number, showLoading = true) => {
      if (showLoading) setLoading(true);
      setError(null);
      try {
        const result = await fetchImportLogs(pageNum);
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    []
  );

  // Initial load
  useEffect(() => {
    loadData(page);
  }, [page, loadData]);

  // SSE connection for real-time updates
  useEffect(() => {
    const handleSSEEvent = (event: SSEEvent) => {
      if (event.type === 'connected') {
        setSseConnected(true);
        setIsPolling(false); // Disable polling when SSE connects
        return;
      }

      // Refresh data on any import event
      if (
        event.type === 'import:started' ||
        event.type === 'import:progress' ||
        event.type === 'import:completed' ||
        event.type === 'import:failed'
      ) {
        loadData(page, false);
      }
    };

    const handleSSEError = () => {
      setSseConnected(false);
      setIsPolling(true); // Enable polling as fallback
    };

    // Connect to SSE
    eventSourceRef.current = connectToSSE(handleSSEEvent, handleSSEError);

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [page, loadData]);

  // Polling fallback when SSE is not connected
  useEffect(() => {
    if (isPolling) {
      pollIntervalRef.current = setInterval(() => {
        loadData(page, false);
      }, 3000); // Poll every 3 seconds as fallback
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [isPolling, page, loadData]);

  const handleTriggerAll = async () => {
    setTriggering(true);
    try {
      await triggerAllImports();
      // SSE will handle updates, but refresh immediately to show new entries
      setTimeout(() => loadData(page, false), 500);
    } catch (err) {
      alert('Failed to trigger import');
    } finally {
      setTriggering(false);
    }
  };

  const handleRefresh = () => {
    loadData(page);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="container">
      <div className="header">
        <div className="header-left">
          <h1>Import History</h1>
          {sseConnected && <span className="polling-indicator">● Live (SSE)</span>}
          {isPolling && !sseConnected && <span className="polling-indicator">● Live (Polling)</span>}
        </div>
        <div className="header-buttons">
          <button type="button" className="btn btn-secondary" onClick={handleRefresh} disabled={loading}>
            Refresh
          </button>
          <button type="button" className="btn btn-primary" onClick={handleTriggerAll} disabled={triggering}>
            {triggering ? 'Importing...' : 'Import All Feeds'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : error ? (
        <div className="error">{error}</div>
      ) : (
        <>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Feed URL</th>
                  <th>Import Time</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>New</th>
                  <th>Updated</th>
                  <th>Failed</th>
                </tr>
              </thead>
              <tbody>
                {data?.data.map((log) => (
                  <tr key={log.id}>
                    <td className="file-name" title={log.fileName}>
                      {log.fileName.replace('https://jobicy.com/?feed=job_feed', 'jobicy')}
                    </td>
                    <td>{formatDate(log.importDateTime)}</td>
                    <td>
                      <span
                        className={`status status-${log.status}`}
                        title={
                          log.status === 'failed' && log.errors?.length > 0
                            ? log.errors.map((e) => e.reason).join('\n')
                            : undefined
                        }
                      >
                        {log.status}
                      </span>
                    </td>
                    <td>{log.total}</td>
                    <td className="count-new">{log.new}</td>
                    <td className="count-updated">{log.updated}</td>
                    <td
                      className="count-failed"
                      title={
                        log.failed > 0 && log.errors?.length > 0
                          ? log.errors.map((e) => `${e.title || e.externalId}: ${e.reason}`).join('\n')
                          : undefined
                      }
                      style={{ cursor: log.failed > 0 ? 'help' : 'default' }}
                    >
                      {log.failed}
                    </td>
                  </tr>
                ))}
                {data?.data.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: '#666' }}>
                      No import history yet. Click "Import All Feeds" to start.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {data && data.pagination.totalPages > 1 && (
            <div className="pagination">
              <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
                Previous
              </button>
              <span>
                Page {page} of {data.pagination.totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page === data.pagination.totalPages}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
