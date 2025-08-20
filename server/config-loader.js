/**
 * Configuration Loader for Allog Intermediary Server
 * 
 * Centralizes all configuration values and provides a single source of truth
 * for repeated constants throughout the application.
 */

const path = require('path');
const fs = require('fs');

class ConfigLoader {
  constructor(configPath = './config.json') {
    this.configPath = configPath;
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      const configFile = path.resolve(__dirname, this.configPath);
      const configData = fs.readFileSync(configFile, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      console.warn(`Warning: Could not load config file ${this.configPath}. Using defaults.`);
      return this.getDefaultConfig();
    }
  }

  getDefaultConfig() {
    return {
      server: {
        ports: { default: 3002, viewer: 3001 },
        limits: { maxLogs: 10000, rateLimit: 1000, rateLimitWindow: 60000 },
        networking: { enableWebSocket: true, enablePersistence: true }
      },
      storage: {
        persistence: { filename: './allog-data.json' },
        uploads: { directory: './uploads', maxFileSize: 10485760 }
      },
      logging: {
        levels: { valid: ['info', 'warn', 'error', 'debug'], default: 'debug' },
        instrumentation: { defaultLevel: 'detailed', enabledByDefault: true },
        defaults: { sourceType: 'unknown', sourceVersion: '1.0.0', level: 'debug' }
      }
    };
  }

  // Server Configuration
  get serverPort() { return this.config.server.ports.default; }
  get viewerPort() { return this.config.server.ports.viewer; }
  get maxLogs() { return this.config.server.limits.maxLogs; }
  get rateLimit() { return this.config.server.limits.rateLimit; }
  get rateLimitWindow() { return this.config.server.limits.rateLimitWindow; }
  get enableWebSocket() { return this.config.server.networking.enableWebSocket; }
  get enablePersistence() { return this.config.server.networking.enablePersistence; }

  // Storage Configuration
  get persistenceFile() { return this.config.storage.persistence.filename; }
  get uploadsDirectory() { return this.config.storage.uploads.directory; }
  get maxFileSize() { return this.config.storage.uploads.maxFileSize; }

  // Monitoring Configuration
  get maxMonitoringEntries() { return this.config.server.limits.maxMonitoringEntries; }
  get validMonitoringTypes() { return this.config.monitoring?.types?.valid || ['variable', 'state', 'function', 'property', 'event']; }
  get enabledMonitoringTypes() { return this.config.monitoring?.types?.enabledByDefault || ['variable', 'state', 'function']; }
  get monitoringPersistence() { return this.config.monitoring?.storage?.enablePersistence !== false; }
  get monitoringRealtime() { return this.config.monitoring?.broadcasting?.enableRealtime !== false; }

  // Logging Configuration
  get validLogLevels() { return this.config.logging.levels.valid; }
  get defaultLogLevel() { return this.config.logging.levels.default; }
  get defaultInstrumentationLevel() { return this.config.logging.instrumentation.defaultLevel; }
  get defaultSourceType() { return this.config.logging.defaults.sourceType; }
  get defaultSourceVersion() { return this.config.logging.defaults.sourceVersion; }
  get defaultContentType() { return this.config.logging.defaults.contentType || 'image/png'; }

  // Utility Methods
  isValidLogLevel(level) {
    return this.validLogLevels.includes(level);
  }

  isValidMonitoringType(type) {
    return this.validMonitoringTypes.includes(type);
  }

  getServerConfig(overrides = {}) {
    return {
      port: overrides.port || this.serverPort,
      viewerPort: overrides.viewerPort || this.viewerPort,
      maxLogs: overrides.maxLogs || this.maxLogs,
      maxMonitoringEntries: overrides.maxMonitoringEntries || this.maxMonitoringEntries,
      enableWebSocket: overrides.enableWebSocket !== undefined ? overrides.enableWebSocket : this.enableWebSocket,
      enablePersistence: overrides.enablePersistence !== undefined ? overrides.enablePersistence : this.enablePersistence,
      persistenceFile: overrides.persistenceFile || this.persistenceFile,
      rateLimit: overrides.rateLimit || this.rateLimit,
      ...overrides
    };
  }

  getCLIConfig() {
    return {
      port: process.env.ALLOG_PORT || this.serverPort,
      viewerPort: process.env.ALLOG_VIEWER_PORT || this.viewerPort,
      maxLogs: process.env.ALLOG_MAX_LOGS || this.maxLogs,
      enableWebSocket: process.env.ALLOG_WS !== 'false',
      enablePersistence: process.env.ALLOG_PERSIST !== 'false',
      persistenceFile: process.env.ALLOG_PERSIST_FILE || this.persistenceFile,
      rateLimit: process.env.ALLOG_RATE_LIMIT || this.rateLimit
    };
  }

  // Message templates
  formatMessage(template, variables = {}) {
    return template.replace(/\{(\w+)\}/g, (match, key) => variables[key] || match);
  }

  getStartupMessages(port, viewerPort) {
    const messages = this.config.messages?.startup || {};
    return {
      server: this.formatMessage(messages.server || '🚀 Allog Intermediary Server running on port {port}', { port }),
      websocket: this.formatMessage(messages.websocket || '📡 WebSocket available at ws://localhost:{port}', { port }),
      api: this.formatMessage(messages.api || '🌐 HTTP API available at http://localhost:{port}', { port }),
      viewer: this.formatMessage(messages.viewer || '📊 React viewer should connect to http://localhost:{viewerPort}', { viewerPort })
    };
  }

  getShutdownMessage() {
    return this.config.messages?.shutdown || '\n🛑 Shutting down Allog Intermediary Server...';
  }
}

// Create singleton instance
const configLoader = new ConfigLoader();

module.exports = {
  ConfigLoader,
  config: configLoader
};
