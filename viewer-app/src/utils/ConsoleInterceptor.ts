/**
 * Console Interceptor
 * 
 * Intercepts browser console methods and sends them to the recursive logs system
 */

export interface ConsoleLogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: any[];
  timestamp: string;
  scriptId: string;
  source: 'browser-console';
}

export class ConsoleInterceptor {
  private originalConsole: Console;
  private apiClient: any;
  private isEnabled: boolean = false;
  private scriptId: string = 'allog-browser-viewer';

  constructor(apiClient: any) {
    this.apiClient = apiClient;
    this.originalConsole = { ...console };
  }

  /**
   * Enable console interception
   */
  enable(): void {
    if (this.isEnabled) return;
    
    this.isEnabled = true;
    
    // Intercept console.log
    console.log = (...args: any[]) => {
      this.originalConsole.log(...args);
      this.sendToRecursiveLogs('info', args);
    };

    // Intercept console.info
    console.info = (...args: any[]) => {
      this.originalConsole.info(...args);
      this.sendToRecursiveLogs('info', args);
    };

    // Intercept console.warn
    console.warn = (...args: any[]) => {
      this.originalConsole.warn(...args);
      this.sendToRecursiveLogs('warn', args);
    };

    // Intercept console.error
    console.error = (...args: any[]) => {
      this.originalConsole.error(...args);
      this.sendToRecursiveLogs('error', args);
    };

    // Intercept console.debug
    console.debug = (...args: any[]) => {
      this.originalConsole.debug(...args);
      this.sendToRecursiveLogs('debug', args);
    };

    // Log that interception is enabled
    this.originalConsole.log('🔄 Console interception enabled - browser logs will be sent to recursive logs');
  }

  /**
   * Disable console interception
   */
  disable(): void {
    if (!this.isEnabled) return;
    
    this.isEnabled = false;
    
    // Restore original console methods
    console.log = this.originalConsole.log;
    console.info = this.originalConsole.info;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
    console.debug = this.originalConsole.debug;
    
    this.originalConsole.log('🔄 Console interception disabled');
  }

  /**
   * Send console log to recursive logs system
   */
  private async sendToRecursiveLogs(level: string, args: any[]): Promise<void> {
    try {
      // Convert arguments to a readable message
      const message = args.map(arg => {
        if (typeof arg === 'string') return arg;
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');

      // Create log entry
      const logEntry: ConsoleLogEntry = {
        level: level as 'debug' | 'info' | 'warn' | 'error',
        message,
        data: args.length > 1 ? args : undefined,
        timestamp: new Date().toISOString(),
        scriptId: this.scriptId,
        source: 'browser-console'
      };

      // Send to server using the API client
      if (this.apiClient && this.apiClient.sendTextLog) {
        await this.apiClient.sendTextLog(message, level);
      }
    } catch (error) {
      // Don't log errors here to avoid infinite loops
      this.originalConsole.error('Failed to send console log to recursive logs:', error);
    }
  }

  /**
   * Set custom script ID for the logs
   */
  setScriptId(scriptId: string): void {
    this.scriptId = scriptId;
  }

  /**
   * Check if interception is enabled
   */
  isInterceptionEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Get original console methods
   */
  getOriginalConsole(): Console {
    return this.originalConsole;
  }
}

export default ConsoleInterceptor;
