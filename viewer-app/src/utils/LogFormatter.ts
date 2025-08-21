/**
 * LogFormatter - Formats logs for better readability
 * Converts verbose JSON server logs into human-readable format
 */

export interface FormattedLog {
  message: string;
  details?: string;
  metadata?: Record<string, any>;
  isServerLog: boolean;
}

export class LogFormatter {
  /**
   * Format a log entry for display
   */
  static formatLog(log: any): FormattedLog {
    // Check if this is a server log
    const isServerLog = log.scriptId === 'SERVER' || log.sourceId === 'SERVER' || log.recursive === true;
    
    if (isServerLog) {
      return this.formatServerLog(log);
    }
    
    return this.formatApplicationLog(log);
  }

  /**
   * Format server logs to be more readable
   */
  private static formatServerLog(log: any): FormattedLog {
    let message = log.message || 'Server log entry';
    let details: string | undefined;
    let metadata: Record<string, any> | undefined;

    // Handle different types of server logs
    if (log.data) {
      if (typeof log.data === 'string') {
        // If data is already a string, use it as details
        details = log.data;
      } else if (typeof log.data === 'object') {
        // Extract meaningful information from data object
        const { error, stack, code, status, method, url, path, ...otherData } = log.data;
        
        // Build a readable message
        if (error) {
          message = `Error: ${error}`;
        } else if (method && url) {
          message = `${method} ${url}`;
        } else if (path) {
          message = `Path: ${path}`;
        } else if (status) {
          message = `Status: ${status}`;
        } else if (code) {
          message = `Code: ${code}`;
        }

        // Add stack trace as details if available
        if (stack) {
          details = `Stack: ${stack}`;
        }

        // Add other relevant data as metadata
        if (Object.keys(otherData).length > 0) {
          metadata = otherData;
        }
      }
    }

    // Add timestamp if available
    if (log.timestamp || log.time) {
      const time = log.timestamp || log.time;
      if (!details) {
        details = `Time: ${new Date(time).toLocaleString()}`;
      } else {
        details += ` | Time: ${new Date(time).toLocaleString()}`;
      }
    }

    // Add level if available
    if (log.level && log.level !== 'info') {
      if (!details) {
        details = `Level: ${log.level.toUpperCase()}`;
      } else {
        details += ` | Level: ${log.level.toUpperCase()}`;
      }
    }

    return {
      message,
      details,
      metadata,
      isServerLog: true
    };
  }

  /**
   * Format application logs (keep as-is)
   */
  private static formatApplicationLog(log: any): FormattedLog {
    return {
      message: log.message || 'Application log entry',
      details: log.data ? JSON.stringify(log.data, null, 2) : undefined,
      metadata: {
        scriptId: log.scriptId,
        sourceId: log.sourceId,
        level: log.level,
        time: log.time || log.timestamp
      },
      isServerLog: false
    };
  }

  /**
   * Format a value for display (handles objects, arrays, primitives)
   */
  static formatValue(value: any, maxDepth: number = 2): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    
    if (typeof value === 'string') {
      return value;
    }
    
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      if (maxDepth <= 0) return `[${value.length} items]`;
      
      const items = value.slice(0, 5).map(item => 
        this.formatValue(item, maxDepth - 1)
      );
      
      if (value.length > 5) {
        items.push(`... and ${value.length - 5} more`);
      }
      
      return `[${items.join(', ')}]`;
    }
    
    if (typeof value === 'object') {
      if (maxDepth <= 0) return '{...}';
      
      const keys = Object.keys(value);
      if (keys.length === 0) return '{}';
      
      const pairs = keys.slice(0, 5).map(key => {
        const formattedValue = this.formatValue(value[key], maxDepth - 1);
        return `${key}: ${formattedValue}`;
      });
      
      if (keys.length > 5) {
        pairs.push(`... and ${keys.length - 5} more keys`);
      }
      
      return `{${pairs.join(', ')}}`;
    }
    
    return String(value);
  }

  /**
   * Truncate long strings for display
   */
  static truncateString(str: string, maxLength: number = 100): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }
}
