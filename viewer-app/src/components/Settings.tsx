import React, { useState, useEffect } from 'react';
import '../styles/Settings.css';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

interface RecipientInfo {
  id: string;
  name: string;
  type: 'server' | 'client' | 'feature' | 'library';
  saveLogsDir?: string;
  lastSeen?: string;
  status: 'active' | 'inactive' | 'error';
  logCount: number;
  lastLogTime?: string;
}

interface DatabaseConfig {
  type: 'file' | 'sqlite' | 'postgresql';
  connected: boolean;
  capabilities: {
    indexedQueries: boolean;
    transactions: boolean;
    advancedFiltering: boolean;
  };
}

interface DatabaseStats {
  logs: number;
  monitoring: number;
  sources: number;
  type: string;
  memoryIndexes: {
    logIndexSize: number;
    monitoringIndexSize: number;
  };
}

interface ArchiveInfo {
  archiveDirectory: string;
  totalArchives: number;
  archives: Array<{
    filename: string;
    size: number;
    created: string;
    modified: string;
    sizeFormatted: string;
  }>;
  totalSize: number;
}

const Settings: React.FC<SettingsProps> = ({ isOpen, onClose }) => {
  const [recipients, setRecipients] = useState<RecipientInfo[]>([
    {
      id: 'allog-server',
      name: 'Allog Intermediary Server',
      type: 'server',
      saveLogsDir: './logs/allog-server',
      lastSeen: new Date().toISOString(),
      status: 'active',
      logCount: 0,
      lastLogTime: new Date().toISOString()
    },
    {
      id: 'formwise-app',
      name: 'FormWise Application',
      type: 'client',
      saveLogsDir: './logs/formwise',
      lastSeen: new Date().toISOString(),
      status: 'active',
      logCount: 0,
      lastLogTime: new Date().toISOString()
    },
    {
      id: 'lib-interactive',
      name: 'Interactive Library',
      type: 'library',
      saveLogsDir: './logs/lib/interactive',
      lastSeen: new Date().toISOString(),
      status: 'active',
      logCount: 0,
      lastLogTime: new Date().toISOString()
    },
    {
      id: 'features-formhub',
      name: 'FormHub Feature',
      type: 'feature',
      saveLogsDir: './logs/features/formhub',
      lastSeen: new Date().toISOString(),
      status: 'active',
      logCount: 0,
      lastLogTime: new Date().toISOString()
    },
    {
      id: 'features-clausesight',
      name: 'ClauseSight Feature',
      type: 'feature',
      saveLogsDir: './logs/features/clausesight',
      lastSeen: new Date().toISOString(),
      status: 'active',
      logCount: 0,
      lastLogTime: new Date().toISOString()
    }
  ]);

  const [selectedRecipient, setSelectedRecipient] = useState<RecipientInfo | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000);
  
  // Data Management States
  const [activeTab, setActiveTab] = useState<'recipients' | 'database' | 'archives' | 'maintenance'>('recipients');
  const [databaseConfig, setDatabaseConfig] = useState<DatabaseConfig | null>(null);
  const [databaseStats, setDatabaseStats] = useState<DatabaseStats | null>(null);
  const [archiveInfo, setArchiveInfo] = useState<ArchiveInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    if (isOpen && autoRefresh) {
      const interval = setInterval(() => {
        // Simulate updating recipient stats
        setRecipients(prev => prev.map(recipient => ({
          ...recipient,
          logCount: Math.floor(Math.random() * 1000) + recipient.logCount,
          lastLogTime: new Date().toISOString()
        })));
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  }, [isOpen, autoRefresh, refreshInterval]);

  // Load data management information when settings open
  useEffect(() => {
    if (isOpen) {
      loadDataManagementInfo();
    }
  }, [isOpen, activeTab]);

  // Data Management Functions
  const loadDataManagementInfo = async () => {
    try {
      const promises = [];
      
      if (activeTab === 'database' || activeTab === 'maintenance') {
        promises.push(
          fetch('/api/database/config').then(res => res.ok ? res.json() : null),
          fetch('/api/database/stats').then(res => res.ok ? res.json() : null)
        );
      }
      
      if (activeTab === 'archives' || activeTab === 'maintenance') {
        promises.push(
          fetch('/api/archives').then(res => res.ok ? res.json() : null)
        );
      }

      const results = await Promise.all(promises);
      
      if (activeTab === 'database' || activeTab === 'maintenance') {
        setDatabaseConfig(results[0]);
        setDatabaseStats(results[1]);
        if (activeTab === 'archives' || activeTab === 'maintenance') {
          setArchiveInfo(results[2]);
        }
      } else if (activeTab === 'archives') {
        setArchiveInfo(results[0]);
      }
    } catch (error) {
      console.error('Failed to load data management info:', error);
      showNotification('Failed to load data management information', 'error');
    }
  };

  const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const triggerLogRotation = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/archives/rotate', { method: 'POST' });
      const result = await response.json();
      
      if (response.ok) {
        showNotification('Log rotation completed successfully', 'success');
        await loadDataManagementInfo(); // Refresh archive info
      } else {
        showNotification(result.error || 'Failed to trigger log rotation', 'error');
      }
    } catch (error) {
      showNotification('Failed to trigger log rotation', 'error');
    } finally {
      setLoading(false);
    }
  };

  const downloadArchive = async (filename: string) => {
    try {
      const response = await fetch(`/api/archives/${filename}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        showNotification(`Archive ${filename} downloaded successfully`, 'success');
      } else {
        showNotification('Failed to download archive', 'error');
      }
    } catch (error) {
      showNotification('Failed to download archive', 'error');
    }
  };

  const exportData = async (type: 'logs' | 'monitoring' | 'backup', format: 'json' | 'csv' = 'json') => {
    try {
      setLoading(true);
      let url = '';
      
      switch (type) {
        case 'logs':
          url = `/api/export/logs?format=${format}`;
          break;
        case 'monitoring':
          url = `/api/export/monitoring?format=${format}`;
          break;
        case 'backup':
          url = `/api/export/backup?format=${format}`;
          break;
      }

      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        const urlObj = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = urlObj;
        a.download = `allog-${type}-export-${new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(urlObj);
        showNotification(`${type} data exported successfully`, 'success');
      } else {
        showNotification(`Failed to export ${type} data`, 'error');
      }
    } catch (error) {
      showNotification(`Failed to export ${type} data`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return '🟢';
      case 'inactive': return '⚪';
      case 'error': return '🔴';
      default: return '❓';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'server': return '🖥️';
      case 'client': return '📱';
      case 'feature': return '✨';
      case 'library': return '📚';
      default: return '❓';
    }
  };

  const openSaveLogsDir = async (recipient: RecipientInfo) => {
    if (recipient.saveLogsDir) {
      try {
        // Try to open the directory in file explorer
        if ('showDirectoryPicker' in window) {
          const dirHandle = await (window as any).showDirectoryPicker();
          console.log(`Opened directory for ${recipient.name}:`, dirHandle);
        } else {
          // Fallback: show the path
          alert(`Save logs directory: ${recipient.saveLogsDir}`);
        }
      } catch (error) {
        console.error('Failed to open directory:', error);
        alert(`Save logs directory: ${recipient.saveLogsDir}`);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>⚙️ Allog Settings</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {/* Notification */}
        {notification && (
          <div className={`settings-notification ${notification.type}`}>
            <span>{notification.message}</span>
            <button onClick={() => setNotification(null)}>×</button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="settings-tabs">
          <button 
            className={`tab-btn ${activeTab === 'recipients' ? 'active' : ''}`}
            onClick={() => setActiveTab('recipients')}
          >
            📊 Recipients
          </button>
          <button 
            className={`tab-btn ${activeTab === 'database' ? 'active' : ''}`}
            onClick={() => setActiveTab('database')}
          >
            🗄️ Database
          </button>
          <button 
            className={`tab-btn ${activeTab === 'archives' ? 'active' : ''}`}
            onClick={() => setActiveTab('archives')}
          >
            📁 Archives
          </button>
          <button 
            className={`tab-btn ${activeTab === 'maintenance' ? 'active' : ''}`}
            onClick={() => setActiveTab('maintenance')}
          >
            🔧 Maintenance
          </button>
        </div>

        <div className="settings-content">
          
          {/* Recipients Tab */}
          {activeTab === 'recipients' && (
            <>
              <div className="settings-section">
                <h3>📊 Recipients & Save Logs Directories</h3>
                <p>View and manage save logs directories for each recipient sending data to Allog.</p>
                
                <div className="recipients-grid">
              {recipients.map(recipient => (
                <div 
                  key={recipient.id}
                  className={`recipient-card ${selectedRecipient?.id === recipient.id ? 'selected' : ''}`}
                  onClick={() => setSelectedRecipient(recipient)}
                >
                  <div className="recipient-header">
                    <span className="type-icon">{getTypeIcon(recipient.type)}</span>
                    <span className="status-icon">{getStatusIcon(recipient.status)}</span>
                    <h4>{recipient.name}</h4>
                  </div>
                  <div className="recipient-details">
                    <div className="detail-row">
                      <span className="label">Type:</span>
                      <span className="value">{recipient.type}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Status:</span>
                      <span className="value">{recipient.status}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Log Count:</span>
                      <span className="value">{recipient.logCount.toLocaleString()}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Last Seen:</span>
                      <span className="value">{new Date(recipient.lastSeen || '').toLocaleString()}</span>
                    </div>
                    {recipient.lastLogTime && (
                      <div className="detail-row">
                        <span className="label">Last Log:</span>
                        <span className="value">{new Date(recipient.lastLogTime).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                  {recipient.saveLogsDir && (
                    <div className="save-logs-section">
                      <div className="detail-row">
                        <span className="label">Save Logs Dir:</span>
                        <span className="value path">{recipient.saveLogsDir}</span>
                      </div>
                      <button 
                        className="open-dir-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          openSaveLogsDir(recipient);
                        }}
                      >
                        📁 Open Directory
                      </button>
                    </div>
                  )}
                </div>
              ))}
                </div>
              </div>
            </>
          )}

          {/* Database Tab */}
          {activeTab === 'database' && (
            <>
              <div className="settings-section">
                <h3>🗄️ Database Configuration</h3>
                {databaseConfig ? (
                  <div className="database-info">
                    <div className="info-grid">
                      <div className="info-item">
                        <span className="label">Backend Type:</span>
                        <span className={`value db-type-${databaseConfig.type}`}>
                          {databaseConfig.type.toUpperCase()}
                          {databaseConfig.connected ? ' 🟢' : ' 🔴'}
                        </span>
                      </div>
                      <div className="info-item">
                        <span className="label">Status:</span>
                        <span className="value">{databaseConfig.connected ? 'Connected' : 'Disconnected'}</span>
                      </div>
                      <div className="info-item">
                        <span className="label">Indexed Queries:</span>
                        <span className="value">{databaseConfig.capabilities.indexedQueries ? '✅' : '❌'}</span>
                      </div>
                      <div className="info-item">
                        <span className="label">Transactions:</span>
                        <span className="value">{databaseConfig.capabilities.transactions ? '✅' : '❌'}</span>
                      </div>
                      <div className="info-item">
                        <span className="label">Advanced Filtering:</span>
                        <span className="value">{databaseConfig.capabilities.advancedFiltering ? '✅' : '❌'}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="loading">Loading database configuration...</div>
                )}
              </div>

              {databaseStats && (
                <div className="settings-section">
                  <h3>📊 Database Statistics</h3>
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-value">{databaseStats.logs.toLocaleString()}</div>
                      <div className="stat-label">Total Logs</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{databaseStats.monitoring.toLocaleString()}</div>
                      <div className="stat-label">Monitoring Entries</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{databaseStats.sources.toLocaleString()}</div>
                      <div className="stat-label">Data Sources</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{databaseStats.memoryIndexes.logIndexSize.toLocaleString()}</div>
                      <div className="stat-label">Log Index Size</div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Archives Tab */}
          {activeTab === 'archives' && (
            <>
              <div className="settings-section">
                <h3>📁 Archive Management</h3>
                <div className="archive-controls">
                  <button 
                    className="action-btn primary"
                    onClick={triggerLogRotation}
                    disabled={loading}
                  >
                    {loading ? '⏳ Rotating...' : '🔄 Trigger Log Rotation'}
                  </button>
                  <p className="help-text">
                    Manually trigger log rotation to archive current logs and start fresh.
                  </p>
                </div>
              </div>

              {archiveInfo && (
                <div className="settings-section">
                  <h3>📦 Archive Files ({archiveInfo.totalArchives})</h3>
                  <div className="archive-summary">
                    <div className="summary-item">
                      <span className="label">Archive Directory:</span>
                      <span className="value">{archiveInfo.archiveDirectory}</span>
                    </div>
                    <div className="summary-item">
                      <span className="label">Total Size:</span>
                      <span className="value">{(archiveInfo.totalSize / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                  </div>
                  
                  {archiveInfo.archives.length > 0 ? (
                    <div className="archives-list">
                      {archiveInfo.archives.map(archive => (
                        <div key={archive.filename} className="archive-item">
                          <div className="archive-info">
                            <div className="archive-name">{archive.filename}</div>
                            <div className="archive-details">
                              <span>{archive.sizeFormatted}</span>
                              <span>{new Date(archive.created).toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="archive-actions">
                            <button 
                              className="action-btn secondary"
                              onClick={() => downloadArchive(archive.filename)}
                            >
                              📥 Download
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <p>No archive files available yet.</p>
                      <p>Archives will appear here after log rotation occurs.</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Maintenance Tab */}
          {activeTab === 'maintenance' && (
            <>
              <div className="settings-section">
                <h3>🔧 Data Export & Backup</h3>
                <div className="export-controls">
                  <div className="export-group">
                    <h4>Export Logs</h4>
                    <div className="export-buttons">
                      <button 
                        className="action-btn secondary"
                        onClick={() => exportData('logs', 'json')}
                        disabled={loading}
                      >
                        JSON
                      </button>
                      <button 
                        className="action-btn secondary"
                        onClick={() => exportData('logs', 'csv')}
                        disabled={loading}
                      >
                        CSV
                      </button>
                    </div>
                  </div>
                  
                  <div className="export-group">
                    <h4>Export Monitoring Data</h4>
                    <div className="export-buttons">
                      <button 
                        className="action-btn secondary"
                        onClick={() => exportData('monitoring', 'json')}
                        disabled={loading}
                      >
                        JSON
                      </button>
                      <button 
                        className="action-btn secondary"
                        onClick={() => exportData('monitoring', 'csv')}
                        disabled={loading}
                      >
                        CSV
                      </button>
                    </div>
                  </div>
                  
                  <div className="export-group">
                    <h4>Full System Backup</h4>
                    <div className="export-buttons">
                      <button 
                        className="action-btn primary"
                        onClick={() => exportData('backup', 'json')}
                        disabled={loading}
                      >
                        📦 Complete Backup
                      </button>
                    </div>
                    <p className="help-text">
                      Includes all logs, monitoring data, sources, and configuration.
                    </p>
                  </div>
                </div>
              </div>

              {(databaseStats || archiveInfo) && (
                <div className="settings-section">
                  <h3>📊 System Overview</h3>
                  <div className="overview-grid">
                    {databaseStats && (
                      <div className="overview-card">
                        <h4>Database</h4>
                        <div className="overview-stats">
                          <div>{databaseStats.logs.toLocaleString()} logs</div>
                          <div>{databaseStats.monitoring.toLocaleString()} monitoring entries</div>
                          <div>{databaseStats.sources.toLocaleString()} sources</div>
                        </div>
                      </div>
                    )}
                    {archiveInfo && (
                      <div className="overview-card">
                        <h4>Archives</h4>
                        <div className="overview-stats">
                          <div>{archiveInfo.totalArchives} archive files</div>
                          <div>{(archiveInfo.totalSize / 1024 / 1024).toFixed(2)} MB total</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Auto-Refresh Settings (always show) */}
          <div className="settings-section">
            <h3>🔄 Auto-Refresh Settings</h3>
            <div className="setting-row">
              <label>
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
                Enable auto-refresh
              </label>
            </div>
            <div className="setting-row">
              <label>
                Refresh interval:
                <select
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Number(e.target.value))}
                  disabled={!autoRefresh}
                >
                  <option value={1000}>1 second</option>
                  <option value={2000}>2 seconds</option>
                  <option value={5000}>5 seconds</option>
                  <option value={10000}>10 seconds</option>
                  <option value={30000}>30 seconds</option>
                </select>
              </label>
            </div>
          </div>
          
          {/* Console Interception Settings */}
          <div className="settings-section">
            <h3>📝 Console Interception</h3>
            <div className="setting-row">
              <p className="help-text">
                When enabled, browser console logs (console.log, console.error, etc.) will be automatically 
                sent to the recursive logs system, allowing you to monitor the viewer's internal operations.
              </p>
            </div>
            <div className="setting-row">
              <label>
                <input
                  type="checkbox"
                  checked={true}
                  disabled={true}
                />
                Console interception enabled (automatic when connected)
              </label>
            </div>
          </div>

          {/* Server Information (always show) */}
          <div className="settings-section">
            <h3>📋 Server Information</h3>
            <div className="setting-row">
              <span className="label">Intermediary Server:</span>
              <span className="value">http://localhost:3002</span>
            </div>
            <div className="setting-row">
              <span className="label">Viewer Port:</span>
              <span className="value">3001</span>
            </div>
            <div className="setting-row">
              <span className="label">FormWise Port:</span>
              <span className="value">3003</span>
            </div>
          </div>

          {/* Selected Recipient Details (only on recipients tab) */}
          {activeTab === 'recipients' && selectedRecipient && (
            <div className="settings-section">
              <h3>🔍 {selectedRecipient.name} Details</h3>
              <div className="detail-view">
                <div className="detail-row">
                  <span className="label">ID:</span>
                  <span className="value">{selectedRecipient.id}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Type:</span>
                  <span className="value">{selectedRecipient.type}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Status:</span>
                  <span className="value">{selectedRecipient.status}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Total Logs:</span>
                  <span className="value">{selectedRecipient.logCount.toLocaleString()}</span>
                </div>
                {selectedRecipient.saveLogsDir && (
                  <div className="detail-row">
                    <span className="label">Save Logs Directory:</span>
                    <span className="value path">{selectedRecipient.saveLogsDir}</span>
                  </div>
                )}
                <div className="detail-row">
                  <span className="label">Last Seen:</span>
                  <span className="value">{new Date(selectedRecipient.lastSeen || '').toLocaleString()}</span>
                </div>
                {selectedRecipient.lastLogTime && (
                  <div className="detail-row">
                    <span className="label">Last Log Time:</span>
                    <span className="value">{new Date(selectedRecipient.lastLogTime).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="settings-footer">
          <button className="save-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
