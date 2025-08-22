/**
 * LogConstants - Standardized log format constants and interfaces
 * Ensures consistent log structure across Allogi applications
 */

export interface StandardLogEntry {
  // Required fields
  id: string;
  message: string;
  level: LogLevel;
  timestamp: string;
  
  // Source identification
  scriptId: string;
  sourceId: string;
  sourceType: string;
  
  // Optional fields
  data?: any;
  stack?: string;
  time?: string;
  file?: string;
  line?: number;
  column?: number;
  functionName?: string;
  
  // Metadata
  tags?: string[];
  category?: string;
  severity?: string;
  retryable?: boolean;
  
  // Allogi-specific fields
  recursive?: boolean;
  moduleId?: string;
  sourceVersion?: string;
  contentType?: string;
  transmissionId?: string;
  sequenceNumber?: number;
  serverReceivedAt?: string;
  quality?: 'valid' | 'malformed' | 'error';
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'test';

export interface ServerLogEntry extends StandardLogEntry {
  recursive: true;
  scriptId: 'SERVER';
  sourceId: 'SERVER';
  sourceType: ServerSourceType;
}

export type ServerSourceType = 
  | 'request_logger'
  | 'error_handler'
  | 'health_checker'
  | 'metrics_collector'
  | 'database_adapter'
  | 'websocket_handler'
  | 'startup_shutdown';

export interface ApplicationLogEntry extends StandardLogEntry {
  recursive: false;
  scriptId: string;
  sourceId: string;
  sourceType: string;
}

// Standard field values
export const LOG_FIELDS = {
  SCRIPT_IDS: {
    SERVER: 'SERVER',
    UNKNOWN: 'unknown',
    ALLOG_VIEWER: 'allog-viewer',
    ALLOG_BROWSER: 'allog-browser'
  },
  
  SOURCE_IDS: {
    SERVER: 'SERVER',
    UNKNOWN: 'unknown',
    VIEWER: 'viewer',
    CLIENT: 'client'
  },
  
  SOURCE_TYPES: {
    SERVER: 'server',
    REQUEST_LOGGER: 'request_logger',
    ERROR_HANDLER: 'error_handler',
    HEALTH_CHECKER: 'health_checker',
    METRICS_COLLECTOR: 'metrics_collector',
    DATABASE_ADAPTER: 'database_adapter',
    WEBSOCKET_HANDLER: 'websocket_handler',
    STARTUP_SHUTDOWN: 'startup_shutdown',
    APPLICATION: 'application',
    LIBRARY: 'library',
    FEATURE: 'feature'
  },
  
  LEVELS: {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    TEST: 'test'
  }
} as const;

// Validation functions
export const LogValidator = {
  /**
   * Validate a log entry has required fields
   */
  isValid(log: any): log is StandardLogEntry {
    return !!(
      log &&
      typeof log.id === 'string' &&
      typeof log.message === 'string' &&
      typeof log.level === 'string' &&
      typeof log.timestamp === 'string' &&
      typeof log.scriptId === 'string' &&
      typeof log.sourceId === 'string' &&
      typeof log.sourceType === 'string'
    );
  },

  /**
   * Check if a log entry is a server log
   */
  isServerLog(log: any): log is ServerLogEntry {
    if (!this.isValid(log)) return false;
    
    const scriptId = log.scriptId.toLowerCase();
    const sourceId = log.sourceId.toLowerCase();
    const sourceType = log.sourceType.toLowerCase();
    
    return (
      log.recursive === true ||
      scriptId === 'server' ||
      sourceId === 'server' ||
      sourceType === 'server' ||
      sourceType.includes('logger') ||
      sourceType.includes('handler') ||
      sourceType.includes('checker') ||
      sourceType.includes('collector') ||
      sourceType.includes('adapter')
    );
  },

  /**
   * Check if a log entry is an application log
   */
  isApplicationLog(log: any): log is ApplicationLogEntry {
    return this.isValid(log) && !this.isServerLog(log);
  },

  /**
   * Normalize log entry to standard format
   */
  normalize(log: any): StandardLogEntry {
    if (this.isValid(log)) {
      return log;
    }

    // Create minimal valid log entry
    return {
      id: log.id || `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      message: log.message || 'Log entry',
      level: this.normalizeLevel(log.level),
      timestamp: log.timestamp || log.time || new Date().toISOString(),
      scriptId: log.scriptId || LOG_FIELDS.SCRIPT_IDS.UNKNOWN,
      sourceId: log.sourceId || LOG_FIELDS.SOURCE_IDS.UNKNOWN,
      sourceType: log.sourceType || LOG_FIELDS.SOURCE_TYPES.APPLICATION,
      data: log.data,
      stack: log.stack,
      time: log.time,
      file: log.file,
      line: log.line,
      column: log.column,
      functionName: log.functionName,
      tags: log.tags || [],
      category: log.category,
      severity: log.severity,
      retryable: log.retryable,
      recursive: log.recursive || false,
      moduleId: log.moduleId,
      sourceVersion: log.sourceVersion,
      contentType: log.contentType,
      transmissionId: log.transmissionId,
      sequenceNumber: log.sequenceNumber,
      serverReceivedAt: log.serverReceivedAt,
      quality: log.quality || 'valid'
    };
  },

  /**
   * Normalize log level to standard values
   */
  normalizeLevel(level: any): LogLevel {
    if (!level || typeof level !== 'string') return LOG_FIELDS.LEVELS.INFO;
    
    const normalized = level.toLowerCase();
    
    if (normalized === 'debug' || normalized === 'dbg') return LOG_FIELDS.LEVELS.DEBUG;
    if (normalized === 'info' || normalized === 'information') return LOG_FIELDS.LEVELS.INFO;
    if (normalized === 'warn' || normalized === 'warning') return LOG_FIELDS.LEVELS.WARN;
    if (normalized === 'error' || normalized === 'err') return LOG_FIELDS.LEVELS.ERROR;
    if (normalized === 'test') return LOG_FIELDS.LEVELS.TEST;
    
    return LOG_FIELDS.LEVELS.INFO;
  }
};
