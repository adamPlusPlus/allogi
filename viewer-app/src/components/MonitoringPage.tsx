import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import '../styles/MonitoringPage.css';
import ContextMenu from './ContextMenu';
import { useContextMenu } from '../hooks/useContextMenu';
import { useHighlights } from '../hooks/useHighlights';

interface MonitoringData {
  moduleId: string;
  scriptId: string;
  timestamp: number;
  type: 'variable' | 'state' | 'function' | 'property' | 'event';
  name: string;
  value: any;
  previousValue?: any;
  metadata?: {
    file?: string;
    line?: number;
    functionName?: string;
    duration?: number;
    error?: string;
    stack?: string;
  };
}

interface ModuleData {
  moduleId: string;
  scripts: {
    [scriptId: string]: {
      variables: { [name: string]: MonitoringData };
      states: { [name: string]: MonitoringData };
      functions: { [name: string]: MonitoringData };
      properties: { [name: string]: MonitoringData };
      events: { [name: string]: MonitoringData };
      lastUpdate: number;
    };
  };
  lastUpdate: number;
}

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

interface ConnectionStatus {
  isConnected: boolean;
  lastConnected?: string;
  error?: string;
  retryCount: number;
}

interface FilterOptions {
  moduleId: string;
  scriptId: string;
  type: string;
  search: string;
  showVariables: boolean;
  showStates: boolean;
  showFunctions: boolean;
  showProperties: boolean;
  showEvents: boolean;
}

interface MonitoringPageProps {
  onStatsUpdate?: (stats: MonitoringStats) => void;
  onConnectionUpdate?: (connection: ConnectionStatus) => void;
  saveSystemRef?: React.RefObject<{
    createHighlightFromData: (highlightData: {
      name: string;
      description: string;
      scriptId?: string;
      moduleId?: string;
      tags: string[];
      data?: any;
    }) => any;
    removeHighlightForElement: (elementData: {
      elementType: 'log' | 'variable' | 'state' | 'function' | 'property' | 'event';
      scriptId?: string;
      moduleId?: string;
      name?: string;
      logMessage?: string;
    }) => boolean;
  }>;
}

export default function MonitoringPage({ onStatsUpdate, onConnectionUpdate, saveSystemRef }: MonitoringPageProps) {
  const { contextMenu, showContextMenu, hideContextMenu } = useContextMenu();
  const { getHighlightStyles, isElementHighlighted } = useHighlights();
  // Double-click detection for native context menu
  const doubleClickRefs = useRef<Map<string, { lastClick: number; timeout: NodeJS.Timeout | null }>>(new Map());
  const [monitoringData, setMonitoringData] = useState<{ [moduleId: string]: ModuleData }>({});
  const [stats, setStats] = useState<MonitoringStats>({
    totalModules: 0,
    totalScripts: 0,
    totalVariables: 0,
    totalStates: 0,
    totalFunctions: 0,
    totalProperties: 0,
    totalEvents: 0,
    lastUpdate: new Date().toISOString()
  });
  const [connection, setConnection] = useState<ConnectionStatus>({
    isConnected: false,
    retryCount: 0
  });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(500);
  const [filters, setFilters] = useState<FilterOptions>({
    moduleId: '',
    scriptId: '',
    type: '',
    search: '',
    showVariables: true,
    showStates: true,
    showFunctions: true,
    showProperties: true,
    showEvents: true
  });
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [expandedScripts, setExpandedScripts] = useState<Set<string>>(new Set());
  const [selectedData, setSelectedData] = useState<MonitoringData | null>(null);
  const [viewMode, setViewMode] = useState<'tree' | 'table' | 'timeline'>('table');
  const [sortConfig, setSortConfig] = useState<{
    key: 'moduleId' | 'scriptId' | 'name' | 'type' | 'value' | 'timestamp';
    direction: 'asc' | 'desc';
  } | null>(null);

  // Fetch monitoring data from the API
  const fetchMonitoringData = useCallback(async () => {
    try {
      const response = await fetch('/api/monitoring');
      if (response.ok) {
        const data = await response.json();
        setMonitoringData(data.modules || {});
        const newStats = data.stats || stats;
        setStats(newStats);
        const newConnection = { ...connection, isConnected: true, error: undefined };
        setConnection(newConnection);
        
        // Notify parent component of updates
        onStatsUpdate?.(newStats);
        onConnectionUpdate?.(newConnection);
        
        // Only update selected data if it no longer exists in the new data
        // This prevents jumping between different timestamps of the same property
        if (selectedData) {
          const moduleData = data.modules?.[selectedData.moduleId];
          if (moduleData) {
            const scriptData = moduleData.scripts?.[selectedData.scriptId];
            if (scriptData) {
              const categoryData = scriptData[selectedData.type + 's'];
              if (categoryData && categoryData[selectedData.name]) {
                // Only update if the selected data still exists, but don't replace it
                // This maintains the user's selection while ensuring the data is still valid
              } else {
                // If the selected data no longer exists, clear the selection
                setSelectedData(null);
              }
            } else {
              setSelectedData(null);
            }
          } else {
            setSelectedData(null);
          }
        }
      }
         } catch (error) {
       // Using console.error temporarily until AllogLogger integration
       console.error('Failed to fetch monitoring data:', error);
       const newConnection = { 
         ...connection, 
         isConnected: false, 
         error: 'Connection failed',
         retryCount: connection.retryCount + 1
       };
       setConnection(newConnection);
       onConnectionUpdate?.(newConnection);
     }
  }, [stats, selectedData]);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchMonitoringData, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchMonitoringData]);

  // Initial fetch
  useEffect(() => {
    fetchMonitoringData();
  }, [fetchMonitoringData]);

  // Filtered and sorted data
  const filteredData = useMemo(() => {
    const filtered: { [moduleId: string]: ModuleData } = {};
    
    // Safety check for monitoringData
    if (!monitoringData || typeof monitoringData !== 'object') {
      return filtered;
    }
    
    Object.entries(monitoringData).forEach(([moduleId, moduleData]) => {
      if (filters.moduleId && !moduleId.includes(filters.moduleId)) return;
      if (!moduleData || !moduleData.scripts || typeof moduleData.scripts !== 'object') return;
      
      const filteredScripts: { [scriptId: string]: any } = {};
      
      Object.entries(moduleData.scripts).forEach(([scriptId, scriptData]) => {
        if (filters.scriptId && !scriptId.includes(filters.scriptId)) return;
        if (!scriptData || typeof scriptData !== 'object') return;
        
        const filteredScript: {
          variables: { [name: string]: MonitoringData };
          states: { [name: string]: MonitoringData };
          functions: { [name: string]: MonitoringData };
          properties: { [name: string]: MonitoringData };
          events: { [name: string]: MonitoringData };
          lastUpdate: number;
        } = {
          variables: {},
          states: {},
          functions: {},
          properties: {},
          events: {},
          lastUpdate: scriptData.lastUpdate || Date.now()
        };
        
        // Filter by type and search
        if (filters.showVariables && scriptData.variables && typeof scriptData.variables === 'object') {
          Object.entries(scriptData.variables).forEach(([name, data]) => {
            if (filters.search && !name.toLowerCase().includes(filters.search.toLowerCase())) return;
            filteredScript.variables[name] = data;
          });
        }
        
        if (filters.showStates && scriptData.states && typeof scriptData.states === 'object') {
          Object.entries(scriptData.states).forEach(([name, data]) => {
            if (filters.search && !name.toLowerCase().includes(filters.search.toLowerCase())) return;
            filteredScript.states[name] = data;
          });
        }
        
        if (filters.showFunctions && scriptData.functions && typeof scriptData.functions === 'object') {
          Object.entries(scriptData.functions).forEach(([name, data]) => {
            if (filters.search && !name.toLowerCase().includes(filters.search.toLowerCase())) return;
            filteredScript.functions[name] = data;
          });
        }
        
        if (filters.showProperties && scriptData.properties && typeof scriptData.properties === 'object') {
          Object.entries(scriptData.properties).forEach(([name, data]) => {
            if (filters.search && !name.toLowerCase().includes(filters.search.toLowerCase())) return;
            filteredScript.properties[name] = data;
          });
        }
        
        if (filters.showEvents && scriptData.events && typeof scriptData.events === 'object') {
          Object.entries(scriptData.events).forEach(([name, data]) => {
            if (filters.search && !name.toLowerCase().includes(filters.search.toLowerCase())) return;
            filteredScript.events[name] = data;
          });
        }
        
        // Only include script if it has any data
        const hasData = Object.values(filteredScript).some(category => 
          typeof category === 'object' && Object.keys(category).length > 0
        );
        
        if (hasData) {
          filteredScripts[scriptId] = filteredScript;
        }
      });
      
      if (Object.keys(filteredScripts).length > 0) {
        filtered[moduleId] = {
          ...moduleData,
          scripts: filteredScripts
        };
      }
    });
    
    return filtered;
  }, [monitoringData, filters]);

  // Toggle module expansion
  const toggleModule = (moduleId: string) => {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(moduleId)) {
      newExpanded.delete(moduleId);
    } else {
      newExpanded.add(moduleId);
    }
    setExpandedModules(newExpanded);
  };

  // Toggle script expansion
  const toggleScript = (scriptId: string) => {
    const newExpanded = new Set(expandedScripts);
    if (newExpanded.has(scriptId)) {
      newExpanded.delete(scriptId);
    } else {
      newExpanded.add(scriptId);
    }
    setExpandedScripts(newExpanded);
  };

  // Format value for display
  const formatValue = (value: any): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return '[Complex Object]';
      }
    }
    return String(value);
  };

  // Get value type
  const getValueType = (value: any): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  };

  // Get time ago
  const getTimeAgo = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 1000) return 'just now';
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  };

  // Request sort function
  const requestSort = (key: 'moduleId' | 'scriptId' | 'name' | 'type' | 'value' | 'timestamp') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Sort function for table data
  const sortTableData = (data: Array<{
    moduleId: string;
    scriptId: string;
    name: string;
    type: 'variable' | 'state' | 'function' | 'property' | 'event';
    value: any;
    timestamp: number;
  }>) => {
    if (!sortConfig) return data;

    return [...data].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortConfig.key) {
        case 'moduleId':
          aValue = a.moduleId.toLowerCase();
          bValue = b.moduleId.toLowerCase();
          break;
        case 'scriptId':
          aValue = a.scriptId.toLowerCase();
          bValue = b.scriptId.toLowerCase();
          break;
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'type':
          aValue = a.type.toLowerCase();
          bValue = b.type.toLowerCase();
          break;
        case 'value':
          aValue = formatValue(a.value).toLowerCase();
          bValue = formatValue(b.value).toLowerCase();
          break;
        case 'timestamp':
          aValue = a.timestamp;
          bValue = b.timestamp;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  };

  // Get sort indicator
  const getSortIndicator = (key: 'moduleId' | 'scriptId' | 'name' | 'type' | 'value' | 'timestamp') => {
    if (!sortConfig || sortConfig.key !== key) {
      return '↕️';
    }
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const copySelectedDataToClipboard = () => {
    if (!selectedData) return;
    
    const dataToCopy = {
      basicInformation: {
        name: selectedData.name,
        type: selectedData.type,
        timestamp: new Date(selectedData.timestamp).toLocaleString(),
        moduleId: selectedData.moduleId,
        scriptId: selectedData.scriptId
      },
      valueInformation: {
        currentValue: selectedData.value,
        previousValue: selectedData.previousValue,
        valueType: getValueType(selectedData.value)
      },
      metadata: selectedData.metadata || {}
    };

    const formattedData = JSON.stringify(dataToCopy, null, 2);
    
    navigator.clipboard.writeText(formattedData).then(() => {
      // TODO: Replace with Allog coordinator logging
      // console.log('Data copied to clipboard');
    }).catch((err) => {
      // TODO: Replace with Allog coordinator logging
      // console.error('Failed to copy data to clipboard:', err);
    });
  };

  // Handle right-click on monitoring data items
  const handleDataItemRightClick = (e: React.MouseEvent, data: MonitoringData) => {
    e.preventDefault();
    
    const elementId = `${data.moduleId}-${data.scriptId}-${data.name}`;
    const lastClick = doubleClickRefs.current.get(elementId);
    const now = Date.now();
    
    if (lastClick && now - lastClick.lastClick < 300) {
      // Double-click detected
      if (lastClick.timeout) {
        clearTimeout(lastClick.timeout);
      }
      doubleClickRefs.current.delete(elementId);
      
      // TODO: Replace with Allog coordinator logging when available
      // console.log('Double right-click detected - allowing native context menu');
      
      return; // Allow native context menu
    }
    
    // Single click - show custom context menu
    const timeout = setTimeout(() => {
      doubleClickRefs.current.delete(elementId);
    }, 300);
    
    doubleClickRefs.current.set(elementId, { lastClick: now, timeout });
    
    showContextMenu(e.clientX, e.clientY, {
      id: 'monitoring-data',
      label: `Data: ${data.name}`,
      icon: '📊',
      action: () => {
        // Handle data action
      }
    });
  };

  // Handle right-click on table rows (custom menu on regular right-click)
  const handleTableRowRightClick = (e: React.MouseEvent, row: {
    moduleId: string;
    scriptId: string;
    name: string;
    type: 'variable' | 'state' | 'function' | 'property' | 'event';
    value: any;
    timestamp: number;
  }) => {
    e.preventDefault();
    
    const elementId = `table-row-${row.moduleId}-${row.scriptId}-${row.name}`;
    const lastClick = doubleClickRefs.current.get(elementId);
    const now = Date.now();
    
    if (lastClick && now - lastClick.lastClick < 300) {
      // Double-click detected
      if (lastClick.timeout) {
        clearTimeout(lastClick.timeout);
      }
      doubleClickRefs.current.delete(elementId);
      
      // TODO: Replace with Allog coordinator logging when available
      // console.log('Double right-click detected - allowing native context menu');
      
      return; // Allow native context menu
    }
    
    // Single click - show custom context menu
    const timeout = setTimeout(() => {
      doubleClickRefs.current.delete(elementId);
    }, 300);
    
    doubleClickRefs.current.set(elementId, { lastClick: now, timeout });
    
    showContextMenu(e.clientX, e.clientY, {
      id: 'table-row',
      label: `Row: ${row.name}`,
      icon: '📋',
      action: () => {
        // Handle row action
      }
    });
  };

  // Render data item
  const renderDataItem = (data: MonitoringData, key: string) => {
    const highlightStyles = getHighlightStyles(data.type, data.scriptId, data.moduleId, data.name);
    return (
    <div 
      key={key}
      className={`monitoring-data-item monitoring-data-${data.type} ${highlightStyles.className}`}
      style={highlightStyles.style}
      onClick={() => setSelectedData(data)}
      onContextMenu={(e) => handleDataItemRightClick(e, data)}
      {...highlightStyles.dataAttributes}
    >
      <div className="data-header">
        <span className="data-name">{data.name}</span>
        <span className={`data-type data-type-${data.type}`}>{data.type}</span>
        <span className="data-time">{getTimeAgo(data.timestamp)}</span>
      </div>
      <div className="data-content">
        <div className="data-value">
          <span className="value-label">Value:</span>
          <span className={`value-content value-${getValueType(data.value)}`}>
            {formatValue(data.value)}
          </span>
        </div>
        {data.previousValue !== undefined && (
          <div className="data-previous">
            <span className="value-label">Previous:</span>
            <span className={`value-content value-${getValueType(data.previousValue)}`}>
              {formatValue(data.previousValue)}
            </span>
          </div>
        )}
        {data.metadata && (
          <div className="data-metadata">
            {data.metadata.file && (
              <span className="metadata-item">
                📁 {data.metadata.file}:{data.metadata.line}
              </span>
            )}
            {data.metadata.functionName && (
              <span className="metadata-item">
                🔧 {data.metadata.functionName}
              </span>
            )}
            {data.metadata.duration && (
              <span className="metadata-item">
                ⏱️ {data.metadata.duration}ms
              </span>
            )}
          </div>
        )}
      </div>
    </div>
    );
  };

  // Render tree view
  const renderTreeView = () => (
    <div className="monitoring-tree">
      {Object.entries(filteredData).map(([moduleId, moduleData]) => (
        <div key={moduleId} className="module-container">
          <div 
            className="module-header"
            onClick={() => toggleModule(moduleId)}
          >
            <span className="expand-icon">
              {expandedModules.has(moduleId) ? '▼' : '▶'}
            </span>
            <span className="module-name">{moduleId}</span>
            <span className="module-stats">
              {Object.keys(moduleData.scripts).length} scripts
            </span>
          </div>
          
          {expandedModules.has(moduleId) && (
            <div className="module-content">
              {Object.entries(moduleData.scripts).map(([scriptId, scriptData]) => (
                <div key={scriptId} className="script-container">
                  <div 
                    className="script-header"
                    onClick={() => toggleScript(scriptId)}
                  >
                    <span className="expand-icon">
                      {expandedScripts.has(scriptId) ? '▼' : '▶'}
                    </span>
                    <span className="script-name">{scriptId}</span>
                    <span className="script-stats">
                      {(scriptData.variables ? Object.keys(scriptData.variables).length : 0) + 
                       (scriptData.states ? Object.keys(scriptData.states).length : 0) + 
                       (scriptData.functions ? Object.keys(scriptData.functions).length : 0) + 
                       (scriptData.properties ? Object.keys(scriptData.properties).length : 0) + 
                       (scriptData.events ? Object.keys(scriptData.events).length : 0)} items
                    </span>
                  </div>
                  
                  {expandedScripts.has(scriptId) && (
                    <div className="script-content">
                      {filters.showVariables && scriptData.variables && Object.keys(scriptData.variables).length > 0 && (
                        <div className="data-category">
                          <h4>Variables</h4>
                          {Object.entries(scriptData.variables).map(([name, data]) => 
                            renderDataItem(data, `var-${scriptId}-${name}`)
                          )}
                        </div>
                      )}
                      
                      {filters.showStates && scriptData.states && Object.keys(scriptData.states).length > 0 && (
                        <div className="data-category">
                          <h4>States</h4>
                          {Object.entries(scriptData.states).map(([name, data]) => 
                            renderDataItem(data, `state-${scriptId}-${name}`)
                          )}
                        </div>
                      )}
                      
                      {filters.showFunctions && scriptData.functions && Object.keys(scriptData.functions).length > 0 && (
                        <div className="data-category">
                          <h4>Functions</h4>
                          {Object.entries(scriptData.functions).map(([name, data]) => 
                            renderDataItem(data, `func-${scriptId}-${name}`)
                          )}
                        </div>
                      )}
                      
                      {filters.showProperties && scriptData.properties && Object.keys(scriptData.properties).length > 0 && (
                        <div className="data-category">
                          <h4>Properties</h4>
                          {Object.entries(scriptData.properties).map(([name, data]) => 
                            renderDataItem(data, `prop-${scriptId}-${name}`)
                          )}
                        </div>
                      )}
                      
                      {filters.showEvents && scriptData.events && Object.keys(scriptData.events).length > 0 && (
                        <div className="data-category">
                          <h4>Events</h4>
                          {Object.entries(scriptData.events).map(([name, data]) => 
                            renderDataItem(data, `event-${scriptId}-${name}`)
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  // Render table view
  const renderTableView = () => {
    const tableData: Array<{
      moduleId: string;
      scriptId: string;
      name: string;
      type: 'variable' | 'state' | 'function' | 'property' | 'event';
      value: any;
      timestamp: number;
      metadata?: {
        file?: string;
        line?: number;
        functionName?: string;
        duration?: number;
      };
    }> = [];

    Object.entries(filteredData).forEach(([moduleId, moduleData]) => {
      if (!moduleData || !moduleData.scripts) return;
      Object.entries(moduleData.scripts).forEach(([scriptId, scriptData]) => {
        if (!scriptData || typeof scriptData !== 'object') return;
        Object.entries(scriptData).forEach(([category, categoryData]) => {
          if (category !== 'lastUpdate' && categoryData && typeof categoryData === 'object') {
            Object.entries(categoryData).forEach(([name, data]) => {
              if (data && typeof data === 'object' && 'value' in data) {
                const type = category.slice(0, -1) as 'variable' | 'state' | 'function' | 'property' | 'event';
                tableData.push({
                  moduleId,
                  scriptId,
                  name,
                  type,
                  value: data.value,
                  timestamp: data.timestamp || Date.now(),
                  metadata: data.metadata
                });
              }
            });
          }
        });
      });
    });

    return (
      <div className="monitoring-table">
        <table>
                      <thead>
              <tr>
                <th 
                  className={`sortable ${sortConfig?.key === 'moduleId' ? 'sorted' : ''}`}
                  onClick={() => requestSort('moduleId')}
                >
                  Module<span className="sort-indicator">{getSortIndicator('moduleId')}</span>
                </th>
                <th 
                  className={`sortable ${sortConfig?.key === 'scriptId' ? 'sorted' : ''}`}
                  onClick={() => requestSort('scriptId')}
                >
                  Script<span className="sort-indicator">{getSortIndicator('scriptId')}</span>
                </th>
                <th 
                  className={`sortable ${sortConfig?.key === 'name' ? 'sorted' : ''}`}
                  onClick={() => requestSort('name')}
                >
                  Name<span className="sort-indicator">{getSortIndicator('name')}</span>
                </th>
                <th 
                  className={`sortable ${sortConfig?.key === 'type' ? 'sorted' : ''}`}
                  onClick={() => requestSort('type')}
                >
                  Type<span className="sort-indicator">{getSortIndicator('type')}</span>
                </th>
                <th 
                  className={`sortable ${sortConfig?.key === 'value' ? 'sorted' : ''}`}
                  onClick={() => requestSort('value')}
                >
                  Value<span className="sort-indicator">{getSortIndicator('value')}</span>
                </th>
                <th>
                  Context
                </th>
                <th 
                  className={`sortable ${sortConfig?.key === 'timestamp' ? 'sorted' : ''}`}
                  onClick={() => requestSort('timestamp')}
                >
                  Time<span className="sort-indicator">{getSortIndicator('timestamp')}</span>
                </th>
              </tr>
            </thead>
          <tbody>
            {sortTableData(tableData).map((row, index) => {
              const highlightStyles = getHighlightStyles(row.type, row.scriptId, row.moduleId, row.name);
              return (
              <tr
                key={`${row.moduleId}-${row.scriptId}-${row.name}-${index}`}
                className={`table-row table-row-${row.type} ${highlightStyles.className}`}
                style={highlightStyles.style}
                onClick={() => setSelectedData({
                  moduleId: row.moduleId,
                  scriptId: row.scriptId,
                  name: row.name,
                  type: row.type,
                  value: row.value,
                  timestamp: row.timestamp
                })}
                onContextMenu={(e) => handleTableRowRightClick(e, row)}
                {...highlightStyles.dataAttributes}
              >
                <td className="table-module">{row.moduleId}</td>
                <td className="table-script">{row.scriptId}</td>
                <td className="table-name">{row.name}</td>
                <td>
                  <span className={`table-type table-type-${row.type}`}>
                    {row.type}
                  </span>
                </td>
                <td className="table-value">
                  {formatValue(row.value)}
                </td>
                <td className="table-context">
                  {row.metadata && (
                    <div className="context-info">
                      {row.metadata.file && (
                        <span className="context-file" title={`File: ${row.metadata.file}:${row.metadata.line || ''}`}>
                          📁 {row.metadata.file.split('/').pop()}:{row.metadata.line}
                        </span>
                      )}
                      {row.metadata.functionName && (
                        <span className="context-function" title={`Function: ${row.metadata.functionName}`}>
                          🔧 {row.metadata.functionName}
                        </span>
                      )}
                      {row.metadata.duration && (
                        <span className="context-duration" title={`Duration: ${row.metadata.duration}ms`}>
                          ⏱️ {row.metadata.duration}ms
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="table-time">
                  {getTimeAgo(row.timestamp)}
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // Render timeline view
  const renderTimelineView = () => {
    const allData: Array<{ moduleId: string; scriptId: string; data: MonitoringData }> = [];
    
    Object.entries(filteredData).forEach(([moduleId, moduleData]) => {
      if (!moduleData || !moduleData.scripts) return;
      Object.entries(moduleData.scripts).forEach(([scriptId, scriptData]) => {
        if (!scriptData || typeof scriptData !== 'object') return;
        
        if (scriptData.variables && typeof scriptData.variables === 'object') {
          Object.entries(scriptData.variables).forEach(([name, data]) => 
            allData.push({ moduleId, scriptId, data })
          );
        }
        
        if (scriptData.states && typeof scriptData.states === 'object') {
          Object.entries(scriptData.states).forEach(([name, data]) => 
            allData.push({ moduleId, scriptId, data })
          );
        }
        
        if (scriptData.functions && typeof scriptData.functions === 'object') {
          Object.entries(scriptData.functions).forEach(([name, data]) => 
            allData.push({ moduleId, scriptId, data })
          );
        }
        
        if (scriptData.properties && typeof scriptData.properties === 'object') {
          Object.entries(scriptData.properties).forEach(([name, data]) => 
            allData.push({ moduleId, scriptId, data })
          );
        }
        
        if (scriptData.events && typeof scriptData.events === 'object') {
          Object.entries(scriptData.events).forEach(([name, data]) => 
            allData.push({ moduleId, scriptId, data })
          );
        }
      });
    });

    // Sort by timestamp (newest first)
    allData.sort((a, b) => b.data.timestamp - a.data.timestamp);

    return (
      <div className="monitoring-timeline">
        {allData.map((item, index) => {
          const highlightStyles = getHighlightStyles(item.data.type, item.data.scriptId, item.data.moduleId, item.data.name);
          return (
          <div 
            key={index}
            className={`timeline-item timeline-${item.data.type} ${highlightStyles.className}`}
            style={highlightStyles.style}
            onClick={() => setSelectedData(item.data)}
            {...highlightStyles.dataAttributes}
          >
            <div className="timeline-time">
              {new Date(item.data.timestamp).toLocaleTimeString()}
            </div>
            <div className="timeline-content">
              <div className="timeline-header">
                <span className="timeline-module">{item.moduleId}</span>
                <span className="timeline-script">{item.scriptId}</span>
                <span className="timeline-name">{item.data.name}</span>
                <span className={`timeline-type timeline-type-${item.data.type}`}>
                  {item.data.type}
                </span>
              </div>
              <div className="timeline-value">
                {formatValue(item.data.value)}
              </div>
            </div>
          </div>
        );
        })}
      </div>
    );
  };

  return (
    <div className="monitoring-page">

      {/* Filters */}
      <div className="monitoring-filters">
        <div className="filter-group">
          <input
            type="text"
            placeholder="Filter by module..."
            value={filters.moduleId}
            onChange={(e) => setFilters(prev => ({ ...prev, moduleId: e.target.value }))}
            className="filter-input"
          />
          <input
            type="text"
            placeholder="Filter by script..."
            value={filters.scriptId}
            onChange={(e) => setFilters(prev => ({ ...prev, scriptId: e.target.value }))}
            className="filter-input"
          />
          <input
            type="text"
            placeholder="Search..."
            value={filters.search}
            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
            className="filter-input"
          />
        </div>
        
        <div className="filter-group">
          <label>
            <input
              type="checkbox"
              checked={filters.showVariables}
              onChange={(e) => setFilters(prev => ({ ...prev, showVariables: e.target.checked }))}
            />
            Variables
          </label>
          <label>
            <input
              type="checkbox"
              checked={filters.showStates}
              onChange={(e) => setFilters(prev => ({ ...prev, showStates: e.target.checked }))}
            />
            States
          </label>
          <label>
            <input
              type="checkbox"
              checked={filters.showFunctions}
              onChange={(e) => setFilters(prev => ({ ...prev, showFunctions: e.target.checked }))}
            />
            Functions
          </label>
          <label>
            <input
              type="checkbox"
              checked={filters.showProperties}
              onChange={(e) => setFilters(prev => ({ ...prev, showProperties: e.target.checked }))}
            />
            Properties
          </label>
          <label>
            <input
              type="checkbox"
              checked={filters.showEvents}
              onChange={(e) => setFilters(prev => ({ ...prev, showEvents: e.target.checked }))}
            />
            Events
          </label>
        </div>

        <div className="view-mode-controls">
          <button
            className={`view-mode-btn ${viewMode === 'tree' ? 'active' : ''}`}
            onClick={() => setViewMode('tree')}
          >
            Tree
          </button>
          <button
            className={`view-mode-btn ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
          >
            Table
          </button>
          <button
            className={`view-mode-btn ${viewMode === 'timeline' ? 'active' : ''}`}
            onClick={() => setViewMode('timeline')}
          >
            Timeline
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="monitoring-content">
        <div className="monitoring-main">
          {viewMode === 'tree' && renderTreeView()}
          {viewMode === 'table' && renderTableView()}
          {viewMode === 'timeline' && renderTimelineView()}
        </div>

        {/* Detail Panel */}
        {selectedData && (
          <div 
            className="monitoring-detail"
            key={`${selectedData.moduleId}-${selectedData.scriptId}-${selectedData.name}-${selectedData.timestamp}`}
          >
            <div className="detail-header">
              <h3>Data Details</h3>
              <div className="detail-header-controls">
                <button 
                  className="copy-btn"
                  onClick={copySelectedDataToClipboard}
                  title="Copy data to clipboard"
                >
                  📋 Copy
                </button>
                <button 
                  className="close-btn"
                  onClick={() => setSelectedData(null)}
                >
                  ×
                </button>
              </div>
            </div>
            <div className="detail-content">
              <div className="detail-section">
                <h4>Basic Information</h4>
                <div className="detail-item">
                  <span className="detail-label">Name:</span>
                  <span className="detail-value">{selectedData.name}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Type:</span>
                  <span className={`detail-value detail-type-${selectedData.type}`}>
                    {selectedData.type}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Timestamp:</span>
                  <span className="detail-value">
                    {new Date(selectedData.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="detail-section">
                <h4>Value Information</h4>
                <div className="detail-item">
                  <span className="detail-label">Current Value:</span>
                  <div className="detail-value-container">
                    <span className={`detail-value detail-value-${getValueType(selectedData.value)}`}>
                      {formatValue(selectedData.value)}
                    </span>
                  </div>
                </div>
                {selectedData.previousValue !== undefined && (
                  <div className="detail-item">
                    <span className="detail-label">Previous Value:</span>
                    <div className="detail-value-container">
                      <span className={`detail-value detail-value-${getValueType(selectedData.previousValue)}`}>
                        {formatValue(selectedData.previousValue)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {selectedData.metadata && (
                <div className="detail-section">
                  <h4>Metadata</h4>
                  {selectedData.metadata.file && (
                    <div className="detail-item">
                      <span className="detail-label">File:</span>
                      <span className="detail-value">{selectedData.metadata.file}:{selectedData.metadata.line}</span>
                    </div>
                  )}
                  {selectedData.metadata.functionName && (
                    <div className="detail-item">
                      <span className="detail-label">Function:</span>
                      <span className="detail-value">{selectedData.metadata.functionName}</span>
                    </div>
                  )}
                  {selectedData.metadata.duration && (
                    <div className="detail-item">
                      <span className="detail-label">Duration:</span>
                      <span className="detail-value">{selectedData.metadata.duration}ms</span>
                    </div>
                  )}
                  {selectedData.metadata.error && (
                    <div className="detail-item">
                      <span className="detail-label">Error:</span>
                      <span className="detail-value detail-error">{selectedData.metadata.error}</span>
                    </div>
                  )}
                  {selectedData.metadata.stack && (
                    <div className="detail-item">
                      <span className="detail-label">Stack:</span>
                      <pre className="detail-stack">{selectedData.metadata.stack}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Context Menu */}
      <ContextMenu
        isVisible={contextMenu.isVisible}
        x={contextMenu.x}
        y={contextMenu.y}
        items={(() => {
          // Check if the target element is already highlighted
          const isHighlighted = contextMenu.targetData ? 
            isElementHighlighted(
              contextMenu.targetData.data?.type || 'variable',
              contextMenu.targetData.scriptId,
              contextMenu.targetData.moduleId,
              contextMenu.targetData.data?.name
            ) : null;

          return [
            {
              id: 'highlight',
              label: isHighlighted ? 'Remove Highlight' : 'Highlight',
              icon: isHighlighted ? '❌' : '💡',
              action: () => {
                if (contextMenu.targetData && saveSystemRef?.current) {
                  if (isHighlighted) {
                    // Remove highlight
                    saveSystemRef.current.removeHighlightForElement({
                      elementType: contextMenu.targetData.data?.type || 'variable',
                      scriptId: contextMenu.targetData.scriptId,
                      moduleId: contextMenu.targetData.moduleId,
                      name: contextMenu.targetData.data?.name
                    });
                  } else {
                    // Create highlight
                    saveSystemRef.current.createHighlightFromData(contextMenu.targetData);
                  }
                }
              }
            }
          ];
        })()}
        onClose={hideContextMenu}
      />
    </div>
  );
} 