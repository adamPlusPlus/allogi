/**
 * Allog API Client
 *
 * Standalone viewer HTTP client for the intermediary server
 */

export interface AllogLogEntry {
  id: string;
  message: string;
  time?: string;
  timestamp?: string;
  serverReceivedAt?: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  scriptId?: string;
  data?: any;
  sourceId?: string;
  sourceType?: string;
}

export interface AllogApiClient {
  getLogs(options?: any): Promise<AllogLogEntry[]>;
  clearLogs(): Promise<void>;
  exportLogs(): Promise<string>;
  getStats(): Promise<any>;
  healthCheck(): Promise<boolean>;
  
  // New methods for raw/malformed logs
  sendRawLog(data: any, level?: string): Promise<any>;
  sendTextLog(text: string, level?: string): Promise<any>;
  sendTextLogGet(text: string, level?: string, source?: string): Promise<any>;
  
  // Optional methods for pages/tests that reference them
  getRecursiveLogs?(): Promise<AllogLogEntry[]>;
  getRecursiveLogsStats?(): Promise<any>;
  getLevelColor?(level: string): Promise<string>;
  getScriptColor?(scriptId: string): Promise<string>;
  formatTime?(timestamp: string): Promise<string>;
}

class AllogApiClientImpl implements AllogApiClient {
  private serverUrl: string;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  private async requestText(endpoint: string, init?: RequestInit): Promise<string> {
    const res = await fetch(`${this.serverUrl}${endpoint}`, init);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  private parseJsonFromText(text: string): any {
    try {
      const start = text.indexOf('{');
      if (start === -1) return {};
      return JSON.parse(text.slice(start));
    } catch {
      return {};
    }
  }

  async getLogs(): Promise<AllogLogEntry[]> {
    const text = await this.requestText('/api/logs');
    const data = this.parseJsonFromText(text);
    const logs: AllogLogEntry[] = (data.logs || []).map((l: any) => ({
      ...l,
      timestamp: l.timestamp || l.time || l.serverReceivedAt
    }));
    return logs;
  }

  async clearLogs(): Promise<void> {
    await fetch(`${this.serverUrl}/api/logs`, { method: 'DELETE' });
  }

  async exportLogs(): Promise<string> {
    const res = await fetch(`${this.serverUrl}/api/export?format=csv`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  async getStats(): Promise<any> {
    const logs = await this.getLogs();
    return {
      totalLogs: logs.length,
      byLevel: logs.reduce((acc: Record<string, number>, l) => {
        acc[l.level] = (acc[l.level] || 0) + 1;
        return acc;
      }, {}),
      byScript: logs.reduce((acc: Record<string, number>, l) => {
        const k = l.scriptId || 'unknown';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {})
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.serverUrl}/api/status`);
      return res.ok;
    } catch {
      return false;
    }
  }

  // New methods for raw/malformed logs
  async sendRawLog(data: any, level: string = 'info'): Promise<any> {
    const res = await fetch(`${this.serverUrl}/api/logs/raw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async sendTextLog(text: string, level: string = 'info'): Promise<any> {
    const res = await fetch(`${this.serverUrl}/api/logs/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, level })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async sendTextLogGet(text: string, level: string = 'info', source?: string): Promise<any> {
    const params = new URLSearchParams({ text, level });
    if (source) params.append('source', source);
    
    const res = await fetch(`${this.serverUrl}/api/logs/text?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // Compatibility shims for UI/tests that expect these helpers
  async getRecursiveLogs(): Promise<AllogLogEntry[]> {
    // Get recursive logs from the dedicated endpoint
    const res = await fetch(`${this.serverUrl}/api/logs/recursive`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.logs || [];
  }

  async getRecursiveLogsStats(): Promise<any> {
    const recursiveLogs = await this.getRecursiveLogs();
    return {
      totalRecursiveLogs: recursiveLogs.length,
      byScript: recursiveLogs.reduce((acc: Record<string, number>, l) => {
        const k = l.scriptId || 'unknown';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {}),
      byLevel: recursiveLogs.reduce((acc: Record<string, number>, l) => {
        acc[l.level] = (acc[l.level] || 0) + 1;
        return acc;
      }, {})
    };
  }

  async getLevelColor(level: string): Promise<string> {
    switch (level) {
      case 'error': return '#ff4444';
      case 'warn': return '#ffaa00';
      case 'info': return '#44aa44';
      case 'debug': return '#888888';
      default: return '#cccccc';
    }
  }

  async getScriptColor(scriptId: string): Promise<string> {
    const colors = [
      '#4ec9b0', '#569cd6', '#dcdcaa', '#ce9178', '#c586c0',
      '#6a9955', '#d7ba7d', '#9cdcfe', '#f44747', '#ff7f50'
    ];
    const hash = (scriptId || '').split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);
    return colors[Math.abs(hash) % colors.length];
  }

  async formatTime(timestamp: string): Promise<string> {
    try { return new Date(timestamp).toLocaleTimeString(); } catch { return String(timestamp || ''); }
  }
}

export function createAllogApiClient(serverUrl: string): AllogApiClient {
  return new AllogApiClientImpl(serverUrl);
}

export default createAllogApiClient; 