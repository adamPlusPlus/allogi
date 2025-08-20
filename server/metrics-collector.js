/**
 * Metrics Collector for Allog Server
 * 
 * Collects and tracks various server metrics for monitoring and health checks
 */

const os = require('os');
const process = require('process');

class MetricsCollector {
  constructor(server) {
    this.server = server;
    this.startTime = Date.now();
    this.metrics = {
      system: {},
      performance: {},
      requests: {},
      database: {},
      websocket: {},
      errors: {},
      custom: {}
    };
    
    this.requestCounts = new Map();
    this.responseTimes = [];
    this.maxResponseTimes = 1000;
    
    this.startCollection();
  }

  /**
   * Start metrics collection
   */
  startCollection() {
    // Collect system metrics every 30 seconds
    this.systemMetricsInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);

    // Collect performance metrics every 10 seconds
    this.performanceMetricsInterval = setInterval(() => {
      this.collectPerformanceMetrics();
    }, 10000);

    // Collect database metrics every 15 seconds
    this.databaseMetricsInterval = setInterval(() => {
      this.collectDatabaseMetrics();
    }, 15000);
  }

  /**
   * Stop metrics collection
   */
  stopCollection() {
    if (this.systemMetricsInterval) {
      clearInterval(this.systemMetricsInterval);
    }
    if (this.performanceMetricsInterval) {
      clearInterval(this.performanceMetricsInterval);
    }
    if (this.databaseMetricsInterval) {
      clearInterval(this.databaseMetricsInterval);
    }
  }

  /**
   * Collect system-level metrics
   */
  collectSystemMetrics() {
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: {
        server: Date.now() - this.startTime,
        process: process.uptime() * 1000,
        system: os.uptime() * 1000
      },
      memory: {
        process: {
          used: process.memoryUsage().heapUsed,
          total: process.memoryUsage().heapTotal,
          external: process.memoryUsage().external,
          rss: process.memoryUsage().rss
        },
        system: {
          total: os.totalmem(),
          free: os.freemem(),
          used: os.totalmem() - os.freemem()
        }
      },
      cpu: {
        loadAverage: os.loadavg(),
        cores: os.cpus().length,
        architecture: os.arch(),
        platform: os.platform(),
        nodeVersion: process.version
      },
      network: {
        interfaces: this.getNetworkInterfaces()
      }
    };

    this.metrics.system = metrics;
    this.logMetrics('system', metrics);
  }

  /**
   * Collect performance metrics
   */
  collectPerformanceMetrics() {
    const metrics = {
      timestamp: new Date().toISOString(),
      requests: {
        total: this.getTotalRequestCount(),
        perSecond: this.calculateRequestsPerSecond(),
        byEndpoint: this.getRequestCountsByEndpoint(),
        bySource: this.getRequestCountsBySource()
      },
      response: {
        average: this.calculateAverageResponseTime(),
        percentiles: this.calculateResponseTimePercentiles(),
        recent: this.responseTimes.slice(-100)
      },
      websocket: {
        connections: this.server.connections ? this.server.connections.size : 0,
        active: this.getActiveWebSocketConnections()
      }
    };

    this.metrics.performance = metrics;
    this.logMetrics('performance', metrics);
  }

  /**
   * Collect database metrics
   */
  collectDatabaseMetrics() {
    if (!this.server.db) {
      this.metrics.database = { error: 'Database not available' };
      return;
    }

    const metrics = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      operations: {
        reads: 0,
        writes: 0,
        errors: 0
      },
      storage: {
        logs: this.server.logs ? this.server.logs.length : 0,
        monitoring: this.server.monitoringData ? this.server.monitoringData.length : 0,
        sources: this.server.sources ? this.server.sources.size : 0
      },
      performance: {
        averageQueryTime: 0,
        slowQueries: 0
      }
    };

    // Try to get database-specific metrics
    try {
      if (this.server.db.backend && this.server.db.backend.getMetrics) {
        const dbMetrics = this.server.db.backend.getMetrics();
        Object.assign(metrics, dbMetrics);
      }
    } catch (error) {
      metrics.status = 'error';
      metrics.error = error.message;
    }

    this.metrics.database = metrics;
    this.logMetrics('database', metrics);
  }

  /**
   * Record request metrics
   */
  recordRequest(endpoint, method, sourceId, responseTime, statusCode) {
    const key = `${method}:${endpoint}`;
    this.requestCounts.set(key, (this.requestCounts.get(key) || 0) + 1);

    // Record response time
    this.responseTimes.push({
      timestamp: Date.now(),
      endpoint,
      method,
      sourceId,
      responseTime,
      statusCode
    });

    // Maintain response time history
    if (this.responseTimes.length > this.maxResponseTimes) {
      this.responseTimes.shift();
    }

    // Log high response times
    if (responseTime > 1000) { // > 1 second
      this.logMetrics('slow_request', {
        timestamp: new Date().toISOString(),
        endpoint,
        method,
        sourceId,
        responseTime,
        statusCode
      });
    }
  }

  /**
   * Get total request count
   */
  getTotalRequestCount() {
    let total = 0;
    for (const count of this.requestCounts.values()) {
      total += count;
    }
    return total;
  }

  /**
   * Get request counts by endpoint
   */
  getRequestCountsByEndpoint() {
    const counts = {};
    for (const [key, count] of this.requestCounts.entries()) {
      const [method, endpoint] = key.split(':');
      if (!counts[endpoint]) {
        counts[endpoint] = { total: 0, methods: {} };
      }
      counts[endpoint].total += count;
      counts[endpoint].methods[method] = count;
    }
    return counts;
  }

  /**
   * Get request counts by source
   */
  getRequestCountsBySource() {
    const counts = {};
    for (const responseTime of this.responseTimes) {
      const sourceId = responseTime.sourceId || 'unknown';
      counts[sourceId] = (counts[sourceId] || 0) + 1;
    }
    return counts;
  }

  /**
   * Calculate requests per second
   */
  calculateRequestsPerSecond() {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const recentRequests = this.responseTimes.filter(r => r.timestamp > oneSecondAgo);
    return recentRequests.length;
  }

  /**
   * Calculate average response time
   */
  calculateAverageResponseTime() {
    if (this.responseTimes.length === 0) return 0;
    const total = this.responseTimes.reduce((sum, r) => sum + r.responseTime, 0);
    return total / this.responseTimes.length;
  }

  /**
   * Calculate response time percentiles
   */
  calculateResponseTimePercentiles() {
    if (this.responseTimes.length === 0) {
      return { p50: 0, p90: 0, p95: 0, p99: 0 };
    }

    const sorted = this.responseTimes.map(r => r.responseTime).sort((a, b) => a - b);
    const len = sorted.length;

    return {
      p50: sorted[Math.floor(len * 0.5)],
      p90: sorted[Math.floor(len * 0.9)],
      p95: sorted[Math.floor(len * 0.95)],
      p99: sorted[Math.floor(len * 0.99)]
    };
  }

  /**
   * Get active WebSocket connections
   */
  getActiveWebSocketConnections() {
    if (!this.server.connections) return 0;
    
    let active = 0;
    for (const connection of this.server.connections) {
      if (connection.readyState === 1) { // WebSocket.OPEN
        active++;
      }
    }
    return active;
  }

  /**
   * Get network interfaces
   */
  getNetworkInterfaces() {
    const interfaces = os.networkInterfaces();
    const result = {};
    
    for (const [name, nets] of Object.entries(interfaces)) {
      result[name] = nets.map(net => ({
        address: net.address,
        family: net.family,
        internal: net.internal
      }));
    }
    
    return result;
  }

  /**
   * Log metrics as structured logs
   */
  logMetrics(category, data) {
    // Create meaningful log entries based on category
    let logEntry;
    
    switch (category) {
      case 'system':
        logEntry = {
          id: this.generateLogId(),
          timestamp: new Date().toISOString(),
          level: 'info',
          scriptId: 'server',
          sourceId: 'server',
          sourceType: 'metrics_collector',
          message: `System metrics: ${Math.round(data.memory?.process?.used / 1024 / 1024)}MB RAM, ${data.cpu?.cores} cores, uptime ${Math.round(data.uptime?.server / 1000 / 60)}m`,
          data: {
            memory: {
              process: `${Math.round(data.memory?.process?.used / 1024 / 1024)}MB / ${Math.round(data.memory?.process?.total / 1024 / 1024)}MB`,
              system: `${Math.round(data.memory?.system?.used / 1024 / 1024)}MB / ${Math.round(data.memory?.system?.total / 1024 / 1024)}MB`
            },
            cpu: {
              cores: data.cpu?.cores,
              load: data.cpu?.loadAverage?.[0] || 0,
              architecture: data.cpu?.architecture
            },
            uptime: {
              server: Math.round(data.uptime?.server / 1000 / 60),
              process: Math.round(data.uptime?.process / 1000 / 60)
            },
            network: Object.keys(data.network?.interfaces || {}).length
          }
        };
        break;
        
      case 'performance':
        logEntry = {
          id: this.generateLogId(),
          timestamp: new Date().toISOString(),
          level: 'info',
          scriptId: 'server',
          sourceId: 'server',
          sourceType: 'metrics_collector',
          message: `Performance: ${data.requests?.total || 0} requests, avg ${Math.round(data.response?.average || 0)}ms response time`,
          data: {
            requests: {
              total: data.requests?.total || 0,
              perSecond: data.requests?.perSecond || 0,
              byEndpoint: data.requests?.byEndpoint || {},
              bySource: data.requests?.bySource || {}
            },
            response: {
              average: Math.round(data.response?.average || 0),
              percentiles: data.response?.percentiles || {},
              recent: data.response?.recent?.slice(-5) || []
            },
            websocket: {
              connections: data.websocket?.connections || 0,
              active: data.websocket?.active || 0
            }
          }
        };
        break;
        
      case 'database':
        logEntry = {
          id: this.generateLogId(),
          timestamp: new Date().toISOString(),
          level: 'info',
          scriptId: 'server',
          sourceId: 'server',
          sourceType: 'metrics_collector',
          message: `Database: ${data.storage?.logs || 0} logs, ${data.storage?.monitoring || 0} monitoring entries, ${data.storage?.sources || 0} sources`,
          data: {
            status: data.status,
            operations: data.operations || {},
            storage: data.storage || {},
            performance: data.performance || {}
          }
        };
        break;
        
      case 'slow_request':
        logEntry = {
          id: this.generateLogId(),
          timestamp: new Date().toISOString(),
          level: 'warn',
          scriptId: 'server',
          sourceId: 'server',
          sourceType: 'metrics_collector',
          message: `Slow request detected: ${data.endpoint} took ${data.responseTime}ms`,
          data: {
            endpoint: data.endpoint,
            method: data.method,
            sourceId: data.sourceId,
            responseTime: data.responseTime,
            statusCode: data.statusCode,
            timestamp: data.timestamp
          }
        };
        break;
        
      default:
        logEntry = {
          id: this.generateLogId(),
          timestamp: new Date().toISOString(),
          level: 'info',
          scriptId: 'server',
          sourceId: 'server',
          sourceType: 'metrics_collector',
          message: `Metrics collected for ${category}`,
          data: {
            category,
            metrics: data,
            timestamp: new Date().toISOString()
          }
        };
    }

    // Add to server logs if available
    if (this.server && this.server.addServerLog) {
      this.server.addServerLog(logEntry);
    }

    // Console logging for monitoring
    console.log(`📊 [METRICS] ${category}:`, {
      timestamp: data.timestamp,
      category,
      data: this.summarizeMetrics(data)
    });
    
    // Also log the structured data for debugging
    console.log(`[SERVER] 📊 [METRICS] ${category}:`, {
      timestamp: data.timestamp,
      category,
      data: data
    });
  }

  /**
   * Summarize metrics for console output
   */
  summarizeMetrics(data) {
    if (data.memory) {
      return {
        memory: {
          process: `${Math.round(data.memory.process.used / 1024 / 1024)}MB`,
          system: `${Math.round(data.memory.system.used / 1024 / 1024)}MB`
        },
        uptime: `${Math.round(data.uptime.server / 1000 / 60)}m`
      };
    }
    
    if (data.requests) {
      return {
        total: data.requests.total,
        perSecond: data.requests.perSecond,
        avgResponse: `${Math.round(data.response.average)}ms`
      };
    }
    
    if (data.storage) {
      return {
        logs: data.storage.logs,
        monitoring: data.storage.monitoring,
        sources: data.storage.sources
      };
    }
    
    return data;
  }

  /**
   * Get all metrics
   */
  getAllMetrics() {
    return {
      ...this.metrics,
      summary: {
        uptime: Date.now() - this.startTime,
        totalRequests: this.getTotalRequestCount(),
        averageResponseTime: this.calculateAverageResponseTime(),
        activeConnections: this.getActiveWebSocketConnections(),
        memoryUsage: this.metrics.system.memory?.process?.used || 0,
        systemLoad: this.metrics.system.cpu?.loadAverage?.[0] || 0
      }
    };
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    const now = Date.now();
    const oneMinuteAgo = now - (60 * 1000);
    
    // Check if metrics are being collected
    const metricsStale = !this.metrics.system.timestamp || 
                        new Date(this.metrics.system.timestamp).getTime() < oneMinuteAgo;
    
    // Check memory usage
    const memoryUsage = this.metrics.system.memory?.process?.used || 0;
    const memoryTotal = this.metrics.system.memory?.process?.total || 1;
    const memoryPercent = (memoryUsage / memoryTotal) * 100;
    
    // Check response times
    const avgResponseTime = this.calculateAverageResponseTime();
    const slowResponses = this.responseTimes.filter(r => r.timestamp > oneMinuteAgo && r.responseTime > 5000).length;
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        metrics: {
          status: metricsStale ? 'warning' : 'healthy',
          message: metricsStale ? 'Metrics collection may be stale' : 'Metrics collection active'
        },
        memory: {
          status: memoryPercent > 90 ? 'critical' : memoryPercent > 80 ? 'warning' : 'healthy',
          message: `Memory usage: ${Math.round(memoryPercent)}%`,
          value: memoryPercent
        },
        response: {
          status: avgResponseTime > 5000 ? 'critical' : avgResponseTime > 2000 ? 'warning' : 'healthy',
          message: `Average response time: ${Math.round(avgResponseTime)}ms`,
          value: avgResponseTime
        },
        slowRequests: {
          status: slowResponses > 10 ? 'warning' : 'healthy',
          message: `Slow requests in last minute: ${slowResponses}`,
          value: slowResponses
        }
      }
    };

    // Determine overall status
    const criticalChecks = Object.values(health.checks).filter(c => c.status === 'critical');
    const warningChecks = Object.values(health.checks).filter(c => c.status === 'warning');
    
    if (criticalChecks.length > 0) {
      health.status = 'critical';
    } else if (warningChecks.length > 0) {
      health.status = 'warning';
    }

    return health;
  }

  /**
   * Generate unique log ID
   */
  generateLogId() {
    return `metrics_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add custom metric
   */
  addCustomMetric(name, value, category = 'general') {
    if (!this.metrics.custom[category]) {
      this.metrics.custom[category] = {};
    }
    
    this.metrics.custom[category][name] = {
      value,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.requestCounts.clear();
    this.responseTimes = [];
    this.startTime = Date.now();
    
    console.log('🔄 Metrics reset');
  }
}

module.exports = MetricsCollector;
