/**
 * Configuration Loader for Allog Viewer
 * 
 * Centralizes all configuration values and provides a single source of truth
 * for repeated constants throughout the viewer application.
 */

import configData from './viewer-config.json';

export interface ViewerConfig {
  network: {
    ports: { viewer: number; server: number };
    urls: { defaultServer: string; alternativeServer: string; productionServer: string };
    connection: { timeout: number; retries: number; minTimeout: number; maxTimeout: number; retryDelay: number };
  };
  refresh: {
    intervals: { default: number; minimum: number; options: number[] };
    autoRefresh: { enabled: boolean; minInterval: number };
  };
  logging: {
    levels: { valid: string[]; default: string; colors: Record<string, string> };
    internal: { maxLogs: number; enableConsole: boolean; defaultLevel: string };
  };
  ui: {
    colors: { status: Record<string, string>; script: string[] };
    layout: { imagePreview: Record<string, any>; notification: Record<string, number> };
  };
  buffers: {
    logs: { default: number; maximum: number };
    stats: { enabledModules: number; totalModules: number };
  };
  instrumentation: {
    levels: Record<string, string>;
    defaults: { enabled: boolean; level: string };
  };
  defaults: {
    fallback: Record<string, string>;
    messages: Record<string, string>;
  };
  export: {
    formats: string[];
    filenamePrefixes: Record<string, string>;
  };
}

class ViewerConfigLoader {
  private config: ViewerConfig;

  constructor() {
    this.config = configData as ViewerConfig;
  }

  // Network Configuration
  get viewerPort() { return this.config.network.ports.viewer; }
  get serverPort() { return this.config.network.ports.server; }
  get defaultServerUrl() { return this.config.network.urls.defaultServer; }
  get alternativeServerUrl() { return this.config.network.urls.alternativeServer; }
  get productionServerUrl() { return this.config.network.urls.productionServer; }
  get connectionTimeout() { return this.config.network.connection.timeout; }
  get connectionRetries() { return this.config.network.connection.retries; }
  get minTimeout() { return this.config.network.connection.minTimeout; }
  get maxTimeout() { return this.config.network.connection.maxTimeout; }

  // Refresh Configuration
  get defaultRefreshInterval() { return this.config.refresh.intervals.default; }
  get minRefreshInterval() { return this.config.refresh.intervals.minimum; }
  get refreshOptions() { return this.config.refresh.intervals.options; }
  get autoRefreshEnabled() { return this.config.refresh.autoRefresh.enabled; }
  get minAutoRefreshInterval() { return this.config.refresh.autoRefresh.minInterval; }

  // Logging Configuration
  get validLogLevels() { return this.config.logging.levels.valid; }
  get defaultLogLevel() { return this.config.logging.levels.default; }
  get logLevelColors() { return this.config.logging.levels.colors; }
  get maxInternalLogs() { return this.config.logging.internal.maxLogs; }
  get enableConsoleLogging() { return this.config.logging.internal.enableConsole; }
  get defaultInternalLogLevel() { return this.config.logging.internal.defaultLevel; }

  // UI Configuration
  get statusColors() { return this.config.ui.colors.status; }
  get scriptColors() { return this.config.ui.colors.script; }
  get imagePreviewConfig() { return this.config.ui.layout.imagePreview; }
  get notificationConfig() { return this.config.ui.layout.notification; }

  // Buffer Configuration
  get defaultLogBuffer() { return this.config.buffers.logs.default; }
  get maxLogBuffer() { return this.config.buffers.logs.maximum; }

  // Instrumentation Configuration
  get instrumentationLevels() { return this.config.instrumentation.levels; }
  get defaultInstrumentationEnabled() { return this.config.instrumentation.defaults.enabled; }
  get defaultInstrumentationLevel() { return this.config.instrumentation.defaults.level; }

  // Default Values
  get fallbackValues() { return this.config.defaults.fallback; }
  get defaultMessages() { return this.config.defaults.messages; }

  // Export Configuration
  get exportFormats() { return this.config.export.formats; }
  get exportFilenamePrefixes() { return this.config.export.filenamePrefixes; }

  // Utility Methods
  isValidLogLevel(level: string): boolean {
    return this.validLogLevels.includes(level);
  }

  getLogLevelColor(level: string): string {
    return this.logLevelColors[level] || this.statusColors.neutral;
  }

  getScriptColor(scriptId: string): string {
    const colors = this.scriptColors;
    const safe = scriptId || this.fallbackValues.scriptId;
    const hash = safe.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    return colors[Math.abs(hash) % colors.length];
  }

  getStatusColor(status: 'connected' | 'error' | 'neutral' | 'warning'): string {
    return this.statusColors[status] || this.statusColors.neutral;
  }

  getConnectionConfig(): { baseUrl: string; timeout: number; retries: number } {
    return {
      baseUrl: this.defaultServerUrl,
      timeout: this.connectionTimeout,
      retries: this.connectionRetries
    };
  }

  getWebSocketUrl(currentPort?: string): string {
    const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.hostname;
    const port = currentPort || window.location.port;
    
    // If viewer runs on viewer port (dev), default WS to server port
    const targetPort = port === this.viewerPort.toString() ? 
      this.serverPort.toString() : 
      (port || this.serverPort.toString());
    
    return `${wsProto}://${host}:${targetPort}`;
  }

  getApiServerUrl(): string {
    const currentHost = window.location.hostname;
    const currentPort = window.location.port;
    
    // Default to server port
    const apiServerPort = currentPort === this.serverPort.toString() ? 
      this.viewerPort.toString() : 
      this.serverPort.toString();
    
    return `http://${currentHost}:${apiServerPort}`;
  }

  formatMessage(messageKey: string, variables: Record<string, any> = {}): string {
    const template = this.defaultMessages[messageKey] || messageKey;
    return template.replace(/\{(\w+)\}/g, (match, key) => variables[key] || match);
  }

  // Environment-based configuration
  getServerUrl(): string {
    return (window as any).ALLOG_INTERMEDIARY_URL || this.defaultServerUrl;
  }

  // Initial state helpers
  getInitialLogStats() {
    return {
      totalLogs: 0,
      bufferSize: this.defaultLogBuffer,
      enabledModules: this.config.buffers.stats.enabledModules,
      totalModules: this.config.buffers.stats.totalModules,
      logLevels: this.validLogLevels.reduce((acc, level) => {
        acc[level] = 0;
        return acc;
      }, {} as Record<string, number>),
      lastUpdate: new Date().toISOString()
    };
  }

  getInitialConnectionStatus() {
    return {
      isConnected: false,
      retryCount: 0
    };
  }

  getInitialMonitoringStats() {
    return {
      totalModules: 0,
      totalScripts: 0,
      totalVariables: 0,
      totalStates: 0,
      totalFunctions: 0,
      totalProperties: 0,
      totalEvents: 0,
      lastUpdate: new Date().toISOString()
    };
  }
}

// Create and export singleton instance
export const viewerConfig = new ViewerConfigLoader();
export default viewerConfig;
