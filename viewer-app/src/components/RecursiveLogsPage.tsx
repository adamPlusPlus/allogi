import React, { useState, useEffect, useCallback } from 'react';
import '../styles/RecursiveLogsPage.css';
import { createAllogApiClient, AllogApiClient } from '../lib/allog-api-client';
import viewerConfig from '../config/config-loader';

// Pure HTTP API approach - no allog imports due to safety constraints

interface RecursiveLogsPageProps {
  serverUrl: string;
  autoRefresh: boolean;
  refreshInterval: number;
}

export default function RecursiveLogsPage({ serverUrl, autoRefresh, refreshInterval }: RecursiveLogsPageProps) {
  const [logs, setLogs] = useState<any[]>([]);
  const [filter, setFilter] = useState({
    level: '',
    scriptId: '',
    search: ''
  });
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalRecursiveLogs: 0,
    byScript: {} as Record<string, number>,
    byLevel: {} as Record<string, number>
  });
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: 'scriptId' | 'level' | 'time' | 'message';
    direction: 'asc' | 'desc';
  } | null>(null);

  // Create API client instance
  const [apiClient] = useState<AllogApiClient>(() => createAllogApiClient(serverUrl));

  // Pure HTTP API fetch functions (no allog imports)
  const fetchLogs = useCallback(async () => {
    console.log('🔄 RecursiveLogsPage: Fetching logs from server:', serverUrl);
    
    // Use API client to get recursive logs
    const recursiveLogs = await apiClient.getRecursiveLogs();
    console.log('✅ RecursiveLogsPage: Received logs:', recursiveLogs.length, 'logs');
    
    return recursiveLogs;
  }, [apiClient, serverUrl]);

  const fetchStats = useCallback(async () => {
    const logStats = await apiClient.getRecursiveLogsStats();
    console.log('📊 RecursiveLogsPage: Received stats:', logStats);
    return logStats;
  }, [apiClient]);

  // Fetch recursive logs from server using API client
  const fetchRecursiveLogs = useCallback(async () => {
    try {
      // Use pure HTTP API functions
      const recursiveLogs = await fetchLogs();
      
      setLogs(recursiveLogs);
      setIsConnected(true);
      setError(null);

      // Use pure HTTP API stats function
      const logStats = await fetchStats();
      setStats(logStats);
    } catch (err) {
      console.error('❌ RecursiveLogsPage: Error fetching logs:', err);
      setError(`Connection failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsConnected(false);
    }
  }, [fetchLogs, fetchStats]);

  // Pure React component lifecycle (no allog imports)
  const componentMount = useCallback(() => {
    console.log('🔄 RecursiveLogsPage: Component mounted');
  }, []);

  const componentUnmount = useCallback(() => {
    console.log('🔄 RecursiveLogsPage: Component unmounting');
  }, []);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;

    // Use a longer refresh interval to prevent excessive API calls
    const effectiveRefreshInterval = Math.max(refreshInterval, 30000); // Minimum 30 seconds

    const interval = setInterval(() => {
      fetchRecursiveLogs();
    }, effectiveRefreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchRecursiveLogs]);

  // Initial fetch and component mount
  useEffect(() => {
    componentMount();
    fetchRecursiveLogs();
    
    // Generate periodic activity logs (pure console, no allog imports)
    const activityInterval = setInterval(() => {
      console.log('🔄 RecursiveLogsPage: Periodic activity heartbeat', {
        component: 'RecursiveLogsPage',
        timestamp: Date.now(),
        logCount: logs.length
      });
    }, 60000); // Every 60 seconds (reduced frequency)
    
    return () => {
      clearInterval(activityInterval);
      componentUnmount();
    };
  }, [fetchRecursiveLogs, componentMount, componentUnmount]);

  // Pure user interaction functions (no allog imports)
  const toggleLogExpansion = useCallback((logId: string) => {
    setExpandedLogs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
    
    // Log user interaction (pure console, no allog imports)
    console.log('🔄 RecursiveLogsPage: User interaction - Log expansion toggled', {
      action: 'toggleLogExpansion',
      logId,
      timestamp: Date.now()
    });
  }, []);

  const handleLogClick = useCallback((log: any) => {
    setSelectedLog(log);
  }, []);

  const requestSort = useCallback((key: 'scriptId' | 'level' | 'time' | 'message') => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
    
    // Log user interaction (pure console, no allog imports)
    console.log('🔄 RecursiveLogsPage: User interaction - Logs sorted', {
      action: 'requestSort',
      sortKey: key,
      timestamp: Date.now()
    });
  }, []);

  // Remove duplicate function definitions (already defined above)

  const getSortIndicator = (key: 'scriptId' | 'level' | 'time' | 'message') => {
    if (sortConfig?.key !== key) return '↕️';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const sortTableData = (data: any[]) => {
    if (!sortConfig) return data;

    return [...data].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      if (sortConfig.key === 'time') {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      } else if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const filteredLogs = logs.filter(log => {
    if (filter.level && log.level !== filter.level) return false;
    if (filter.scriptId && log.scriptId !== filter.scriptId) return false;
    if (filter.search && !log.message.toLowerCase().includes(filter.search.toLowerCase())) return false;
    return true;
  });

  const sortedTableData = sortTableData(filteredLogs);

  const uniqueScriptIds = Array.from(new Set(logs.map(log => log.scriptId))).sort();
  const uniqueLevels = viewerConfig.validLogLevels;

  const getLevelColor = (level: string): string => {
    return viewerConfig.getLogLevelColor(level);
  };

  const getScriptColor = (scriptId: string | undefined | null): string => {
    return viewerConfig.getScriptColor(scriptId || viewerConfig.fallbackValues.scriptId);
  };

  const formatTime = (time: string): string => {
    return new Date(time).toLocaleTimeString();
  };

  return (
    <div className="recursive-logs-page">
      {/* Header */}
      <div className="recursive-logs-header">
        <h2>🔄 Recursive Logs</h2>
        <p className="recursive-logs-description">
          Self-referential logs from the Allog system itself. These logs show how the logging system operates.
        </p>
        <div className="recursive-logs-status">
          <span className="status-indicator">🔄 Active Filtering</span>
          <span className="status-detail">Showing only self-logging scripts</span>
        </div>
      </div>

      {/* Two-Column Layout */}
      <div className="recursive-logs-content">
        {/* Right Column - Logs View (like Logs page) */}
        <div className="recursive-logs-logs-column">
          {/* Filters */}
          <div className="recursive-logs-filters">
            <div className="filter-group">
              <label>Script:</label>
              <select
                value={filter.scriptId}
                onChange={(e) => setFilter(prev => ({ ...prev, scriptId: e.target.value }))}
              >
                <option value="">All Scripts</option>
                {uniqueScriptIds.map(scriptId => (
                  <option key={scriptId} value={scriptId}>
                    {scriptId} ({stats.byScript[scriptId] || 0})
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Level:</label>
              <select
                value={filter.level}
                onChange={(e) => setFilter(prev => ({ ...prev, level: e.target.value }))}
              >
                <option value="">All Levels</option>
                {uniqueLevels.map(level => (
                  <option key={level} value={level}>
                    {level.toUpperCase()} ({stats.byLevel[level] || 0})
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Search:</label>
              <input
                type="text"
                placeholder="Search in messages..."
                value={filter.search}
                onChange={(e) => setFilter(prev => ({ ...prev, search: e.target.value }))}
              />
            </div>

            <button 
              className="clear-btn"
              onClick={() => {
                setFilter({ level: '', scriptId: '', search: '' });
                setSelectedLog(null);
              }}
            >
              Clear Filters
            </button>
          </div>

          {/* Connection Status */}
          {error && (
            <div className="error-message">
              Error: {error}
            </div>
          )}

          {/* Logs List */}
          <div className="recursive-logs-list">
            {filteredLogs.length === 0 ? (
              <div className="no-logs">
                {logs.length === 0 ? 'No recursive logs found' : 'No logs match current filter'}
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div 
                  key={log.id} 
                  className={`log-entry ${expandedLogs.has(log.id) ? 'expanded' : ''} ${selectedLog?.id === log.id ? 'selected' : ''}`}
                  data-script-id={log.scriptId}
                >
                  <div className="log-header" onClick={() => toggleLogExpansion(log.id)}>
                    <div className="log-level" style={{ color: getLevelColor(log.level) }}>
                      {log.level.toUpperCase()}
                    </div>
                    <div className="log-time">{formatTime(log.time)}</div>
                    <div className="log-script" style={{ color: getScriptColor(log.scriptId) }}>
                      {log.scriptId}
                    </div>
                    <div className="log-message">{log.message}</div>
                    <div className="log-expand">▶</div>
                  </div>
                  
                  {expandedLogs.has(log.id) && (
                    <div className="log-details">
                      {log.data && (
                        <div className="log-data">
                          <strong>Data:</strong>
                          <pre>{JSON.stringify(log.data, null, 2)}</pre>
                        </div>
                      )}
                      {log.file && (
                        <div className="log-file">
                          <strong>File:</strong> {log.file}:{log.line}:{log.column}
                          {log.functionName && ` (${log.functionName})`}
                        </div>
                      )}
                      {log.stack && (
                        <div className="log-stack">
                          <strong>Stack:</strong>
                          <pre>{log.stack}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 