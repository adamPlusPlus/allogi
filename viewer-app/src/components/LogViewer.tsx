import React from 'react';
import { AllogLogEntry } from '../lib/allog-api-client';

interface LogViewerProps {
  logs: AllogLogEntry[];
  highlights: any[];
  onHighlight: any;
  onRemoveHighlight: any;
  isElementHighlighted: any;
  onContextMenu: any;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onClear: () => void;
}

const LogViewer: React.FC<LogViewerProps> = ({
  logs,
  isLoading,
  error,
  onRefresh,
  onClear
}) => {
  if (isLoading) {
    return <div className="no-logs">Loading logs...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (logs.length === 0) {
    return <div className="no-logs">No logs available</div>;
  }

  return (
    <div className="log-viewer">
      <div className="log-controls">
        <button onClick={onRefresh}>Refresh</button>
        <button onClick={onClear}>Clear</button>
      </div>
      <div className="log-list">
        {logs.map((log) => {
          const imageUrl = (log as any).data?.imageUrl as string | undefined;
          const isImage = typeof imageUrl === 'string' && imageUrl.length > 0;
          return (
            <div key={log.id} className="log-entry">
              <div className="log-header">
                <span className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <span className={`log-level ${log.level}`}>{log.level}</span>
                <span className="log-script">{log.scriptId || 'unknown'}</span>
                <span className="log-message">{log.message}</span>
                {/* Quality indicator for raw/malformed logs */}
                {(log as any).quality && (log as any).quality !== 'normal' && (
                  <span className={`log-quality ${(log as any).quality}`}>
                    {(log as any).quality === 'raw-text' ? '📝' : '⚠️'} 
                    {(log as any).quality === 'raw-text' ? 'Raw Text' : 'Malformed'}
                  </span>
                )}
              </div>
              {/* Image preview if present */}
              {isImage && (
                <div className="log-image">
                  <a href={imageUrl} target="_blank" rel="noreferrer">
                    <img src={imageUrl} alt="log" style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 4 }} />
                  </a>
                </div>
              )}
              {log.data && (
                <div className="log-details">
                  <div className="log-data">
                    <strong>Data:</strong>
                    <pre>{JSON.stringify(log.data, null, 2)}</pre>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LogViewer; 