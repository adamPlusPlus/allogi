import React, { useState, useEffect, useCallback, useRef } from 'react';
import './styles/App.css';
import './styles/MonitoringPage.css';
import MonitoringPage from './components/MonitoringPage';
import RecursiveLogsPage from './components/RecursiveLogsPage';
import InstrumentationPage from './components/InstrumentationPage';
import SaveSystem, { SaveItem, SaveNode, SaveSystemRef } from './components/SaveSystem';
import ContextMenu, { ContextMenuItem } from './components/ContextMenu';
import { useContextMenu } from './hooks/useContextMenu';
import { useHighlights } from './hooks/useHighlights';
import ScreenshotOverlayModal from './components/ScreenshotOverlayModal';
import Settings from './components/Settings';
import { log } from './utils/AllogLogger';
import viewerConfig from './config/config-loader';

interface MonitoringStats {
  totalModules: number;
  totalScripts: number;
  totalVariables: number;
  totalStates: number;
  totalFunctions: number;
  totalProperties: number;
  totalEvents: number;
  lastUpdate: string;
}

interface MonitoringConnectionStatus {
  isConnected: boolean;
  lastConnected?: string;
  error?: string;
  retryCount: number;
}

  interface LogEntry {
  id: string;
  scriptId: string;
  message: string;
  time: string;
    level: 'info' | 'warn' | 'error' | 'debug' | 'test';
  data?: any;
  stack?: string;
}

interface LogStats {
  totalLogs: number;
  bufferSize: number;
  enabledModules: number;
  totalModules: number;
  logLevels: {
    info: number;
    warn: number;
    error: number;
    debug: number;
  };
  lastUpdate: string;
}

interface ConnectionStatus {
  isConnected: boolean;
  lastConnected?: string;
  error?: string;
  retryCount: number;
}

function App() {
  const [currentView, setCurrentView] = useState<'logs' | 'monitoring' | 'recursive' | 'instrumentation'>('logs');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const saveSystemRef = useRef<SaveSystemRef>(null);
  const handleCreateHighlight = useCallback((highlightData: any) => {
    // This will be called when a highlight is created from the context menu
    // We'll pass it to the SaveSystem via the SaveSystem's onCreateHighlight prop
    // For now, we'll use the fallback behavior in useContextMenu
    log.info('App', 'Highlight created from context menu', highlightData);
  }, []);

  const { contextMenu, showContextMenu, hideContextMenu, createHighlight } = useContextMenu({
    onCreateHighlight: handleCreateHighlight
  });
  const { getHighlightStyles, isElementHighlighted } = useHighlights();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logStats, setLogStats] = useState<LogStats>({
    totalLogs: 0,
    bufferSize: 0,
    enabledModules: 0,
    totalModules: 0,
    logLevels: { info: 0, warn: 0, error: 0, debug: 0 },
    lastUpdate: new Date().toISOString()
  });
  const [connection, setConnection] = useState<ConnectionStatus>(viewerConfig.getInitialConnectionStatus());
  const [monitoringConnection, setMonitoringConnection] = useState<MonitoringConnectionStatus>(viewerConfig.getInitialConnectionStatus());
  const [monitoringStats, setMonitoringStats] = useState<MonitoringStats>(viewerConfig.getInitialMonitoringStats());
  const [autoRefresh, setAutoRefresh] = useState(viewerConfig.autoRefreshEnabled);
  const [refreshInterval, setRefreshInterval] = useState(viewerConfig.defaultRefreshInterval);
  const [saveSystemOpen, setSaveSystemOpen] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [screenshotModal, setScreenshotModal] = useState<{ open: boolean; imageUrl?: string; overlay?: any }>({ open: false });
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info'; visible: boolean }>({ message: '', type: 'info', visible: false });
  const [filter, setFilter] = useState({
    level: '',
    scriptId: '',
    search: '',
    sourceId: '',
    startDate: '',
    endDate: ''
  });

  // Define getCurrentData after state variables are defined
  const getCurrentData = useCallback(() => {
    if (currentView === 'logs') {
      return {
        view: 'logs',
        logs: logs,
        stats: logStats,
        filters: filter,
        autoRefresh: autoRefresh,
        refreshInterval: refreshInterval
      };
    } else {
      return {
        view: 'monitoring',
        // Add monitoring data when available
      };
    }
  }, [currentView, logs, logStats, filter, autoRefresh, refreshInterval]);

  // Show notification helper
  const showNotification = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ message, type, visible: true });
    setTimeout(() => setNotification(prev => ({ ...prev, visible: false })), 3000);
  }, []);

  // Heuristic to match server recursive classification (checks scriptId or sourceId)
  const isRecursive = useCallback((log: LogEntry | (LogEntry & { sourceId?: string; recursive?: boolean })) => {
    if ((log as any).recursive === true) return true;
    if ((log as any).recursive === false) return false;
    const sourceOrScript = ((log as any).scriptId || (log as any).sourceId || '').toLowerCase();
    const msg = (log.message || '').toLowerCase();
    return sourceOrScript.includes('viewer') || sourceOrScript.includes('allog') || msg.includes('viewer') || msg.includes('webpack');
  }, []);

  // WebSocket realtime updates for Logs view
  useEffect(() => {
    // Prefer explicit WS endpoint when provided at build time; otherwise derive from API target or sensible defaults
    const envWs = (process as any)?.env?.WS_TARGET as string | undefined;
    const envApi = (process as any)?.env?.API_TARGET as string | undefined;
    let wsUrl: string;
    if (envWs && typeof envWs === 'string' && envWs.length > 0) {
      wsUrl = envWs;
    } else if (envApi && typeof envApi === 'string' && envApi.length > 0) {
      try {
        const apiUrl = new URL(envApi);
        const proto = apiUrl.protocol === 'https:' ? 'wss' : 'ws';
        // Prefer explicit port if provided; otherwise rely on default scheme port
        const portSegment = apiUrl.port ? `:${apiUrl.port}` : '';
        wsUrl = `${proto}://${apiUrl.hostname}${portSegment}`;
      } catch {
        const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const host = window.location.hostname;
        const currentPort = window.location.port;
        // WebSocket is served from the server port, not the viewer port
        const targetPort = currentPort === viewerConfig.viewerPort.toString() ? 
          viewerConfig.serverPort.toString() : 
          (currentPort || viewerConfig.serverPort.toString());
        wsUrl = `${wsProto}://${host}:${targetPort}`;
      }
    } else {
      const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const host = window.location.hostname;
      const currentPort = window.location.port;
      // If viewer runs on viewer port (dev), default WS to server port; otherwise use current port when available
      const targetPort = currentPort === viewerConfig.viewerPort.toString() ? 
        viewerConfig.serverPort.toString() : 
        (currentPort || viewerConfig.serverPort.toString());
      wsUrl = `${wsProto}://${host}:${targetPort}`;
    }

    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(wsUrl);
      socket.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as any);
          if (msg.type === 'new_log') {
            // Normalize incoming server payload to viewer shape
            const raw = msg.data as any;
            const log: LogEntry = {
              id: raw.id,
              scriptId: raw.scriptId || raw.sourceId || 'unknown',
              message: raw.message,
              time: raw.time || raw.timestamp || raw.serverReceivedAt || new Date().toISOString(),
              level: raw.level,
              data: raw.data,
              stack: raw.stack
            };
            // Only inject non-recursive into Logs view state
            if (!isRecursive({ ...log, recursive: raw.recursive })) {
              setLogs((prev) => {
                if (prev.some((l) => l.id === log.id)) return prev; // de-dup by id
                return [log, ...prev];
              });
            }
          }
          if (msg.type === 'logs_cleared') {
            setLogs([]);
            setSelectedLog(null);
          }
          if (msg.type === 'new_screenshot') {
            // Optionally surface a quick toast or auto-open; for now just no-op.
            // Hook is in place if we decide to add a toast system.
          }
          if (msg.type === 'monitoring_update') {
            // Real-time monitoring data updates
            // The MonitoringPage component will handle fetching updated data
            // We could add a callback here to trigger refresh in MonitoringPage
            log.info('App', 'Received monitoring update', msg.data);
          }
        } catch {}
      };
    } catch {}
    return () => {
      try { socket && socket.close(); } catch (error) {
        console.warn('[App] Failed to close socket:', error);
      }
    };
  }, [isRecursive]);

  // Fetch logs from the API
  const fetchLogs = useCallback(async () => {
    try {
      const response = await fetch('/api/logs?includeRecursive=false');
      if (response.ok) {
        const data = await response.json();
        const normalized: LogEntry[] = (data.logs || []).map((raw: any) => ({
          id: raw.id,
          scriptId: raw.scriptId || raw.sourceId || 'unknown',
          message: raw.message,
          time: raw.time || raw.timestamp || raw.serverReceivedAt || new Date().toISOString(),
          level: raw.level,
          data: raw.data,
          stack: raw.stack
        }));
        // Ensure only non-recursive items populate Logs view
        setLogs(normalized.filter((l, i) => !isRecursive({ ...l, recursive: (data.logs || [])[i]?.recursive })));
        // Clear selection if the selected log no longer exists
        setSelectedLog((prev) => (prev && normalized.some(l => l.id === prev.id) ? prev : null));
      }
    } catch (error) {
      log.error('App', 'Failed to fetch logs', error);
    }
  }, []);

  // Fetch stats from the API
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/status');
      if (response.ok) {
        const data = await response.json();
        setLogStats(data);
        setConnection(prev => ({ ...prev, isConnected: true, error: undefined }));
      }
    } catch (error) {
      log.error('App', 'Failed to fetch stats', error);
      setConnection(prev => ({ 
        ...prev, 
        isConnected: false, 
        error: 'Connection failed',
        retryCount: prev.retryCount + 1
      }));
    }
  }, []);

  // Clear logs
  const clearLogs = useCallback(async () => {
    try {
      // Prefer DELETE /api/logs; keep POST fallback if proxied server supports it
      let ok = false;
      try {
        const res = await fetch('/api/logs', { method: 'DELETE' });
        ok = res.ok;
      } catch (error) {
        console.warn('[App] DELETE /api/logs failed, trying fallback:', error);
      }
      if (!ok) {
        const response = await fetch('/api/logs/clear', { method: 'POST' });
        ok = response.ok;
      }
      if (ok) {
        setLogs([]);
        await fetchStats();
      }
    } catch (error) {
      log.error('App', 'Failed to clear logs', error);
    }
  }, [fetchStats]);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      if (currentView === 'logs') {
        fetchLogs();
        fetchStats();
      }
    }, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchLogs, fetchStats, currentView]);

  // Initial fetch
  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [fetchLogs, fetchStats]);

  // Filtered logs
  const filteredLogs = logs.filter(log => {
    if (filter.scriptId && !log.scriptId.includes(filter.scriptId)) return false;
    if (filter.level && log.level !== filter.level) return false;
    if (filter.search && !log.message.toLowerCase().includes(filter.search.toLowerCase())) return false;
    return true;
  });

  // Get unique script IDs for filter dropdown
  const scriptIds = Array.from(new Set(logs.map(log => log.scriptId))).sort();

  // Toggle log expansion
  const toggleLogExpansion = (logId: string) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
    }
    setExpandedLogs(newExpanded);
  };

  // Select a log to show details panel
  const handleSelectLog = (log: LogEntry) => {
    setSelectedLog(log);
  };




  // Save logs to user's directory
  const saveLogsToDirectory = useCallback(async () => {
    try {
      if ('showDirectoryPicker' in window) {
        const dirHandle = await (window as any).showDirectoryPicker();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `logs_${timestamp}.json`;
        
        const logsData = {
          timestamp,
          totalLogs: logs.length,
          logs: logs.map(log => ({
            id: log.id,
            scriptId: log.scriptId,
            level: log.level,
            time: log.time,
            message: log.message,
            data: log.data,
            stack: log.stack
          }))
        };
        
        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(logsData, null, 2));
        await writable.close();
        
        log.info('App', `Logs saved to: ${filename}`);
      }
    } catch (error) {
      console.warn('Could not save logs to directory:', error);
    }
  }, [logs]);

  // Copy details to clipboard
  const copySelectedLogToClipboard = useCallback(() => {
    if (!selectedLog) return;
    const payload = {
      id: selectedLog.id,
      scriptId: selectedLog.scriptId,
      level: selectedLog.level,
      time: selectedLog.time,
      message: selectedLog.message,
      data: selectedLog.data,
      stack: selectedLog.stack
    };
    try {
      navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    } catch {}
  }, [selectedLog]);

  const getValueType = (value: any): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    const t = typeof value;
    if (t === 'object') return 'object';
    if (t === 'string') return 'string';
    if (t === 'number') return 'number';
    if (t === 'boolean') return 'boolean';
    return 'unknown';
  };

  const formatValue = (value: any): string => {
    const type = getValueType(value);
    switch (type) {
      case 'object':
      case 'array':
        try { return JSON.stringify(value, null, 2); } catch { return String(value); }
      case 'string':
      case 'number':
      case 'boolean':
      case 'null':
      case 'undefined':
        return String(value);
      default:
        try { return JSON.stringify(value); } catch { return String(value); }
    }
  };

  // Handle right-click on log elements (only on Alt+Right-click)
  // Double-click detection for native context menu
  const doubleClickRefs = useRef<Map<string, { lastClick: number; timeout: NodeJS.Timeout | null }>>(new Map());

  const handleLogRightClick = (e: React.MouseEvent, log: LogEntry) => {
    const elementId = `log-${log.id}`;
    const now = Date.now();
    const doubleClickData = doubleClickRefs.current.get(elementId);
    
    // Check for double-click (within 300ms)
    if (doubleClickData && (now - doubleClickData.lastClick) < 300) {
      // Clear the timeout since we're handling the double-click
      if (doubleClickData.timeout) {
        clearTimeout(doubleClickData.timeout);
      }
      doubleClickRefs.current.delete(elementId);
      
      // Allow the browser's native context menu to show
      log.debug('App', 'Double right-click detected - allowing native context menu');
      return;
    }
    
    // Clear any existing timeout for this element
    if (doubleClickData?.timeout) {
      clearTimeout(doubleClickData.timeout);
    }
    
    // Set up for potential double-click
    const timeout = setTimeout(() => {
      doubleClickRefs.current.delete(elementId);
    }, 300);
    
    doubleClickRefs.current.set(elementId, {
      lastClick: now,
      timeout
    });
    
    // Show our custom context menu on single right-click
    e.preventDefault();
    e.stopPropagation();
    
    const highlightData = {
      name: log.message.substring(0, 50) + (log.message.length > 50 ? '...' : ''),
      description: `Log Entry: ${log.message}\n\nScript: ${log.scriptId}\nLevel: ${log.level}\nTime: ${new Date(log.time).toLocaleString()}\n\n${log.data ? `Data: ${JSON.stringify(log.data, null, 2)}` : ''}\n\n${log.stack ? `Stack: ${log.stack}` : ''}`,
      scriptId: log.scriptId,
      tags: [log.scriptId, log.level, 'log'],
      data: {
        logId: log.id,
        scriptId: log.scriptId,
        level: log.level,
        time: log.time,
        message: log.message,
        data: log.data,
        stack: log.stack
      }
    };

    showContextMenu(e.clientX, e.clientY, highlightData, e.currentTarget as HTMLElement);
  };

  // Save System Handlers
  const handleSave = useCallback((item: SaveItem) => {
    try {
      log.info('App', 'Saving item', { name: item.name, type: item.type });
      
      // The SaveSystem handles the actual persistence
      // We can enhance the saved item with current app state data
      const currentData = getCurrentData();
      
      // Update the item's metadata with current state if it's a relevant type
      if (item.type === 'view-preset' || item.type === 'log-session' || item.type === 'filter-preset') {
        if (item.metadata) {
          (item.metadata as any).data = {
            ...(item.metadata as any).data,
            ...currentData,
            savedAt: new Date().toISOString()
          };
          item.metadata.updatedAt = new Date().toISOString();
        }
      }
      
      log.info('App', 'Enhanced save item with current state', { name: item.name });
    } catch (error) {
      log.error('App', 'Failed to enhance save item', error);
    }
  }, [getCurrentData]);

  const handleLoad = useCallback((item: SaveItem) => {
    try {
      log.info('App', 'Loading item', { name: item.name, type: item.type });
      
      // Handle different types of saved items
      switch (item.type) {
        case 'filter-preset': {
          // Apply filter settings
          if ((item.metadata as any)?.data?.filters) {
            setFilter((item.metadata as any).data.filters);
            log.info('App', 'Applied filter preset', { name: item.name });
          }
          break;
        }
        
        case 'view-preset': {
          // Apply view settings including current view, filters, and UI state
          const savedData = (item.metadata as any)?.data;
          if (savedData) {
            if (savedData.view) {
              setCurrentView(savedData.view);
            }
            if (savedData.filters) {
              setFilter(savedData.filters);
            }
            if (savedData.autoRefresh !== undefined) {
              setAutoRefresh(savedData.autoRefresh);
            }
            log.info('App', 'Applied view preset', { name: item.name });
          }
          break;
        }
        
        case 'log-session': {
          // Apply saved logs and related settings
          const savedData = (item.metadata as any)?.data;
          if (savedData) {
            if (savedData.logs) {
              setLogs(savedData.logs);
            }
            if (savedData.filters) {
              setFilter(savedData.filters);
            }
            if (savedData.stats) {
              setLogStats(savedData.stats);
            }
            log.info('App', 'Applied log session', { name: item.name });
          }
          break;
        }
        
        case 'monitoring-session': {
          // Switch to monitoring view and apply saved settings
          setCurrentView('monitoring');
          log.info('App', 'Switched to monitoring view for session', { name: item.name });
          break;
        }
        
        case 'highlight': {
          // Highlights are handled by the highlight system
          log.info('App', 'Highlight loaded', { name: item.name });
          break;
        }
        
        case 'comparison': {
          // Comparison items could be handled by opening a comparison view
          log.info('App', 'Comparison loaded', { name: item.name });
          break;
        }
        
        case 'profile': {
          // Profile switching is handled by the SaveSystem itself
          log.info('App', 'Profile loaded', { name: item.name });
          break;
        }
        
        default: {
          // Handle generic SaveNode items
          const saveNode = item as any;
          if (saveNode.metadata?.data) {
            log.info('App', 'Loading generic save node', saveNode.metadata.data);
            // Apply generic data - this could be extended based on data structure
          }
          break;
        }
      }
      
      // If the item has importedState (from import), apply it
      if ((item.metadata as any)?.importedState) {
        const importedState = (item.metadata as any).importedState;
        if (importedState.view) {
          setCurrentView(importedState.view);
        }
        if (importedState.filters) {
          setFilter(importedState.filters);
        }
        log.info('App', 'Applied imported state from', { name: item.name });
      }
      
    } catch (error) {
      log.error('App', 'Failed to load item', error);
      alert(`Failed to load ${item.name}: ${(error as Error).message}`);
    }
  }, []);

  const handleDelete = useCallback((itemId: string) => {
        log.info('App', 'Deleting item', { itemId });
    // The SaveSystem handles its own persistence, so we just need to trigger a re-render
  }, []);

  const handleExport = useCallback(async (item: SaveItem, format: 'json' | 'server-export' = 'json') => {
    try {
      if (format === 'server-export') {
        // Trigger server-side export based on item type
        await handleServerExport(item);
        return;
      }

      // Client-side export (existing functionality)
      const exportData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        exportedBy: 'Allog Viewer',
        item: item,
        // Include current app state if exporting current view
        ...(item.type === 'view-preset' && {
          currentState: getCurrentData()
        })
      };

      // Convert to JSON string with pretty formatting
      const jsonString = JSON.stringify(exportData, null, 2);
      
      // Create download blob
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Create temporary download link
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename based on item type and name
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const sanitizedName = item.name.replace(/[^a-zA-Z0-9-_]/g, '-');
      link.download = `allog-${item.type}-${sanitizedName}-${timestamp}.json`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      // Show success feedback (you could replace this with a toast notification)
      log.info('Export', `Successfully exported: ${item.name}`);
      
    } catch (error) {
      log.error('App', 'Failed to export item', error);
      // You could show an error notification here
    }
  }, [getCurrentData]);

  // Server-side export handler
  const handleServerExport = useCallback(async (item: SaveItem) => {
    try {
      let exportUrl = '';
      const currentData = getCurrentData();

      switch (item.type) {
        case 'log-session': {
          // Export logs with current filters
          const params = new URLSearchParams({
            format: 'json',
            ...(filter.level && { level: filter.level }),
            ...(filter.sourceId && { sourceId: filter.sourceId }),
            ...(filter.scriptId && { scriptId: filter.scriptId }),
            ...(filter.startDate && { start: filter.startDate }),
            ...(filter.endDate && { end: filter.endDate })
          });
          exportUrl = `/api/export/logs?${params}`;
          break;
        }
        
        case 'monitoring-session': {
          // Export monitoring data
          const params = new URLSearchParams({ format: 'json' });
          exportUrl = `/api/export/monitoring?${params}`;
          break;
        }
        
        case 'view-preset':
        case 'filter-preset':
        case 'profile': {
          // These are client-side only, fall back to normal export
          await handleExport(item, 'json');
          return;
        }
        
        default: {
          // Full backup for unknown types
          exportUrl = '/api/export/backup';
          break;
        }
      }

      // Open server export URL in new tab for download
      window.open(exportUrl, '_blank');
      
      log.info('App', 'Server export initiated', { type: item.type, url: exportUrl });
    } catch (error) {
      log.error('App', 'Server export failed', error);
    }
  }, [getCurrentData, filter, handleExport]);

  // Bulk export functionality
  const handleBulkExport = useCallback(async (items: SaveItem[], format: 'json' | 'csv' = 'json') => {
    try {
      if (items.length === 0) return;

      // Group items by type for efficient export
      const itemsByType = items.reduce((acc, item) => {
        if (!acc[item.type]) acc[item.type] = [];
        acc[item.type].push(item);
        return acc;
      }, {} as Record<string, SaveItem[]>);

      const bulkExportData = {
        metadata: {
          exportedAt: new Date().toISOString(),
          exportedBy: 'allog-viewer',
          version: '1.0',
          totalItems: items.length,
          itemTypes: Object.keys(itemsByType)
        },
        items: itemsByType
      };

      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `allog-bulk-export-${timestamp}.json`;

      const jsonString = JSON.stringify(bulkExportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();

      URL.revokeObjectURL(url);

      log.info('App', 'Bulk export completed', { 
        filename, 
        itemCount: items.length, 
        types: Object.keys(itemsByType) 
      });
    } catch (error) {
      log.error('App', 'Bulk export failed', error);
    }
  }, []);

  const handleImport = useCallback((data: any) => {
    try {
      // If data is a File object, read it
      if (data instanceof File) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const fileContent = e.target?.result as string;
            const parsedData = JSON.parse(fileContent);
            handleImport(parsedData); // Recursive call with parsed data
          } catch (parseError) {
            log.error('App', 'Failed to parse imported file', parseError);
            alert('Invalid JSON file format');
          }
        };
        reader.readAsText(data);
        return;
      }

      // Handle different import formats
      if (isBulkExport(data)) {
        handleBulkImport(data);
        return;
      }

      if (isServerBackup(data)) {
        handleServerBackupImport(data);
        return;
      }

      // Standard single item import
      handleSingleItemImport(data);
      
    } catch (error) {
      log.error('App', 'Failed to import data', error);
      alert(`Import failed: ${(error as Error).message}`);
    }
  }, []);

  // Helper to detect bulk export format
  const isBulkExport = (data: any): boolean => {
    return data.metadata && data.items && typeof data.items === 'object';
  };

  // Helper to detect server backup format
  const isServerBackup = (data: any): boolean => {
    return data.metadata && (data.logs || data.monitoringData) && data.metadata.version?.includes('backup');
  };

  // Handle single item import (existing functionality)
  const handleSingleItemImport = useCallback((data: any) => {
    // Validate import data structure
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid import data format');
    }

    // Check for required fields
    if (!data.item || !data.version) {
      throw new Error('Import file missing required fields (item, version)');
    }

    const importedItem = data.item;

    // Validate the imported item
    if (!importedItem.id || !importedItem.name || !importedItem.type) {
      throw new Error('Imported item missing required fields (id, name, type)');
    }

    // Generate new ID to prevent conflicts
    const newId = `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const importedItemWithNewId = {
      ...importedItem,
      id: newId,
      name: `${importedItem.name} (Imported)`,
      metadata: {
        ...importedItem.metadata,
        importedAt: new Date().toISOString(),
        originalId: importedItem.id,
        importedFrom: data.exportedBy || 'Unknown',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };

    // If this is a view-preset and has current state, apply it
    if (importedItem.type === 'view-preset' && data.currentState) {
      // Store the current state in the item's metadata for potential restoration
      importedItemWithNewId.metadata.importedState = data.currentState;
    }

    // Add the item to localStorage
    const existingSaveData = localStorage.getItem('allog-save-system');
    let saveData = existingSaveData ? JSON.parse(existingSaveData) : { items: [] };
    
    saveData.items.push(importedItemWithNewId);
    localStorage.setItem('allog-save-system', JSON.stringify(saveData));
    
    // Reload the page to reflect the imported item
    window.location.reload();
    
    log.info('App', 'Successfully imported', { name: importedItemWithNewId.name });
  }, []);

  // Handle bulk import
  const handleBulkImport = useCallback((data: any) => {
    const { metadata, items } = data;
    let importedCount = 0;
    let skippedCount = 0;

    const existingSaveData = localStorage.getItem('allog-save-system');
    let saveData = existingSaveData ? JSON.parse(existingSaveData) : { items: [] };

    // Import items by type
    Object.entries(items).forEach(([itemType, itemList]: [string, any]) => {
      if (Array.isArray(itemList)) {
        itemList.forEach((item) => {
          try {
            const newId = `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const importedItem = {
              ...item,
              id: newId,
              name: `${item.name} (Bulk Import)`,
              metadata: {
                ...item.metadata,
                importedAt: new Date().toISOString(),
                originalId: item.id,
                importedFrom: 'Bulk Export',
                bulkImportId: metadata.exportedAt,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }
            };

            saveData.items.push(importedItem);
            importedCount++;
          } catch (error) {
            log.error('App', 'Failed to import bulk item', error);
            skippedCount++;
          }
        });
      }
    });

    localStorage.setItem('allog-save-system', JSON.stringify(saveData));
    
    log.info('App', 'Bulk import completed', { 
      imported: importedCount, 
      skipped: skippedCount,
      types: Object.keys(items)
    });

    alert(`Bulk import completed: ${importedCount} items imported, ${skippedCount} skipped`);
    window.location.reload();
  }, []);

  // Handle server backup import
  const handleServerBackupImport = useCallback(async (data: any) => {
    try {
      // Ask user if they want to import as server data or convert to client items
      const importAsServerData = confirm(
        'This appears to be a server backup. Import as server data (replaces server data) or convert to client items?'
      );

      if (importAsServerData) {
        // Send to server import endpoint
        const response = await fetch('/api/import/backup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data)
        });

        if (response.ok) {
          const result = await response.json();
          alert(`Server import completed: ${JSON.stringify(result.results, null, 2)}`);
          log.info('App', 'Server backup imported', result);
        } else {
          throw new Error(`Server import failed: ${response.statusText}`);
        }
      } else {
        // Convert server backup to client items
        convertServerBackupToClientItems(data);
      }
    } catch (error) {
      log.error('App', 'Server backup import failed', error);
      alert(`Server backup import failed: ${(error as Error).message}`);
    }
  }, []);

  // Convert server backup data to client-side save items
  const convertServerBackupToClientItems = useCallback((data: any) => {
    const existingSaveData = localStorage.getItem('allog-save-system');
    let saveData = existingSaveData ? JSON.parse(existingSaveData) : { items: [] };
    let convertedCount = 0;

    // Convert monitoring data to monitoring sessions
    if (data.monitoringData && Array.isArray(data.monitoringData)) {
      const monitoringSession = {
        id: `converted-monitoring-${Date.now()}`,
        name: `Monitoring Session (${new Date(data.metadata.backupCreatedAt).toLocaleDateString()})`,
        type: 'monitoring-session',
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          convertedFromBackup: true,
          originalBackupDate: data.metadata.backupCreatedAt,
          entryCount: data.monitoringData.length
        }
      };
      
      saveData.items.push(monitoringSession);
      convertedCount++;
    }

    // Convert logs to log sessions (if there are many logs)
    if (data.logs && Array.isArray(data.logs) && data.logs.length > 0) {
      const logSession = {
        id: `converted-logs-${Date.now()}`,
        name: `Log Session (${new Date(data.metadata.backupCreatedAt).toLocaleDateString()})`,
        type: 'log-session',
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          convertedFromBackup: true,
          originalBackupDate: data.metadata.backupCreatedAt,
          logCount: data.logs.length
        }
      };
      
      saveData.items.push(logSession);
      convertedCount++;
    }

    localStorage.setItem('allog-save-system', JSON.stringify(saveData));
    
    log.info('App', 'Server backup converted to client items', { 
      convertedCount,
      originalBackup: data.metadata.backupCreatedAt
    });

    alert(`Converted ${convertedCount} server backup items to client save items`);
    window.location.reload();
  }, []);

  // Render logs view
  const renderLogsView = () => (
    <div className="app">
      {/* Filters */}
      <div className="filters">
        <select
          value={filter.scriptId}
          onChange={(e) => setFilter(prev => ({ ...prev, scriptId: e.target.value }))}
        >
          <option value="">All Scripts</option>
          {scriptIds.map(id => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
                  <select 
            value={filter.level} 
            onChange={(e) => setFilter(prev => ({ ...prev, level: e.target.value }))}
          >
            <option value="">All Levels</option>
            {viewerConfig.validLogLevels.map(level => (
              <option key={level} value={level}>
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </option>
            ))}
          </select>
        <input
          type="text"
          placeholder="Search logs..."
          value={filter.search}
          onChange={(e) => setFilter(prev => ({ ...prev, search: e.target.value }))}
        />
        <button onClick={clearLogs} className="clear-btn">
          Clear Logs
        </button>
        <button onClick={saveLogsToDirectory} className="save-btn">
          💾 Save Logs
        </button>
      </div>
      <div className="monitoring-content">
        {/* Left: Logs list */}
        <div className="monitoring-main">
          <div className="log-list">
            {filteredLogs.length === 0 ? (
              <div className="no-logs">
                {!connection.isConnected ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">🔌</div>
                    <div className="empty-state-title">Not Connected</div>
                    <div className="empty-state-description">
                      Unable to connect to the Allog intermediary server.<br/>
                      Make sure the server is running on port {viewerConfig.serverPort}.
                    </div>
                  </div>
                ) : logs.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">📋</div>
                    <div className="empty-state-title">No Logs Yet</div>
                    <div className="empty-state-description">
                      No log entries have been received from any source.<br/>
                      Start sending logs using the Allog client library or test client.
                    </div>
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-state-icon">🔍</div>
                    <div className="empty-state-title">No Matching Logs</div>
                    <div className="empty-state-description">
                      No logs match your current filters.<br/>
                      Try adjusting your search criteria or clearing filters.
                    </div>
                  </div>
                )}
              </div>
            ) : (
              filteredLogs.map((log) => {
                const highlightStyles = getHighlightStyles('log', log.scriptId, undefined, undefined, log.message);
                const isSelected = selectedLog?.id === log.id;
                return (
                <div 
                  key={log.id} 
                  className={`log-entry log-${log.level} ${isSelected ? 'selected' : ''} ${highlightStyles.className}`} 
                  style={highlightStyles.style}
                  {...highlightStyles.dataAttributes}
                >
                  <div className="log-header" onClick={() => { toggleLogExpansion(log.id); }} onContextMenu={(e) => handleLogRightClick(e, log)}>
                    <div className="log-time">{new Date(log.time).toLocaleTimeString()}</div>
                    <div className={`log-level ${log.level}`}>{log.level.toUpperCase()}</div>
                    <div className="log-script">{log.scriptId}</div>
                    <div className="log-message">{log.message}</div>
                    <div className="log-toggle">
                      {expandedLogs.has(log.id) ? '▼' : '▶'}
                    </div>
                  </div>
                  {expandedLogs.has(log.id) && (
                    <div className="log-details">
                      {log.data && (
                        <div className="log-data">
                          <strong>Data:</strong>
                          <pre>{JSON.stringify(log.data, null, 2)}</pre>
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
              );
              })
            )}
          </div>
        </div>
        {/* Right: Detail Panel */}
        {selectedLog && (
          <div className="monitoring-detail">
            <div className="detail-header">
              <h3>Data Details</h3>
              <div className="detail-header-controls">
                <button 
                  className="copy-btn"
                  onClick={copySelectedLogToClipboard}
                  title="Copy data to clipboard"
                >
                  📋 Copy
                </button>
                <button 
                  className="close-btn"
                  onClick={() => setSelectedLog(null)}
                >
                  ×
                </button>
              </div>
            </div>
            <div className="detail-content">
              <div className="detail-section">
                <h4>Basic Information</h4>
                <div className="detail-item">
                  <span className="detail-label">Script:</span>
                  <span className="detail-value">{selectedLog.scriptId}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Level:</span>
                  <span className={`detail-value`}>{selectedLog.level.toUpperCase()}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Time:</span>
                  <span className="detail-value">{new Date(selectedLog.time).toLocaleString()}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Message:</span>
                  <span className="detail-value">{selectedLog.message}</span>
                </div>
              </div>

              {selectedLog.data !== undefined && (
                <div className="detail-section">
                  <h4>Data</h4>
                  <div className="detail-item">
                    <span className="detail-label">Current Value:</span>
                    <div className="detail-value-container">
                      <span className={`detail-value detail-value-${getValueType(selectedLog.data)}`}>
                        {formatValue(selectedLog.data)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {(selectedLog.stack) && (
                <div className="detail-section">
                  <h4>Stack</h4>
                  <pre className="detail-stack">{selectedLog.stack}</pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Render monitoring view
  const renderMonitoringView = () => (
    <div className="app">
      <MonitoringPage 
        onStatsUpdate={setMonitoringStats}
        onConnectionUpdate={setMonitoringConnection}
        saveSystemRef={saveSystemRef}
      />
    </div>
  );

  // Render recursive view
  const renderRecursiveView = () => {
    // Dynamically determine the API server URL based on current location
    const currentHost = window.location.hostname;
    const currentPort = window.location.port;
    
    // If we're on port 3002 (React app), API server should be on port 3001
    // If we're on a different port, assume API server is on port 3001
    const apiServerPort = currentPort === '3002' ? '3001' : '3001';
    const serverUrl = `http://${currentHost}:${apiServerPort}`;
    
    return (
      <div className="app">
        <RecursiveLogsPage 
          serverUrl={serverUrl}
          autoRefresh={autoRefresh}
          refreshInterval={refreshInterval}
        />
      </div>
    );
  };

  // Render instrumentation view
  const renderInstrumentationView = () => {
    return <InstrumentationPage />;
  };

  // Render based on current view
  return (
    <div className="app-container">
      <SaveSystem
        ref={saveSystemRef}
        isOpen={saveSystemOpen}
        onToggle={() => setSaveSystemOpen(!saveSystemOpen)}
        onSave={handleSave}
        onLoad={handleLoad}
        onDelete={handleDelete}
        onExport={handleExport}
        onImport={handleImport}
        currentData={getCurrentData()}
        currentView={currentView}
        onCreateHighlight={handleCreateHighlight}
      />
      
      {/* Context Menu */}
          <ContextMenu
        isVisible={contextMenu.isVisible}
        x={contextMenu.x}
        y={contextMenu.y}
        items={(() => {
          // Check if the target element is already highlighted
          const isHighlighted = contextMenu.targetData ? 
            isElementHighlighted(
              'log',
              contextMenu.targetData.scriptId,
              undefined,
              undefined,
              contextMenu.targetData.data?.message
            ) : null;

          const getApiBase = () => {
            const envApi = (process as any)?.env?.API_TARGET as string | undefined;
            if (envApi && typeof envApi === 'string' && envApi.length > 0) return envApi;
            // Fallback to current origin
            return `${window.location.protocol}//${window.location.host}`;
          };

          // Helper function to check if log has screenshot
          const hasScreenshot = () => {
            const rawUrl = contextMenu.targetData?.data?.data?.imageUrl || contextMenu.targetData?.data?.imageUrl;
            return !!(rawUrl && typeof rawUrl === 'string' && rawUrl.trim().length > 0);
          };

          const menuItems = [];
          
          // Only show "View Screenshot" if log has screenshot data
          if (hasScreenshot()) {
            menuItems.push({
              id: 'view-screenshot',
              label: 'View Screenshot',
              icon: '🖼️',
              action: () => {
                const rawUrl = contextMenu.targetData?.data?.data?.imageUrl || contextMenu.targetData?.data?.imageUrl;
                const overlay = contextMenu.targetData?.data?.data?.overlay || contextMenu.targetData?.data?.overlay;
                if (rawUrl) {
                  let imageUrl = rawUrl as string;
                  // If server returned a relative uploads path, prefix with API base
                  if (imageUrl.startsWith('/uploads')) {
                    try { imageUrl = new URL(imageUrl, getApiBase()).toString(); } catch (error) {
                      console.warn('[App] Failed to construct image URL:', error);
                    }
                  }
                  setScreenshotModal({ open: true, imageUrl, overlay });
                }
              }
            });
          }

          // Add other menu items
          menuItems.push(
            {
              id: 'inspect-log',
              label: 'Inspect',
              icon: '🔎',
              action: () => {
                const id = contextMenu.targetData?.data?.logId;
                if (!id) return;
                const found = logs.find(l => l.id === id);
                if (found) setSelectedLog(found);
              }
            },
            {
              id: 'save-log-to-directory',
              label: 'Save Log to Directory',
              icon: '💾',
              action: async () => {
                try {
                  if ('showDirectoryPicker' in window && contextMenu.targetData?.data?.logId) {
                    const log = logs.find(l => l.id === contextMenu.targetData.data.logId);
                    if (log) {
                      const dirHandle = await (window as any).showDirectoryPicker();
                      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                      const filename = `log_${log.scriptId}_${timestamp}.json`;
                      
                      const logData = {
                        timestamp,
                        log: {
                          id: log.id,
                          scriptId: log.scriptId,
                          level: log.level,
                          time: log.time,
                          message: log.message,
                          data: log.data,
                          stack: log.stack
                        }
                      };
                      
                      const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
                      const writable = await fileHandle.createWritable();
                      await writable.write(JSON.stringify(logData, null, 2));
                      await writable.close();
                      
                      log.info('App', `Log saved to: ${filename}`);
                    }
                  }
                } catch (error) {
                  console.warn('Could not save log to directory:', error);
                }
              }
            },
            {
              id: 'highlight',
              label: isHighlighted ? 'Remove Highlight' : 'Highlight',
              icon: isHighlighted ? '❌' : '💡',
              action: () => {
                if (contextMenu.targetData && saveSystemRef.current) {
                  if (isHighlighted) {
                    // Remove highlight
                    saveSystemRef.current.removeHighlightForElement({
                      elementType: 'log',
                      scriptId: contextMenu.targetData.scriptId,
                      logMessage: contextMenu.targetData.data?.message
                    });
                  } else {
                    // Create highlight
                    saveSystemRef.current.createHighlightFromData(contextMenu.targetData);
                  }
                }
              }
            }
          );

          return menuItems;
        })()}
        onClose={hideContextMenu}
      />
      <div className={`main-content ${saveSystemOpen ? 'with-save-system' : ''}`}>
        {/* Unified Header */}
        <div className="header">
          <button 
            className="save-system-toggle-btn"
            onClick={() => setSaveSystemOpen(!saveSystemOpen)}
            title="Toggle Save System"
          >
            💾
          </button>
          <div className="header-controls">
            <div className="view-toggle">
              <button 
                className={`view-btn ${currentView === 'logs' ? 'active' : ''}`}
                onClick={() => setCurrentView('logs')}
              >
                📋 Logs
              </button>
              <div className="view-separator"></div>
              <button 
                className={`view-btn ${currentView === 'monitoring' ? 'active' : ''}`}
                onClick={() => setCurrentView('monitoring')}
              >
                📊 Monitoring
              </button>
              <div className="view-separator"></div>
              <button 
                className={`view-btn ${currentView === 'recursive' ? 'active' : ''}`}
                onClick={() => setCurrentView('recursive')}
              >
                🔄 Recursive Logs
              </button>
              <div className="view-separator"></div>
              <button 
                className={`view-btn ${currentView === 'instrumentation' ? 'active' : ''}`}
                onClick={() => setCurrentView('instrumentation')}
              >
                🔧 Instrumentation
              </button>
            </div>
            <div className="connection-status">
              <span className={`status-indicator ${currentView === 'logs' ? (connection.isConnected ? 'connected' : 'disconnected') : currentView === 'monitoring' ? (monitoringConnection.isConnected ? 'connected' : 'disconnected') : 'connected'}`}>
                {currentView === 'logs' ? (connection.isConnected ? '●' : '○') : currentView === 'monitoring' ? (monitoringConnection.isConnected ? '●' : '○') : '●'}
              </span>
              <span className="status-text">
                {currentView === 'logs' ? (connection.isConnected ? 'Connected' : 'Disconnected') : currentView === 'monitoring' ? (monitoringConnection.isConnected ? 'Connected' : 'Disconnected') : 'Connected'}
              </span>
            </div>
            <div className="auto-refresh-controls">
              <label>
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
                Auto-refresh
              </label>
              <select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
                disabled={!autoRefresh}
              >
                {viewerConfig.refreshOptions.map(option => (
                  <option key={option} value={option}>
                    {option >= 1000 ? `${option/1000}s` : `${option}ms`}
                  </option>
                ))}
              </select>
            </div>
            <div className="settings-controls">
              <button 
                onClick={() => setSettingsOpen(prev => !prev)}
                className="settings-btn"
                title="Open settings and view save logs directories"
              >
                ⚙️ Settings
              </button>
            </div>
          </div>
        </div>

        {/* Notification Display */}
        {notification.visible && (
          <div className={`notification notification-${notification.type}`}>
            <span className="notification-message">{notification.message}</span>
            <button 
              className="notification-close"
              onClick={() => setNotification(prev => ({ ...prev, visible: false }))}
            >
              ×
            </button>
          </div>
        )}
        
        {currentView === 'logs' ? renderLogsView() : 
         currentView === 'monitoring' ? renderMonitoringView() : 
         currentView === 'recursive' ? renderRecursiveView() :
         renderInstrumentationView()}
      </div>
      <ScreenshotOverlayModal
        isOpen={screenshotModal.open}
        imageUrl={screenshotModal.imageUrl || ''}
        overlay={screenshotModal.overlay}
        json={selectedLog?.data}
        onClose={() => setScreenshotModal({ open: false })}
      />
      <Settings
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

export default App; 