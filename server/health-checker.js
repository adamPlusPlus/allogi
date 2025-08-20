/**
 * Health Checker for Allog Server
 * 
 * Provides comprehensive health checks for individual server components
 */

class HealthChecker {
  constructor(server) {
    this.server = server;
    this.checks = new Map();
    this.lastCheck = null;
    this.checkInterval = null;
    this.healthStatus = 'unknown';
    
    this.registerDefaultChecks();
  }

  /**
   * Register default health checks
   */
  registerDefaultChecks() {
    // Database health check
    this.registerCheck('database', 'Database Connection', async () => {
      return this.checkDatabaseHealth();
    }, 30000); // Check every 30 seconds

    // File system health check
    this.registerCheck('filesystem', 'File System', async () => {
      return this.checkFileSystemHealth();
    }, 60000); // Check every minute

    // Memory health check
    this.registerCheck('memory', 'Memory Usage', async () => {
      return this.checkMemoryHealth();
    }, 15000); // Check every 15 seconds

    // WebSocket health check
    this.registerCheck('websocket', 'WebSocket Connections', async () => {
      return this.checkWebSocketHealth();
    }, 20000); // Check every 20 seconds

    // Rate limiting health check
    this.registerCheck('rate_limiting', 'Rate Limiting', async () => {
      return this.checkRateLimitingHealth();
    }, 45000); // Check every 45 seconds

    // Log rotation health check
    this.registerCheck('log_rotation', 'Log Rotation', async () => {
      return this.checkLogRotationHealth();
    }, 120000); // Check every 2 minutes

    // Archive system health check
    this.registerCheck('archives', 'Archive System', async () => {
      return this.checkArchiveSystemHealth();
    }, 180000); // Check every 3 minutes
  }

  /**
   * Register a new health check
   */
  registerCheck(id, name, checkFunction, intervalMs = 60000) {
    this.checks.set(id, {
      id,
      name,
      checkFunction,
      intervalMs,
      lastRun: null,
      lastResult: null,
      nextRun: Date.now(),
      status: 'unknown',
      message: 'Not yet checked',
      details: {},
      error: null
    });
  }

  /**
   * Start health checking
   */
  start() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(() => {
      this.runHealthChecks();
    }, 10000); // Run checks every 10 seconds

    console.log('🏥 Health checker started');
  }

  /**
   * Stop health checking
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log('🏥 Health checker stopped');
  }

  /**
   * Run all health checks
   */
  async runHealthChecks() {
    const now = Date.now();
    const checksToRun = [];

    // Find checks that need to run
    for (const [id, check] of this.checks) {
      if (now >= check.nextRun) {
        checksToRun.push(id);
      }
    }

    if (checksToRun.length === 0) return;

    // Run checks in parallel
    const checkPromises = checksToRun.map(id => this.runSingleCheck(id));
    await Promise.allSettled(checkPromises);

    // Update overall health status
    this.updateOverallHealth();
    this.lastCheck = new Date().toISOString();
  }

  /**
   * Run a single health check
   */
  async runSingleCheck(id) {
    const check = this.checks.get(id);
    if (!check) return;

    try {
      check.lastRun = Date.now();
      const result = await check.checkFunction();
      
      check.lastResult = result;
      check.status = result.status;
      check.message = result.message;
      check.details = result.details || {};
      check.error = null;
      
      // Schedule next run
      check.nextRun = Date.now() + check.intervalMs;

      // Log health check result
      this.logHealthCheckResult(check, result);

    } catch (error) {
      check.lastRun = Date.now();
      check.lastResult = { status: 'error', message: 'Check failed' };
      check.status = 'error';
      check.message = 'Check failed with error';
      check.details = { error: error.message };
      check.error = error;
      check.nextRun = Date.now() + Math.min(check.intervalMs, 30000); // Retry sooner on error

      // Log health check error
      this.logHealthCheckError(check, error);
    }
  }

  /**
   * Database health check
   */
  async checkDatabaseHealth() {
    if (!this.server.db) {
      return {
        status: 'error',
        message: 'Database adapter not available',
        details: { reason: 'Database adapter not initialized' }
      };
    }

    try {
      // Check if database is responsive
      const startTime = Date.now();
      await this.server.db.loadLogs();
      const responseTime = Date.now() - startTime;

      const status = responseTime < 1000 ? 'healthy' : 
                    responseTime < 5000 ? 'warning' : 'critical';

      return {
        status,
        message: `Database responsive (${responseTime}ms)`,
        details: {
          responseTime,
          type: this.server.db.type,
          logsCount: this.server.logs?.length || 0,
          monitoringCount: this.server.monitoringData?.length || 0,
          sourcesCount: this.server.sources?.size || 0
        }
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Database check failed',
        details: {
          error: error.message,
          type: this.server.db.type
        }
      };
    }
  }

  /**
   * File system health check
   */
  async checkFileSystemHealth() {
    try {
      const fs = require('fs').promises;
      const path = require('path');

      // Check uploads directory
      const uploadsDir = path.resolve(process.cwd(), this.server.config?.uploadsDirectory || './uploads');
      const uploadsStats = await fs.stat(uploadsDir);
      const uploadsWritable = await this.checkDirectoryWritable(uploadsDir);

      // Check archives directory
      const archivesDir = path.resolve(process.cwd(), this.server.config?.archiveDirectory || './archives');
      const archivesStats = await fs.stat(archivesDir);
      const archivesWritable = await this.checkDirectoryWritable(archivesDir);

      // Check data file
      const dataFile = path.resolve(process.cwd(), this.server.config?.persistenceFile || './allog-data.json');
      let dataFileStats = null;
      try {
        dataFileStats = await fs.stat(dataFile);
      } catch (error) {
        // Data file might not exist yet
      }

      const status = uploadsWritable && archivesWritable ? 'healthy' : 'warning';

      return {
        status,
        message: 'File system accessible',
        details: {
          uploads: {
            path: uploadsDir,
            exists: true,
            writable: uploadsWritable,
            size: uploadsStats.size
          },
          archives: {
            path: archivesDir,
            exists: true,
            writable: archivesWritable,
            size: archivesStats.size
          },
          dataFile: {
            path: dataFile,
            exists: !!dataFileStats,
            size: dataFileStats?.size || 0
          }
        }
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'File system check failed',
        details: { error: error.message }
      };
    }
  }

  /**
   * Memory health check
   */
  async checkMemoryHealth() {
    const memUsage = process.memoryUsage();
    const heapUsed = memUsage.heapUsed;
    const heapTotal = memUsage.heapTotal;
    const heapPercent = (heapUsed / heapTotal) * 100;

    let status = 'healthy';
    if (heapPercent > 90) status = 'critical';
    else if (heapPercent > 80) status = 'warning';

    return {
      status,
      message: `Memory usage: ${Math.round(heapPercent)}%`,
      details: {
        heapUsed: this.formatBytes(heapUsed),
        heapTotal: this.formatBytes(heapTotal),
        heapPercent: Math.round(heapPercent * 100) / 100,
        external: this.formatBytes(memUsage.external),
        rss: this.formatBytes(memUsage.rss)
      }
    };
  }

  /**
   * WebSocket health check
   */
  async checkWebSocketHealth() {
    if (!this.server.connections) {
      return {
        status: 'error',
        message: 'WebSocket not enabled',
        details: { reason: 'WebSocket connections not available' }
      };
    }

    const totalConnections = this.server.connections.size;
    let activeConnections = 0;
    let staleConnections = 0;

    for (const connection of this.server.connections) {
      if (connection.readyState === 1) { // WebSocket.OPEN
        activeConnections++;
      } else {
        staleConnections++;
      }
    }

    const status = staleConnections === 0 ? 'healthy' : 
                  staleConnections < totalConnections * 0.1 ? 'warning' : 'critical';

    return {
      status,
      message: `WebSocket: ${activeConnections} active, ${staleConnections} stale`,
      details: {
        total: totalConnections,
        active: activeConnections,
        stale: staleConnections,
        activePercent: totalConnections > 0 ? Math.round((activeConnections / totalConnections) * 100) : 0
      }
    };
  }

  /**
   * Rate limiting health check
   */
  async checkRateLimitingHealth() {
    if (!this.server.rateLimitMap) {
      return {
        status: 'error',
        message: 'Rate limiting not available',
        details: { reason: 'Rate limiting map not available' }
      };
    }

    const now = Date.now();
    const activeLimits = [];
    let totalBlocked = 0;

    for (const [sourceId, limit] of this.server.rateLimitMap) {
      if (now < limit.resetTime) {
        activeLimits.push({
          sourceId,
          count: limit.count,
          resetTime: new Date(limit.resetTime).toISOString()
        });
        
        if (limit.count > (this.server.config?.rateLimit || 1000)) {
          totalBlocked++;
        }
      }
    }

    const status = totalBlocked === 0 ? 'healthy' : 
                  totalBlocked < activeLimits.length * 0.1 ? 'warning' : 'critical';

    return {
      status,
      message: `Rate limiting: ${activeLimits.length} active sources, ${totalBlocked} blocked`,
      details: {
        activeSources: activeLimits.length,
        blockedSources: totalBlocked,
        activeLimits: activeLimits.slice(0, 10) // Limit details to first 10
      }
    };
  }

  /**
   * Log rotation health check
   */
  async checkLogRotationHealth() {
    if (!this.server.rotationEnabled) {
      return {
        status: 'healthy',
        message: 'Log rotation disabled',
        details: { reason: 'Log rotation is not enabled' }
      };
    }

    const now = Date.now();
    const lastRotation = this.server.lastRotation || 0;
    const rotationInterval = this.server.rotationInterval || 'daily';
    
    let expectedInterval;
    switch (rotationInterval) {
      case 'daily': expectedInterval = 24 * 60 * 60 * 1000; break;
      case 'weekly': expectedInterval = 7 * 24 * 60 * 60 * 1000; break;
      case 'monthly': expectedInterval = 30 * 24 * 60 * 60 * 1000; break;
      default: expectedInterval = 24 * 60 * 60 * 1000;
    }

    const timeSinceLastRotation = now - lastRotation;
    const overdue = timeSinceLastRotation > expectedInterval * 1.1; // 10% tolerance

    const status = overdue ? 'warning' : 'healthy';

    return {
      status,
      message: `Log rotation: ${overdue ? 'overdue' : 'on schedule'}`,
      details: {
        rotationInterval,
        lastRotation: new Date(lastRotation).toISOString(),
        timeSinceLastRotation: this.formatDuration(timeSinceLastRotation),
        expectedInterval: this.formatDuration(expectedInterval),
        overdue
      }
    };
  }

  /**
   * Archive system health check
   */
  async checkArchiveSystemHealth() {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      
      const archivesDir = path.resolve(process.cwd(), this.server.config?.archiveDirectory || './archives');
      const files = await fs.readdir(archivesDir);
      
      const archiveFiles = files.filter(f => f.startsWith('allog-archive-') && f.endsWith('.json'));
      const totalSize = await this.calculateDirectorySize(archivesDir);
      
      const maxArchives = this.server.config?.maxArchiveFiles || 30;
      const archiveCount = archiveFiles.length;
      
      const status = archiveCount > maxArchives * 0.9 ? 'warning' : 'healthy';

      return {
        status,
        message: `Archive system: ${archiveCount} files, ${this.formatBytes(totalSize)}`,
        details: {
          archiveCount,
          maxArchives,
          totalSize: this.formatBytes(totalSize),
          directory: archivesDir,
          recentArchives: archiveFiles.slice(-5) // Last 5 archives
        }
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Archive system check failed',
        details: { error: error.message }
      };
    }
  }

  /**
   * Update overall health status
   */
  updateOverallHealth() {
    const checks = Array.from(this.checks.values());
    const criticalChecks = checks.filter(c => c.status === 'critical');
    const errorChecks = checks.filter(c => c.status === 'error');
    const warningChecks = checks.filter(c => c.status === 'warning');
    const healthyChecks = checks.filter(c => c.status === 'healthy');

    if (criticalChecks.length > 0 || errorChecks.length > 0) {
      this.healthStatus = 'critical';
    } else if (warningChecks.length > 0) {
      this.healthStatus = 'warning';
    } else if (healthyChecks.length > 0) {
      this.healthStatus = 'healthy';
    } else {
      this.healthStatus = 'unknown';
    }
  }

  /**
   * Get overall health status
   */
  getOverallHealth() {
    return {
      status: this.healthStatus,
      timestamp: this.lastCheck,
      checks: Array.from(this.checks.values()).map(check => ({
        id: check.id,
        name: check.name,
        status: check.status,
        message: check.message,
        lastRun: check.lastRun ? new Date(check.lastRun).toISOString() : null,
        nextRun: check.nextRun ? new Date(check.nextRun).toISOString() : null
      })),
      summary: {
        total: this.checks.size,
        healthy: Array.from(this.checks.values()).filter(c => c.status === 'healthy').length,
        warning: Array.from(this.checks.values()).filter(c => c.status === 'warning').length,
        critical: Array.from(this.checks.values()).filter(c => c.status === 'critical').length,
        error: Array.from(this.checks.values()).filter(c => c.status === 'error').length
      }
    };
  }

  /**
   * Get detailed health for a specific component
   */
  getComponentHealth(componentId) {
    const check = this.checks.get(componentId);
    if (!check) {
      return { error: 'Component not found' };
    }

    return {
      id: check.id,
      name: check.name,
      status: check.status,
      message: check.message,
      lastRun: check.lastRun ? new Date(check.lastRun).toISOString() : null,
      nextRun: check.nextRun ? new Date(check.nextRun).toISOString() : null,
      details: check.details,
      error: check.error ? check.error.message : null
    };
  }

  /**
   * Helper: Check if directory is writable
   */
  async checkDirectoryWritable(dirPath) {
    try {
      const fs = require('fs').promises;
      const testFile = `${dirPath}/.health-check-${Date.now()}`;
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Helper: Calculate directory size
   */
  async calculateDirectorySize(dirPath) {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      
      let totalSize = 0;
      const files = await fs.readdir(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
      }
      
      return totalSize;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Helper: Format bytes
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Helper: Format duration
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Log health check results
   */
  logHealthCheckResult(check, result) {
    const emoji = result.status === 'healthy' ? '✅' : 
                  result.status === 'warning' ? '⚠️' : 
                  result.status === 'critical' ? '🚨' : '❌';

    console.log(`${emoji} [HEALTH] ${check.name}: ${result.message}`);
    
    // Create structured log entry for Allogi viewer
    if (this.server && this.server.addServerLog) {
      const logEntry = {
        id: `health_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        level: result.status === 'healthy' ? 'info' : 
               result.status === 'warning' ? 'warn' : 'error',
        scriptId: 'server',
        sourceId: 'server',
        sourceType: 'health_checker',
        message: `${check.name}: ${result.message}`,
        data: {
          component: check.id,
          status: result.status,
          message: result.message,
          lastRun: result.lastRun,
          nextRun: result.nextRun,
          details: result.details,
          error: result.error
        }
      };
      
      this.server.addServerLog(logEntry);
    }
  }

  /**
   * Log health check errors
   */
  logHealthCheckError(check, error) {
    console.error(`❌ [HEALTH] ${check.name} failed:`, error.message);
  }
}

module.exports = HealthChecker;
