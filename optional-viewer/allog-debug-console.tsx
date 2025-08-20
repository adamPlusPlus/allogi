/**
 * Allog Debug Console - React-based overlay for viewing and managing logs
 * Moved to optional viewer location outside core allog
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  TextInput,
  StyleSheet,
  Dimensions,
  Modal,
  Alert
} from 'react-native';

import { createLogger } from '../../allog/allog-utils';

const consoleLogger = createLogger('allog-debug-console');

interface LogEntry {
  id: string;
  scriptId: string;
  message: string;
  time: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  data?: any;
  stack?: string;
  file?: string;
  line?: number;
  column?: number;
  functionName?: string;
}

interface ScriptToggle {
  scriptId: string;
  enabled: boolean;
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface DebugConsoleProps {
  visible?: boolean;
  onClose?: () => void;
  position?: 'top' | 'bottom' | 'full';
  serverUrl?: string;
}

interface LogFilter {
  scriptId?: string;
  level?: 'info' | 'warn' | 'error' | 'debug';
  search?: string;
}

export default function AllogDebugConsole({ 
  visible = false, 
  onClose,
  position = 'bottom',
  serverUrl = 'http://localhost:3001'
}: DebugConsoleProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogFilter>({});
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showToggles, setShowToggles] = useState(true);
  const [knownScripts, setKnownScripts] = useState<string[]>([]);
  const [toggleStatus, setToggleStatus] = useState<Record<string, boolean>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      consoleLogger.info('Allog Debug Console opened', { position, serverUrl, timestamp: new Date().toISOString() });
    } else {
      consoleLogger.debug('Allog Debug Console closed', { timestamp: new Date().toISOString() });
    }
  }, [visible, position, serverUrl]);

  const fetchLogs = useCallback(async () => {
    try {
      consoleLogger.debug('Fetching logs from server', { serverUrl, timestamp: new Date().toISOString() });
      const response = await fetch(`${serverUrl}/api/logs`);
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || []);
        setIsConnected(true);
        setError(null);
      } else {
        setError(`Server error: ${response.status}`);
        setIsConnected(false);
      }
    } catch (err) {
      setError(`Connection failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsConnected(false);
    }
  }, [serverUrl]);

  const fetchScripts = useCallback(async () => {
    try {
      consoleLogger.debug('Fetching script toggles from server', { serverUrl, timestamp: new Date().toISOString() });
      const response = await fetch(`${serverUrl}/api/logs/scripts`);
      if (response.ok) {
        const data = await response.json();
        setKnownScripts(data.scripts || []);
        const toggles: Record<string, boolean> = {};
        for (const scriptId of data.scripts || []) toggles[scriptId] = true;
        setToggleStatus(toggles);
      }
    } catch {}
  }, [serverUrl]);

  useEffect(() => {
    if (!visible || !autoRefresh) return;
    const interval = setInterval(() => { fetchLogs(); }, 2000);
    return () => clearInterval(interval);
  }, [visible, autoRefresh, fetchLogs]);

  useEffect(() => {
    if (visible) {
      fetchLogs();
      fetchScripts();
    }
  }, [visible, fetchLogs, fetchScripts]);

  const toggleScript = async (scriptId: string) => {
    try {
      const response = await fetch(`${serverUrl}/api/logs/toggle/${scriptId}`, { method: 'POST' });
      if (response.ok) setToggleStatus(prev => ({ ...prev, [scriptId]: !prev[scriptId] }));
    } catch {}
  };

  const clearLogs = () => {
    Alert.alert('Clear Logs','Are you sure you want to clear all logs?',[
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => { try { await fetch(`${serverUrl}/api/logs/clear`, { method: 'POST' }); setLogs([]); } catch {} } }
    ]);
  };

  const exportLogs = async () => {
    try {
      const response = await fetch(`${serverUrl}/api/logs/export?format=json`);
      if (response.ok) {
        const logs = await response.json();
        const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `allog-logs-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {}
  };

  const filteredLogs = logs.filter(log => {
    if ((filter as any).scriptId && log.scriptId !== (filter as any).scriptId) return false;
    if ((filter as any).level && log.level !== (filter as any).level) return false;
    if ((filter as any).search && !log.message.toLowerCase().includes((filter as any).search.toLowerCase())) return false;
    return true;
  });

  const handleFilterChange = (newFilter: Partial<LogFilter>) => {
    setFilter(prev => ({ ...prev, ...newFilter }));
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.container, position === 'full' && styles.fullScreen]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🔍 Allog Debug Console</Text>
          <View style={styles.headerControls}>
            <View style={styles.connectionStatus}>
              <View style={[styles.statusDot, { backgroundColor: isConnected ? '#44aa44' : '#ff4444' }]} />
              <Text style={styles.statusText}>{isConnected ? 'Connected' : 'Disconnected'}</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.controls}>
          <View style={styles.controlRow}>
            <View style={styles.controlGroup}>
              <Text style={styles.controlLabel}>Auto-refresh:</Text>
              <Switch value={autoRefresh} onValueChange={setAutoRefresh} />
            </View>
            <View style={styles.controlGroup}>
              <Text style={styles.controlLabel}>Show toggles:</Text>
              <Switch value={showToggles} onValueChange={setShowToggles} />
            </View>
            <TouchableOpacity style={styles.actionButton} onPress={fetchLogs}>
              <Text style={styles.actionButtonText}>Refresh</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={clearLogs}>
              <Text style={styles.actionButtonText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={exportLogs}>
              <Text style={styles.actionButtonText}>Export</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.filterRow}>
            <TextInput style={styles.searchInput} placeholder="Search logs..." value={(filter as any).search}
              onChangeText={(text) => handleFilterChange({ search: text })} />
            <View style={styles.levelFilter}>
              {['info', 'warn', 'error', 'debug'].map(level => (
                <TouchableOpacity key={level} style={[styles.levelButton, (filter as any).level === level && styles.levelButtonActive]}
                  onPress={() => handleFilterChange({ level: (filter as any).level === level ? undefined : level as any })}>
                  <Text style={styles.levelButtonText}>{level.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {showToggles && (
            <ScrollView horizontal style={styles.toggleRow}>
              {knownScripts.map(scriptId => (
                <TouchableOpacity key={scriptId}
                  style={[styles.toggleButton, toggleStatus[scriptId] && styles.toggleButtonActive]}
                  onPress={() => toggleScript(scriptId)}>
                  <Text style={styles.toggleButtonText}>{scriptId}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        <ScrollView style={styles.logsContainer}>
          {error && (<View style={styles.errorContainer}><Text style={styles.errorText}>Error: {error}</Text></View>)}
          {filteredLogs.length === 0 ? (
            <Text style={styles.noLogsText}>No logs to display</Text>
          ) : (
            filteredLogs.map((log, index) => (
              <View key={log.id || index} style={styles.logEntry}>
                <View style={styles.logHeader}>
                  <Text style={styles.logLevel}>{log.level.toUpperCase()}</Text>
                  <Text style={styles.logTime}>{new Date(log.time).toLocaleTimeString()}</Text>
                  <Text style={styles.logScript}>{log.scriptId}</Text>
                </View>
                <Text style={styles.logMessage}>{log.message}</Text>
                {log.data && (<Text style={styles.logData}>{JSON.stringify(log.data, null, 2)}</Text>)}
                {log.file && (<Text style={styles.logFile}>{log.file}:{log.line}:{log.column}</Text>)}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

export function AllogDebugButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.floatingButton} onPress={onPress}>
      <Text style={styles.floatingButtonText}>🐛</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#1e1e1e', borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  fullScreen: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: '#333', backgroundColor: '#2d2d2d' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginRight: 10 },
  headerControls: { flexDirection: 'row', alignItems: 'center' },
  connectionStatus: { flexDirection: 'row', alignItems: 'center', marginRight: 10 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
  statusText: { color: '#fff', fontSize: 12 },
  closeButton: { padding: 8, backgroundColor: '#444', borderRadius: 4 },
  closeButtonText: { color: '#fff', fontSize: 16 },
  controls: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#333' },
  controlRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  controlGroup: { flexDirection: 'row', alignItems: 'center', marginRight: 15 },
  controlLabel: { color: '#888', fontSize: 12, marginRight: 5 },
  actionButton: { paddingHorizontal: 15, paddingVertical: 8, backgroundColor: '#444', borderRadius: 4, marginLeft: 10 },
  actionButtonText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  filterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  searchInput: { flex: 1, backgroundColor: '#333', color: '#fff', padding: 8, borderRadius: 4, marginRight: 10 },
  levelFilter: { flexDirection: 'row' },
  levelButton: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#333', borderRadius: 4, marginRight: 8 },
  levelButtonActive: { backgroundColor: '#007acc' },
  levelButtonText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  toggleRow: { flexDirection: 'row', marginTop: 10 },
  toggleButton: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#333', borderRadius: 4, marginRight: 8 },
  toggleButtonActive: { backgroundColor: '#007acc' },
  toggleButtonText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  logsContainer: { flex: 1 },
  errorContainer: { padding: 10, backgroundColor: '#f44336' },
  errorText: { color: '#fff', fontSize: 12 },
  noLogsText: { color: '#888', textAlign: 'center', padding: 20 },
  logEntry: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#333' },
  logHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  logLevel: { fontSize: 11, fontWeight: 'bold', marginRight: 10, minWidth: 40 },
  logTime: { color: '#888', fontSize: 11, marginRight: 10 },
  logScript: { color: '#ccc', fontSize: 11, flex: 1 },
  logMessage: { color: '#fff', fontSize: 13, marginBottom: 5 },
  logData: { color: '#888', fontSize: 11, fontFamily: 'monospace', backgroundColor: '#2d2d2d', padding: 5, borderRadius: 3 },
  logFile: { color: '#888', fontSize: 11, fontFamily: 'monospace', marginTop: 5 },
  floatingButton: { position: 'absolute', top: 50, right: 20, width: 50, height: 50, backgroundColor: '#007acc', borderRadius: 25, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, zIndex: 999 },
  floatingButtonText: { fontSize: 20 }
});


