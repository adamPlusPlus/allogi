/**
 * Enhanced Error Handler for Allog Server
 * 
 * Provides structured error responses, detailed logging, and metrics collection
 */

class ErrorHandler {
  constructor(server) {
    this.server = server;
    this.errorCounts = new Map();
    this.errorHistory = [];
    this.maxErrorHistory = 100;
  }

  /**
   * Create a structured error response
   */
  createErrorResponse(error, context = {}) {
    const errorId = this.generateErrorId();
    const timestamp = new Date().toISOString();
    
    // Categorize error
    const category = this.categorizeError(error);
    
    // Create structured error object
    const errorResponse = {
      error: {
        id: errorId,
        type: error.name || 'UnknownError',
        category: category,
        message: error.message || 'An unexpected error occurred',
        details: this.extractErrorDetails(error),
        timestamp: timestamp,
        context: {
          endpoint: context.endpoint || 'unknown',
          method: context.method || 'unknown',
          sourceId: context.sourceId || 'unknown',
          userAgent: context.userAgent || 'unknown',
          ip: context.ip || 'unknown'
        },
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        retryable: this.isRetryableError(error),
        suggestions: this.getErrorSuggestions(error, category)
      },
      requestId: context.requestId || this.generateRequestId(),
      serverTime: timestamp,
      statusCode: this.getStatusCodeForError(error)
    };

    // Log error for monitoring
    this.logError(errorResponse, context);
    
    // Update metrics
    this.updateErrorMetrics(category, errorResponse.error.type);

    return errorResponse;
  }

  /**
   * Categorize errors for better organization
   */
  categorizeError(error) {
    if (error.name === 'ValidationError') return 'validation';
    if (error.name === 'AuthenticationError') return 'authentication';
    if (error.name === 'AuthorizationError') return 'authorization';
    if (error.name === 'RateLimitError') return 'rate_limit';
    if (error.name === 'DatabaseError') return 'database';
    if (error.name === 'NetworkError') return 'network';
    if (error.name === 'FileSystemError') return 'file_system';
    if (error.name === 'ConfigurationError') return 'configuration';
    if (error.name === 'TimeoutError') return 'timeout';
    if (error.name === 'ResourceNotFoundError') return 'not_found';
    if (error.name === 'ResourceConflictError') return 'conflict';
    if (error.name === 'ServiceUnavailableError') return 'service_unavailable';
    
    // Default categorization based on error message
    const message = error.message.toLowerCase();
    if (message.includes('validation') || message.includes('invalid')) return 'validation';
    if (message.includes('auth') || message.includes('login')) return 'authentication';
    if (message.includes('permission') || message.includes('access')) return 'authorization';
    if (message.includes('rate') || message.includes('limit')) return 'rate_limit';
    if (message.includes('database') || message.includes('db')) return 'database';
    if (message.includes('network') || message.includes('connection')) return 'network';
    if (message.includes('file') || message.includes('path')) return 'file_system';
    if (message.includes('config') || message.includes('setting')) return 'configuration';
    if (message.includes('timeout') || message.includes('timed out')) return 'timeout';
    if (message.includes('not found') || message.includes('missing')) return 'not_found';
    if (message.includes('conflict') || message.includes('duplicate')) return 'conflict';
    if (message.includes('unavailable') || message.includes('down')) return 'service_unavailable';
    
    return 'general';
  }

  /**
   * Extract detailed error information
   */
  extractErrorDetails(error) {
    const details = {};
    
    if (error.code) details.code = error.code;
    if (error.statusCode) details.statusCode = error.statusCode;
    if (error.retryAfter) details.retryAfter = error.retryAfter;
    if (error.expectedType) details.expectedType = error.expectedType;
    if (error.actualType) details.actualType = error.actualType;
    if (error.field) details.field = error.field;
    if (error.value) details.value = error.value;
    if (error.constraint) details.constraint = error.constraint;
    if (error.limit) details.limit = error.limit;
    if (error.current) details.current = error.current;
    
    return details;
  }

  /**
   * Determine if error is retryable
   */
  isRetryableError(error) {
    const retryableCategories = ['rate_limit', 'timeout', 'network', 'service_unavailable'];
    const retryableTypes = ['RateLimitError', 'TimeoutError', 'NetworkError', 'ServiceUnavailableError'];
    
    return retryableCategories.includes(this.categorizeError(error)) ||
           retryableTypes.includes(error.name) ||
           error.retryable === true;
  }

  /**
   * Get helpful suggestions for error resolution
   */
  getErrorSuggestions(error, category) {
    const suggestions = {
      validation: [
        'Check that all required fields are provided',
        'Verify data types match expected format',
        'Ensure field values meet validation constraints'
      ],
      authentication: [
        'Verify your authentication credentials',
        'Check if your session has expired',
        'Ensure you have proper access permissions'
      ],
      authorization: [
        'Contact your administrator for access permissions',
        'Verify your user role has required privileges',
        'Check if your account is active and not suspended'
      ],
      rate_limit: [
        'Reduce request frequency',
        'Implement exponential backoff',
        'Contact support if you need higher limits'
      ],
      database: [
        'Check database connection status',
        'Verify database credentials and permissions',
        'Check for database maintenance or outages'
      ],
      network: [
        'Check your internet connection',
        'Verify server is accessible',
        'Try again in a few moments'
      ],
      file_system: [
        'Verify file paths and permissions',
        'Check available disk space',
        'Ensure file is not locked by another process'
      ],
      configuration: [
        'Verify server configuration settings',
        'Check environment variables',
        'Contact system administrator'
      ],
      timeout: [
        'Try again with a longer timeout',
        'Check server load and performance',
        'Consider breaking request into smaller parts'
      ],
      not_found: [
        'Verify the resource identifier',
        'Check if resource was moved or deleted',
        'Ensure you have access to the resource'
      ],
      conflict: [
        'Check for duplicate entries',
        'Verify resource state before modification',
        'Resolve conflicts before retrying'
      ],
      service_unavailable: [
        'Try again in a few moments',
        'Check service status page',
        'Contact support if issue persists'
      ],
      general: [
        'Check server logs for more details',
        'Verify request format and parameters',
        'Contact support with error details'
      ]
    };

    return suggestions[category] || suggestions.general;
  }

  /**
   * Get appropriate HTTP status code for error
   */
  getStatusCodeForError(error) {
    const category = this.categorizeError(error);
    
    const statusCodes = {
      validation: 400,
      authentication: 401,
      authorization: 403,
      rate_limit: 429,
      database: 503,
      network: 503,
      file_system: 500,
      configuration: 500,
      timeout: 408,
      not_found: 404,
      conflict: 409,
      service_unavailable: 503,
      general: 500
    };

    return statusCodes[category] || 500;
  }

  /**
   * Log error for monitoring and debugging
   */
  logError(errorResponse, context) {
    const logEntry = {
      id: this.generateLogId(),
      timestamp: errorResponse.error.timestamp,
      level: 'error',
      sourceId: 'server',
      sourceType: 'error_handler',
      message: `Error ${errorResponse.error.id}: ${errorResponse.error.message}`,
      data: {
        error: errorResponse.error,
        context: context,
        requestId: errorResponse.requestId
      },
      category: 'server_error',
      severity: this.getErrorSeverity(errorResponse.error.category)
    };

    // Add to server logs
    if (this.server && this.server.addLogEntry) {
      this.server.addLogEntry(logEntry);
    }

    // Add to error history
    this.errorHistory.push({
      ...logEntry,
      timestamp: new Date(logEntry.timestamp)
    });

    // Maintain history size
    if (this.errorHistory.length > this.maxErrorHistory) {
      this.errorHistory.shift();
    }

    // Console logging with structured format
    console.error(`🚨 [${errorResponse.error.category.toUpperCase()}] ${errorResponse.error.message}`, {
      errorId: errorResponse.error.id,
      category: errorResponse.error.category,
      endpoint: context.endpoint,
      sourceId: context.sourceId,
      timestamp: errorResponse.error.timestamp,
      retryable: errorResponse.error.retryable
    });
  }

  /**
   * Update error metrics for monitoring
   */
  updateErrorMetrics(category, errorType) {
    const key = `${category}:${errorType}`;
    this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1);
  }

  /**
   * Get error metrics for health checks
   */
  getErrorMetrics() {
    const metrics = {
      totalErrors: this.errorHistory.length,
      errorCounts: Object.fromEntries(this.errorCounts),
      recentErrors: this.errorHistory.slice(-10).map(e => ({
        timestamp: e.timestamp,
        category: e.data.error.category,
        type: e.data.error.type,
        message: e.data.error.message
      })),
      errorRate: this.calculateErrorRate()
    };

    return metrics;
  }

  /**
   * Calculate error rate over time
   */
  calculateErrorRate() {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const recentErrors = this.errorHistory.filter(e => e.timestamp.getTime() > oneHourAgo);
    
    return {
      lastHour: recentErrors.length,
      last24Hours: this.errorHistory.filter(e => e.timestamp.getTime() > now - (24 * 60 * 60 * 1000)).length,
      total: this.errorHistory.length
    };
  }

  /**
   * Generate unique error ID
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique log ID
   */
  generateLogId() {
    return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get error severity level
   */
  getErrorSeverity(category) {
    const severityLevels = {
      validation: 'low',
      rate_limit: 'low',
      timeout: 'medium',
      not_found: 'low',
      conflict: 'medium',
      authentication: 'high',
      authorization: 'high',
      database: 'critical',
      network: 'high',
      file_system: 'high',
      configuration: 'critical',
      service_unavailable: 'high',
      general: 'medium'
    };

    return severityLevels[category] || 'medium';
  }
}

module.exports = ErrorHandler;
