/**
 * Internal Allog Logger for the Viewer App
 * 
 * This provides a centralized logging system for the viewer app itself,
 * replacing the scattered console.log/console.error statements with
 * a consistent logging interface that can be configured and managed.
 */

import viewerConfig from '../config/config-loader';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  component: string;
  message: string;
  data?: any;
}

class AllogLogger {
  private logs: LogEntry[] = [];
  private maxLogs = viewerConfig.maxInternalLogs;
  private enableConsole = viewerConfig.enableConsoleLogging;
  private logLevel: LogLevel = viewerConfig.defaultInternalLogLevel as LogLevel;

  private levelOrder: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  constructor(options?: { 
    enableConsole?: boolean; 
    logLevel?: LogLevel; 
    maxLogs?: number;
  }) {
    if (options) {
      this.enableConsole = options.enableConsole ?? viewerConfig.enableConsoleLogging;
      this.logLevel = options.logLevel ?? (viewerConfig.defaultInternalLogLevel as LogLevel);
      this.maxLogs = options.maxLogs ?? viewerConfig.maxInternalLogs;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelOrder[level] >= this.levelOrder[this.logLevel];
  }

  private addLog(level: LogLevel, component: string, message: string, data?: any) {
    if (!this.shouldLog(level)) return;

    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      component,
      message,
      data
    };

    // Add to internal logs
    this.logs.push(logEntry);
    
    // Trim logs if exceeding max
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Also log to console if enabled
    if (this.enableConsole) {
      const consoleMessage = `[${component}] ${message}`;
      switch (level) {
        case 'debug':
          console.debug(consoleMessage, data || '');
          break;
        case 'info':
          console.log(consoleMessage, data || '');
          break;
        case 'warn':
          console.warn(consoleMessage, data || '');
          break;
        case 'error':
          console.error(consoleMessage, data || '');
          break;
      }
    }
  }

  debug(component: string, message: string, data?: any) {
    this.addLog('debug', component, message, data);
  }

  info(component: string, message: string, data?: any) {
    this.addLog('info', component, message, data);
  }

  warn(component: string, message: string, data?: any) {
    this.addLog('warn', component, message, data);
  }

  error(component: string, message: string, data?: any) {
    this.addLog('error', component, message, data);
  }

  // Get all internal logs
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  // Get logs filtered by component
  getLogsForComponent(component: string): LogEntry[] {
    return this.logs.filter(log => log.component === component);
  }

  // Get logs filtered by level
  getLogsForLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  // Clear all logs
  clearLogs() {
    this.logs = [];
  }

  // Configure logger
  configure(options: { 
    enableConsole?: boolean; 
    logLevel?: LogLevel; 
    maxLogs?: number;
  }) {
    if (options.enableConsole !== undefined) this.enableConsole = options.enableConsole;
    if (options.logLevel !== undefined) this.logLevel = options.logLevel;
    if (options.maxLogs !== undefined) this.maxLogs = options.maxLogs;
  }
}

// Create a singleton instance
const logger = new AllogLogger();

// Export convenience functions
export const log = {
  debug: (component: string, message: string, data?: any) => {
    try {
      return logger.debug(component, message, data);
    } catch (e) {
      console.debug(`[${component}] ${message}`, data || '');
    }
  },
  info: (component: string, message: string, data?: any) => {
    try {
      return logger.info(component, message, data);
    } catch (e) {
      console.log(`[${component}] ${message}`, data || '');
    }
  },
  warn: (component: string, message: string, data?: any) => {
    try {
      return logger.warn(component, message, data);
    } catch (e) {
      console.warn(`[${component}] ${message}`, data || '');
    }
  },
  error: (component: string, message: string, data?: any) => {
    try {
      return logger.error(component, message, data);
    } catch (e) {
      console.error(`[${component}] ${message}`, data || '');
    }
  },
  getLogs: () => {
    try {
      return logger.getLogs();
    } catch (e) {
      return [];
    }
  },
  getLogsForComponent: (component: string) => {
    try {
      return logger.getLogsForComponent(component);
    } catch (e) {
      return [];
    }
  },
  clearLogs: () => {
    try {
      return logger.clearLogs();
    } catch (e) {
      // Silent fail
    }
  },
  configure: (options: Parameters<typeof logger.configure>[0]) => {
    try {
      return logger.configure(options);
    } catch (e) {
      // Silent fail
    }
  }
};

export default logger;
