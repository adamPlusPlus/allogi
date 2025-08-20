#!/usr/bin/env node

/**
 * Allog Intermediary Server
 * 
 * A standalone server that receives Allog formatted data from any application
 * and forwards it to the React viewer. This server acts as a bridge between
 * any Allog-enabled application and the standalone React viewer.
 * 
 * Features:
 * - Cross-platform compatibility
 * - Multiple transport protocols (HTTP, WebSocket, Message Queue)
 * - Real-time data streaming
 * - Source application registration
 * - Data validation and sanitization
 * - Authentication and rate limiting
 * - Persistent storage
 */

const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs').promises;
const { config } = require('./config-loader');
const { DatabaseAdapter } = require('./database-adapter');
const ErrorHandler = require('./error-handler');
const MetricsCollector = require('./metrics-collector');
const HealthChecker = require('./health-checker');

class AllogIntermediaryServer {
  constructor(configOverrides = {}) {
    this.config = config.getServerConfig(configOverrides);
    this.startTime = Date.now();
    
    this.logs = [];
    this.serverLogs = []; // Separate collection for server logs
    this.sources = new Map();
    this.connections = new Map();
    this.monitoringData = new Map();
    this.rateLimitCounters = new Map();
    this.lastCleanup = Date.now();
    this.lastLogRotation = Date.now();
    this.lastArchiveCleanup = Date.now();
    
    // Database adapter
    this.db = new DatabaseAdapter(this.config.storage || { backend: { type: 'file' } });
    
    // Initialize enhanced systems
    this.errorHandler = new ErrorHandler(this);
    this.metricsCollector = new MetricsCollector(this);
    this.healthChecker = new HealthChecker(this);
    
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    
    if (this.config.enableWebSocket) {
      this.setupWebSocket();
    }
    
    this.initializeDatabase();
    this.startMemoryOptimization();
    this.startLogRotation();
    
    // Start monitoring systems
    this.metricsCollector.startCollection();
    this.healthChecker.start();
  }

  setupMiddleware() {
    // CORS for cross-origin requests
    this.app.use(cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Source-ID']
    }));

    this.app.use(express.json({ limit: '25mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Static uploads directory for image logs
    try {
      const uploadsDir = path.resolve(process.cwd(), config.uploadsDirectory);
      require('fs').mkdirSync(uploadsDir, { recursive: true });
      this.app.use('/uploads', require('express').static(uploadsDir));
      this._uploadsDir = uploadsDir;
    } catch (error) {
      console.warn('[Server] Failed to setup uploads directory:', error);
    }

    // Rate limiting middleware
    this.app.use(this.rateLimitMiddleware.bind(this));

    // Request logging and metrics tracking
    this.app.use((req, res, next) => {
      const startTime = Date.now();
      const sourceId = req.get('X-Source-ID') || 'unknown';
      
      // Create structured log entry for request
      const requestLog = {
        id: this.generateLogId(),
        timestamp: new Date().toISOString(),
        level: 'info',
        scriptId: 'server',
        sourceId: 'server',
        sourceType: 'request_logger',
        message: `${req.method} ${req.url} - ${sourceId}`,
        data: {
          method: req.method,
          url: req.url,
          sourceId: sourceId,
          userAgent: req.get('User-Agent'),
          ip: req.ip,
          timestamp: new Date().toISOString()
        }
      };
      
      // Add to server logs for Allogi viewer
      this.addServerLog(requestLog);
      
      // Console logging for monitoring
      console.log(`[SERVER] ${new Date().toISOString()} - ${req.method} ${req.url} - ${sourceId}`);
      
      // Track response time
      res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        
        // Create structured log entry for response
        const responseLog = {
          id: this.generateLogId(),
          timestamp: new Date().toISOString(),
          level: res.statusCode >= 400 ? 'warn' : 'info',
          scriptId: 'server',
          sourceId: 'server',
          sourceType: 'request_logger',
          message: `${req.method} ${req.url} - ${res.statusCode} (${responseTime}ms)`,
          data: {
            method: req.method,
            url: req.url,
            sourceId: sourceId,
            statusCode: res.statusCode,
            responseTime: responseTime,
            timestamp: new Date().toISOString()
          }
        };
        
        // Add to server logs for Allogi viewer
        this.addServerLog(responseLog);
        
        // Record metrics
        if (this.metricsCollector) {
          this.metricsCollector.recordRequest(req.url, req.method, sourceId, responseTime, res.statusCode);
        }
      });
      
      next();
    });
  }

  rateLimitMiddleware(req, res, next) {
    const sourceId = req.get('X-Source-ID') || req.ip;
    const now = Date.now();
    const windowMs = config.rateLimitWindow;

    if (!this.rateLimitCounters.has(sourceId)) {
      this.rateLimitCounters.set(sourceId, { count: 0, resetTime: now + windowMs });
    }

    const rateLimit = this.rateLimitCounters.get(sourceId);
    
    if (now > rateLimit.resetTime) {
      rateLimit.count = 0;
      rateLimit.resetTime = now + windowMs;
    }

    rateLimit.count++;

    if (rateLimit.count > this.config.rateLimit) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((rateLimit.resetTime - now) / 1000)
      });
    }

    next();
  }

  setupRoutes() {
    // Health check
    this.app.get('/', (req, res) => {
      res.json({
        service: 'Allog Intermediary Server',
        version: '1.0.0',
        status: 'running',
        sources: this.sources.size,
        logs: this.logs.length,
        connections: this.connections.size
      });
    });

    // Enhanced health check endpoints
    this.app.get('/health', (req, res) => {
      const startTime = Date.now();
      try {
        const health = this.healthChecker.getOverallHealth();
        const responseTime = Date.now() - startTime;
        
        // Record metrics
        this.metricsCollector.recordRequest('/health', 'GET', 'health_check', responseTime, 200);
        
        res.json({
          status: health.status,
          timestamp: health.timestamp,
          responseTime: `${responseTime}ms`,
          summary: health.summary,
          checks: health.checks
        });
      } catch (error) {
        const errorResponse = this.errorHandler.createErrorResponse(error, {
          endpoint: '/health',
          method: 'GET',
          sourceId: 'health_check'
        });
        res.status(errorResponse.statusCode).json(errorResponse);
      }
    });

    // Component-specific health checks
    this.app.get('/health/:component', (req, res) => {
      const startTime = Date.now();
      try {
        const { component } = req.params;
        const health = this.healthChecker.getComponentHealth(component);
        const responseTime = Date.now() - startTime;
        
        // Record metrics
        this.metricsCollector.recordRequest(`/health/${component}`, 'GET', 'health_check', responseTime, 200);
        
        if (health.error) {
          res.status(404).json({
            error: 'Component not found',
            component,
            available: Array.from(this.healthChecker.checks.keys())
          });
        } else {
          res.json({
            ...health,
            responseTime: `${responseTime}ms`
          });
        }
      } catch (error) {
        const errorResponse = this.errorHandler.createErrorResponse(error, {
          endpoint: `/health/${req.params.component}`,
          method: 'GET',
          sourceId: 'health_check'
        });
        res.status(errorResponse.statusCode).json(errorResponse);
      }
    });

    // Metrics endpoint
    this.app.get('/metrics', (req, res) => {
      const startTime = Date.now();
      try {
        const metrics = this.metricsCollector.getAllMetrics();
        const responseTime = Date.now() - startTime;
        
        // Record metrics
        this.metricsCollector.recordRequest('/metrics', 'GET', 'metrics_collector', responseTime, 200);
        
        res.json({
          timestamp: new Date().toISOString(),
          responseTime: `${responseTime}ms`,
          metrics
        });
      } catch (error) {
        const errorResponse = this.errorHandler.createErrorResponse(error, {
          endpoint: '/metrics',
          method: 'GET',
          sourceId: 'metrics_collector'
        });
        res.status(errorResponse.statusCode).json(errorResponse);
      }
    });

    // Error metrics endpoint
    this.app.get('/metrics/errors', (req, res) => {
      const startTime = Date.now();
      try {
        const errorMetrics = this.errorHandler.getErrorMetrics();
        const responseTime = Date.now() - startTime;
        
        // Record metrics
        this.metricsCollector.recordRequest('/metrics/errors', 'GET', 'metrics_collector', responseTime, 200);
        
        res.json({
          timestamp: new Date().toISOString(),
          responseTime: `${responseTime}ms`,
          errors: errorMetrics
        });
      } catch (error) {
        const errorResponse = this.errorHandler.createErrorResponse(error, {
          endpoint: '/metrics/errors',
          method: 'GET',
          sourceId: 'metrics_collector'
        });
        res.status(errorResponse.statusCode).json(errorResponse);
      }
    });

    // Register a new source application
    this.app.post('/api/register', (req, res) => {
      try {
        const { sourceId, sourceType, sourceVersion, metadata } = req.body;

        if (!sourceId || !sourceType || !sourceVersion) {
          return res.status(400).json({
            error: 'sourceId, sourceType, and sourceVersion are required'
          });
        }

        this.sources.set(sourceId, {
          sourceId,
          sourceType,
          sourceVersion,
          metadata: metadata || {},
          registeredAt: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          logCount: 0
        });

        console.log(`Registered source: ${sourceId} (${sourceType})`);
        
        // Broadcast to WebSocket connections
        this.broadcastToViewers({
          type: 'source_registered',
          data: this.sources.get(sourceId)
        });

        res.json({
          message: 'Source registered successfully',
          sourceId,
          serverTime: new Date().toISOString()
        });
      } catch (error) {
        const errorResponse = this.errorHandler.createErrorResponse(error, {
          endpoint: '/api/register',
          method: 'POST',
          sourceId: sourceId || 'unknown',
          userAgent: req.get('User-Agent'),
          ip: req.ip
        });
        res.status(errorResponse.statusCode).json(errorResponse);
      }
    });

    // Send single log entry
    this.app.post('/api/logs/single', async (req, res) => {
      try {
        const logEntry = this.validateAndEnrichLogEntry(req.body, req.get('X-Source-ID'));
        
        await this.addLogEntry(logEntry);
        
        res.json({
          message: 'Log entry received',
          logId: logEntry.id,
          serverTime: new Date().toISOString()
        });
      } catch (error) {
        const errorResponse = this.errorHandler.createErrorResponse(error, {
          endpoint: '/api/logs/single',
          method: 'POST',
          sourceId: req.get('X-Source-ID') || 'unknown',
          userAgent: req.get('User-Agent'),
          ip: req.ip
        });
        res.status(errorResponse.statusCode).json(errorResponse);
      }
    });

    // Accept raw text logs (malformed or simple text)
    this.app.post('/api/logs/raw', async (req, res) => {
      try {
        const rawData = req.body;
        const sourceId = req.get('X-Source-ID');
        
        // Handle different types of raw input
        let logEntry;
        
        if (typeof rawData === 'string') {
          // Simple text log
          logEntry = this.createRawTextLogEntry(rawData, sourceId);
        } else if (rawData && typeof rawData === 'object') {
          // Try to parse as structured log, fallback to raw if malformed
          try {
            logEntry = this.validateAndEnrichLogEntry(rawData, sourceId);
          } catch (validationError) {
            // Create malformed log entry
            logEntry = this.createMalformedLogEntry(rawData, sourceId, validationError.message);
          }
        } else {
          // Convert to string and create raw log
          logEntry = this.createRawTextLogEntry(String(rawData), sourceId);
        }
        
        await this.addLogEntry(logEntry);
        
        res.json({
          message: 'Raw log entry received',
          logId: logEntry.id,
          serverTime: new Date().toISOString(),
          quality: logEntry.quality || 'normal'
        });
      } catch (error) {
        const errorResponse = this.errorHandler.createErrorResponse(error, {
          endpoint: '/api/logs/raw',
          method: 'POST',
          sourceId: req.get('X-Source-ID') || 'unknown',
          userAgent: req.get('User-Agent'),
          ip: req.ip
        });
        res.status(errorResponse.statusCode).json(errorResponse);
      }
    });

    // Accept simple text logs via query parameter
    this.app.post('/api/logs/text', async (req, res) => {
      try {
        const { text, level = 'debug' } = req.body;
        const sourceId = req.get('X-Source-ID');
        
        if (!text) {
          return res.status(400).json({ error: 'text parameter is required' });
        }
        
        const logEntry = this.createRawTextLogEntry(text, sourceId, level);
        await this.addLogEntry(logEntry);
        
        res.json({
          message: 'Text log entry received',
          logId: logEntry.id,
          serverTime: new Date().toISOString(),
          quality: 'raw-text'
        });
      } catch (error) {
        const errorResponse = this.errorHandler.createErrorResponse(error, {
          endpoint: '/api/logs/text',
          method: 'POST',
          sourceId: req.get('X-Source-ID') || 'unknown',
          userAgent: req.get('User-Agent'),
          ip: req.ip
        });
        res.status(errorResponse.statusCode).json(errorResponse);
      }
    });

    // Accept simple text logs via GET request (for simple integrations)
    this.app.get('/api/logs/text', async (req, res) => {
      try {
        const { text, level = 'debug', source } = req.query;
        const sourceId = source || req.get('X-Source-ID');
        
        if (!text) {
          return res.status(400).json({ error: 'text query parameter is required' });
        }
        
        const logEntry = this.createRawTextLogEntry(text, sourceId, level);
        await this.addLogEntry(logEntry);
        
        res.json({
          message: 'Text log entry received via GET',
          logId: logEntry.id,
          serverTime: new Date().toISOString(),
          quality: 'raw-text',
          method: 'GET'
        });
      } catch (error) {
        const errorResponse = this.errorHandler.createErrorResponse(error, {
          endpoint: '/api/logs/text',
          method: 'GET',
          sourceId: sourceId || 'unknown',
          userAgent: req.get('User-Agent'),
          ip: req.ip
        });
        res.status(errorResponse.statusCode).json(errorResponse);
      }
    });

    // Send batch of log entries
    this.app.post('/api/logs/batch', async (req, res) => {
      try {
        const { logs } = req.body;
        const sourceId = req.get('X-Source-ID');

        if (!Array.isArray(logs)) {
          return res.status(400).json({ error: 'logs must be an array' });
        }

        const validatedLogs = logs.map(log => this.validateAndEnrichLogEntry(log, sourceId));
        
        for (const log of validatedLogs) {
          await this.addLogEntry(log);
        }

        res.json({
          message: 'Batch received',
          count: validatedLogs.length,
          serverTime: new Date().toISOString()
        });
      } catch (error) {
        console.error('Batch log error:', error);
        res.status(400).json({ error: error.message });
      }
    });

    // Get all logs
    this.app.get('/api/logs', (req, res) => {
      try {
        const { level, sourceId, scriptId, limit, offset } = req.query;
        let filteredLogs = [...this.logs];

        // Apply filters
        if (level) {
          filteredLogs = filteredLogs.filter(log => log.level === level);
        }
        if (sourceId) {
          filteredLogs = filteredLogs.filter(log => log.sourceId === sourceId);
        }
        if (scriptId) {
          filteredLogs = filteredLogs.filter(log => log.scriptId === scriptId);
        }

        // Apply pagination
        const start = parseInt(offset) || 0;
        const end = limit ? start + parseInt(limit) : filteredLogs.length;
        const paginatedLogs = filteredLogs.slice(start, end);

        res.json({
          logs: paginatedLogs,
          total: filteredLogs.length,
          start: start,
          end: end,
          hasMore: end < filteredLogs.length
        });
      } catch (error) {
        const errorResponse = this.errorHandler.createErrorResponse(error, {
          endpoint: '/api/logs',
          method: 'GET',
          sourceId: req.get('X-Source-ID') || 'unknown'
        });
        res.status(errorResponse.statusCode).json(errorResponse);
      }
    });

    // Get server logs separately
    this.app.get('/api/logs/server', (req, res) => {
      try {
        const { level, limit, offset } = req.query;
        let filteredLogs = [...this.serverLogs];

        // Apply filters
        if (level) {
          filteredLogs = filteredLogs.filter(log => log.level === level);
        }

        // Apply pagination
        const start = parseInt(offset) || 0;
        const end = limit ? start + parseInt(limit) : filteredLogs.length;
        const paginatedLogs = filteredLogs.slice(start, end);

        res.json({
          logs: paginatedLogs,
          total: filteredLogs.length,
          start: start,
          end: end,
          hasMore: end < filteredLogs.length,
          type: 'server_logs'
        });
      } catch (error) {
        const errorResponse = this.errorHandler.createErrorResponse(error, {
          endpoint: '/api/logs/server',
          method: 'GET',
          sourceId: req.get('X-Source-ID') || 'unknown'
        });
        res.status(errorResponse.statusCode).json(errorResponse);
      }
    });

    // Get recursive logs (server logs, viewer logs, and source logs)
    this.app.get('/api/logs/recursive', (req, res) => {
      try {
        const { level, limit, offset, sourceType } = req.query;
        let filteredLogs = [...this.serverLogs];

        // Apply filters
        if (level) {
          filteredLogs = filteredLogs.filter(log => log.level === level);
        }
        if (sourceType) {
          filteredLogs = filteredLogs.filter(log => log.sourceType === sourceType);
        }

        // Apply pagination
        const start = parseInt(offset) || 0;
        const end = limit ? start + parseInt(limit) : filteredLogs.length;
        const paginatedLogs = filteredLogs.slice(start, end);

        res.json({
          logs: filteredLogs,
          total: filteredLogs.length,
          start: start,
          end: end,
          hasMore: end < filteredLogs.length,
          type: 'recursive_logs'
        });
      } catch (error) {
        const errorResponse = this.errorHandler.createErrorResponse(error, {
          endpoint: '/api/logs/recursive',
          method: 'GET',
          sourceId: req.get('X-Source-ID') || 'unknown'
        });
        res.status(errorResponse.statusCode).json(errorResponse);
      }
    });

    // Get logs with filtering
    this.app.get('/api/logs', (req, res) => {
      try {
        console.log('GET /api/logs called with query:', req.query);
        const { sourceId, level, scriptId, limit, offset, search, since, until } = req.query;

        let filteredLogs = [...this.logs];

        // Apply filters
        if (sourceId) {
          filteredLogs = filteredLogs.filter(log => log.sourceId === sourceId);
        }

        if (level) {
          const levels = level.split(',');
          filteredLogs = filteredLogs.filter(log => levels.includes(log.level));
        }

        if (scriptId) {
          filteredLogs = filteredLogs.filter(log => log.scriptId === scriptId);
        }

        if (search) {
          const searchLower = search.toLowerCase();
          filteredLogs = filteredLogs.filter(log => 
            log.message.toLowerCase().includes(searchLower) ||
            (log.data && JSON.stringify(log.data).toLowerCase().includes(searchLower))
          );
        }

        if (since) {
          const sinceDate = new Date(since);
          filteredLogs = filteredLogs.filter(log => {
            const logTime = log.time || log.timestamp || new Date().toISOString();
            return new Date(logTime) >= sinceDate;
          });
        }

        if (until) {
          const untilDate = new Date(until);
          filteredLogs = filteredLogs.filter(log => {
            const logTime = log.time || log.timestamp || new Date().toISOString();
            return new Date(logTime) <= untilDate;
          });
        }

        // Sort by time (newest first)
        filteredLogs.sort((a, b) => {
          const timeA = a.time || a.timestamp || new Date().toISOString();
          const timeB = b.time || b.timestamp || new Date().toISOString();
          return new Date(timeB) - new Date(timeA);
        });

        // Apply pagination (if limit provided). If not provided, return all.
        const total = filteredLogs.length;
        const start = parseInt(offset || 0);
        const limitNum = (limit !== undefined) ? parseInt(limit) : null;
        const end = (limitNum != null && !Number.isNaN(limitNum)) ? (start + limitNum) : total;
        const paginatedLogs = filteredLogs.slice(start, end);

        const response = {
          logs: paginatedLogs,
          total,
          offset: start,
          limit: limitNum != null ? limitNum : total,
          hasMore: end < total,
          performance: {
            indexUsed: sourceId || level || scriptId || (since && until),
            filteredCount: total,
            returnedCount: paginatedLogs.length
          }
        };
        console.log('Sending logs response:', { total, returnedCount: paginatedLogs.length });
        res.json(response);
      } catch (error) {
        console.error('Get logs error:', error);
        res.status(500).json({ error: 'Failed to retrieve logs' });
      }
    });

    // Get server status
    this.app.get('/api/status', (req, res) => {
      const levelCounts = {};
      const sourceCounts = {};

      this.logs.forEach(log => {
        levelCounts[log.level] = (levelCounts[log.level] || 0) + 1;
        sourceCounts[log.sourceId] = (sourceCounts[log.sourceId] || 0) + 1;
      });

      res.json({
        totalLogs: this.logs.length,
        sources: this.sources.size,
        connections: this.connections.size,
        levelCounts,
        sourceCounts,
        serverTime: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Get registered sources
    this.app.get('/api/sources', (req, res) => {
      res.json({
        sources: Array.from(this.sources.values())
      });
    });

    // Clear logs
    this.app.delete('/api/logs', (req, res) => {
      const { sourceId } = req.query;
      
      if (sourceId) {
        this.logs = this.logs.filter(log => log.sourceId !== sourceId);
      } else {
        this.logs = [];
      }

      this.persistData();
      
      // Broadcast to viewers
      this.broadcastToViewers({
        type: 'logs_cleared',
        data: { sourceId }
      });

      res.json({ message: 'Logs cleared' });
    });

    // Legacy endpoint removed - use DELETE /api/logs instead

    // Minimal scripts list endpoint for UI compatibility
    this.app.get('/api/logs/scripts', (req, res) => {
      const scripts = Array.from(new Set(this.logs.map(l => l.scriptId).filter(Boolean)));
      res.json({ scripts });
    });

    // Toggle log collection for specific script/module
    this.app.post('/api/logs/toggle/:scriptId', (req, res) => {
      const { scriptId } = req.params;
      const { enabled } = req.body;
      
      if (this._instrumentationConfig && this._instrumentationConfig.components[scriptId]) {
        this._instrumentationConfig.components[scriptId].enabled = enabled !== false;
        res.json({ 
          message: `Logging ${enabled ? 'enabled' : 'disabled'} for ${scriptId}`,
          scriptId,
          enabled: this._instrumentationConfig.components[scriptId].enabled
        });
      } else {
        res.status(404).json({ 
          error: `Script '${scriptId}' not found in active components`,
          availableScripts: Object.keys(this._instrumentationConfig?.components || {})
        });
      }
    });

    // Dynamic instrumentation config storage (in-memory)
    // Configuration is populated dynamically based on active modules
    this._instrumentationConfig = this._instrumentationConfig || {
      enabled: true,
      defaultLevel: config.defaultInstrumentationLevel,
      components: {}, // Populated dynamically by discoverActiveModules()
      methods: {
        logMethodCalls: true,
        logMethodParameters: true,
        logMethodReturns: true,
        logMethodTiming: true,
        logMethodErrors: true
      },
      state: {
        logVariableChanges: true,
        logConfigurationChanges: true,
        logBufferOperations: true,
        logModuleStateChanges: true,
        logServerCommunication: true
      },
      dataFlow: {
        logDataTransformation: true,
        logDataRouting: true,
        logDataFiltering: true,
        logDataSerialization: true
      },
      performance: {
        logExecutionTime: true,
        logMemoryUsage: true,
        logBufferStats: true,
        logServerLatency: true
      }
    };
    this.app.get('/api/instrumentation/config', (req, res) => {
      // Populate components dynamically from discovered modules
      const activeModules = this.discoverActiveModules();
      
      // Merge discovered components with existing config
      Object.keys(activeModules).forEach(moduleId => {
        if (!this._instrumentationConfig.components[moduleId]) {
          this._instrumentationConfig.components[moduleId] = {
            enabled: true,
            level: this._instrumentationConfig.defaultLevel,
            methods: activeModules[moduleId].methods || [],
            excludeMethods: []
          };
        }
      });
      
      res.json({ config: this._instrumentationConfig });
    });
    this.app.post('/api/instrumentation/config', express.json(), (req, res) => {
      const { config } = req.body || {};
      if (config) this._instrumentationConfig = config;
      res.json({ ok: true });
    });

    // Individual monitoring data endpoint
    this.app.post('/api/monitoring/data', async (req, res) => {
      try {
        const { moduleId, scriptId, type, name, value, previousValue, metadata } = req.body;
        const sourceId = req.get('X-Source-ID');

        // Validate required fields
        if (!moduleId || !scriptId || !type || !name || value === undefined) {
          return res.status(400).json({ 
            error: 'Missing required fields: moduleId, scriptId, type, name, value' 
          });
        }

        // Validate type
        const validTypes = ['variable', 'state', 'function', 'property', 'event'];
        if (!validTypes.includes(type)) {
          return res.status(400).json({ 
            error: `Invalid type. Must be one of: ${validTypes.join(', ')}` 
          });
        }

        const monitoringEntry = this.createMonitoringEntry({
          moduleId,
          scriptId,
          type,
          name,
          value,
          previousValue,
          metadata,
          sourceId
        });

        await this.addMonitoringEntry(monitoringEntry);

        res.json({
          message: 'Monitoring data received',
          id: monitoringEntry.id,
          serverTime: new Date().toISOString()
        });
      } catch (error) {
        console.error('Monitoring data error:', error);
        res.status(400).json({ error: error.message });
      }
    });

    // Batch monitoring data endpoint
    this.app.post('/api/monitoring/batch', async (req, res) => {
      try {
        const { entries } = req.body;
        const sourceId = req.get('X-Source-ID');

        if (!Array.isArray(entries)) {
          return res.status(400).json({ error: 'entries must be an array' });
        }

        const processedEntries = entries.map(entry => {
          const { moduleId, scriptId, type, name, value, previousValue, metadata } = entry;
          
          // Validate required fields for each entry
          if (!moduleId || !scriptId || !type || !name || value === undefined) {
            throw new Error(`Invalid entry: Missing required fields in entry for ${name}`);
          }

          return this.createMonitoringEntry({
            moduleId,
            scriptId,
            type,
            name,
            value,
            previousValue,
            metadata,
            sourceId
          });
        });

        // Add all entries
        for (const entry of processedEntries) {
          await this.addMonitoringEntry(entry);
        }

        res.json({
          message: 'Batch monitoring data received',
          count: processedEntries.length,
          serverTime: new Date().toISOString()
        });
      } catch (error) {
        console.error('Batch monitoring data error:', error);
        res.status(400).json({ error: error.message });
      }
    });

    // Enhanced monitoring endpoint with structured monitoring data
    this.app.get('/api/monitoring', (req, res) => {
      try {
        // Get structured monitoring data from actual tracked variables/states/functions
        const structuredData = this.organizeMonitoringData();
        const realStats = this.calculateRealMonitoringStats(structuredData);
        
        // Also include basic module discovery for compatibility
        const discoveredModules = this.discoverActiveModules();
        
        res.json({ 
          modules: structuredData,  // Structured monitoring data
          discovered: discoveredModules, // Basic module discovery
          stats: realStats
        });
      } catch (error) {
        console.error('Monitoring endpoint error:', error);
        res.status(500).json({ error: 'Failed to fetch monitoring data' });
      }
    });

    // === EXPORT ENDPOINTS ===
    
    // Export logs in various formats
    this.app.get('/api/export/logs', (req, res) => {
      try {
        const { 
          format = 'json', 
          start, 
          end, 
          sourceId, 
          level, 
          scriptId,
          includeRecursive = 'false'
        } = req.query;

        // Filter logs based on query parameters
        let filteredLogs = [...this.logs];

        if (start) {
          const startDate = new Date(start);
          filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= startDate);
        }

        if (end) {
          const endDate = new Date(end);
          filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= endDate);
        }

        if (sourceId) {
          filteredLogs = filteredLogs.filter(log => log.sourceId === sourceId);
        }

        if (level) {
          filteredLogs = filteredLogs.filter(log => log.level === level);
        }

        if (scriptId) {
          filteredLogs = filteredLogs.filter(log => log.scriptId === scriptId);
        }

        // Include recursive logs if requested
        if (includeRecursive === 'true') {
          // Add recursive logs to the export
          filteredLogs = filteredLogs.concat(this.recursiveLogs || []);
        }

        // Sort by timestamp
        filteredLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Format response based on requested format
        if (format === 'csv') {
          const csv = this.convertLogsToCSV(filteredLogs);
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 
            `attachment; filename="allog-export-${new Date().toISOString().split('T')[0]}.csv"`);
          res.send(csv);
        } else if (format === 'json') {
          const exportData = {
            metadata: {
              exportedAt: new Date().toISOString(),
              totalLogs: filteredLogs.length,
              filters: { start, end, sourceId, level, scriptId, includeRecursive },
              format: 'allog-export-v1'
            },
            logs: filteredLogs
          };

          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', 
            `attachment; filename="allog-export-${new Date().toISOString().split('T')[0]}.json"`);
          res.json(exportData);
        } else {
          res.status(400).json({ error: 'Unsupported format. Use "json" or "csv"' });
        }
      } catch (error) {
        console.error('Export logs error:', error);
        res.status(500).json({ error: 'Failed to export logs' });
      }
    });

    // Export monitoring data
    this.app.get('/api/export/monitoring', (req, res) => {
      try {
        const { 
          format = 'json', 
          moduleId, 
          scriptId, 
          type,
          start,
          end 
        } = req.query;

        // Filter monitoring data
        let filteredData = [...this.monitoringData];

        if (start) {
          const startDate = new Date(start);
          filteredData = filteredData.filter(entry => new Date(entry.timestamp) >= startDate);
        }

        if (end) {
          const endDate = new Date(end);
          filteredData = filteredData.filter(entry => new Date(entry.timestamp) <= endDate);
        }

        if (moduleId) {
          filteredData = filteredData.filter(entry => entry.moduleId === moduleId);
        }

        if (scriptId) {
          filteredData = filteredData.filter(entry => entry.scriptId === scriptId);
        }

        if (type) {
          filteredData = filteredData.filter(entry => entry.type === type);
        }

        // Sort by timestamp
        filteredData.sort((a, b) => a.timestamp - b.timestamp);

        if (format === 'csv') {
          const csv = this.convertMonitoringToCSV(filteredData);
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 
            `attachment; filename="allog-monitoring-export-${new Date().toISOString().split('T')[0]}.csv"`);
          res.send(csv);
        } else if (format === 'json') {
          const structuredData = this.organizeMonitoringData();
          const exportData = {
            metadata: {
              exportedAt: new Date().toISOString(),
              totalEntries: filteredData.length,
              filters: { moduleId, scriptId, type, start, end },
              format: 'allog-monitoring-export-v1'
            },
            rawData: filteredData,
            structuredData: structuredData
          };

          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', 
            `attachment; filename="allog-monitoring-export-${new Date().toISOString().split('T')[0]}.json"`);
          res.json(exportData);
        } else {
          res.status(400).json({ error: 'Unsupported format. Use "json" or "csv"' });
        }
      } catch (error) {
        console.error('Export monitoring error:', error);
        res.status(500).json({ error: 'Failed to export monitoring data' });
      }
    });

    // Export full system backup
    this.app.get('/api/export/backup', (req, res) => {
      try {
        const { includeUploads = 'false' } = req.query;

        const backupData = {
          metadata: {
            backupCreatedAt: new Date().toISOString(),
            version: 'allog-backup-v1',
            serverConfig: {
              maxLogs: this.config.maxLogs,
              maxMonitoringEntries: this.config.maxMonitoringEntries,
              enablePersistence: this.config.enablePersistence
            }
          },
          logs: this.logs,
          monitoringData: this.monitoringData,
          sources: Array.from(this.sources.entries()),
          instrumentationConfig: this.instrumentationConfig,
          stats: {
            totalLogs: this.logs.length,
            totalMonitoringEntries: this.monitoringData.length,
            totalSources: this.sources.size
          }
        };

        // Optionally include upload file references (not the actual files)
        if (includeUploads === 'true') {
          const fs = require('fs');
          const path = require('path');
          try {
            const uploadsPath = path.join(__dirname, this.config.uploadsDir || 'uploads');
            if (fs.existsSync(uploadsPath)) {
              const files = fs.readdirSync(uploadsPath);
              backupData.uploadFiles = files.map(file => ({
                filename: file,
                path: path.join(uploadsPath, file),
                size: fs.statSync(path.join(uploadsPath, file)).size
              }));
            }
          } catch (uploadError) {
            console.warn('Could not read uploads directory:', uploadError.message);
          }
        }

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 
          `attachment; filename="allog-full-backup-${new Date().toISOString().split('T')[0]}.json"`);
        res.json(backupData);
      } catch (error) {
        console.error('Export backup error:', error);
        res.status(500).json({ error: 'Failed to create backup' });
      }
    });

    // === STREAMING ENDPOINTS ===

    // Server-Sent Events for real-time log streaming
    this.app.get('/api/logs/stream', (req, res) => {
      try {
        const { sourceId, level, scriptId } = req.query;

        // Set SSE headers
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Cache-Control'
        });

        // Send initial connection event
        res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

        // Store client with filters
        const clientId = `sse-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const client = {
          id: clientId,
          response: res,
          filters: { sourceId, level: level?.split(','), scriptId },
          connectedAt: Date.now()
        };

        // Add to SSE clients set
        if (!this.sseClients) {
          this.sseClients = new Set();
        }
        this.sseClients.add(client);

        // Send recent logs to new client
        const recentLogs = this.logs.slice(-50); // Last 50 logs
        const filteredRecentLogs = this.filterLogsForClient(recentLogs, client.filters);
        
        filteredRecentLogs.forEach(log => {
          res.write(`data: ${JSON.stringify({ type: 'log', data: log })}\n\n`);
        });

        console.log(`📡 SSE client connected: ${clientId} (${this.sseClients.size} total)`);

        // Handle client disconnect
        req.on('close', () => {
          this.sseClients.delete(client);
          console.log(`📡 SSE client disconnected: ${clientId} (${this.sseClients.size} total)`);
        });

        req.on('error', () => {
          this.sseClients.delete(client);
        });

      } catch (error) {
        console.error('SSE logs stream error:', error);
        res.status(500).json({ error: 'Failed to start log stream' });
      }
    });

    // Server-Sent Events for real-time monitoring streaming
    this.app.get('/api/monitoring/stream', (req, res) => {
      try {
        const { moduleId, scriptId, type } = req.query;

        // Set SSE headers
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Cache-Control'
        });

        // Send initial connection event
        res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

        // Store client with filters
        const clientId = `sse-mon-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const client = {
          id: clientId,
          response: res,
          filters: { moduleId, scriptId, type: type?.split(',') },
          connectedAt: Date.now()
        };

        // Add to monitoring SSE clients set
        if (!this.sseMonitoringClients) {
          this.sseMonitoringClients = new Set();
        }
        this.sseMonitoringClients.add(client);

        // Send recent monitoring data to new client
        const recentMonitoring = this.monitoringData.slice(-20); // Last 20 entries
        const filteredRecentMonitoring = this.filterMonitoringForClient(recentMonitoring, client.filters);
        
        filteredRecentMonitoring.forEach(entry => {
          res.write(`data: ${JSON.stringify({ type: 'monitoring', data: entry })}\n\n`);
        });

        console.log(`📊 SSE monitoring client connected: ${clientId} (${this.sseMonitoringClients.size} total)`);

        // Handle client disconnect
        req.on('close', () => {
          this.sseMonitoringClients.delete(client);
          console.log(`📊 SSE monitoring client disconnected: ${clientId} (${this.sseMonitoringClients.size} total)`);
        });

        req.on('error', () => {
          this.sseMonitoringClients.delete(client);
        });

      } catch (error) {
        console.error('SSE monitoring stream error:', error);
        res.status(500).json({ error: 'Failed to start monitoring stream' });
      }
    });

    // === DATABASE CONFIGURATION ENDPOINTS ===

    // Get current database configuration
    this.app.get('/api/database/config', (req, res) => {
      try {
        const config = {
          type: this.db.type,
          connected: !!this.db.backend,
          capabilities: {
            indexedQueries: this.db.type !== 'file',
            transactions: this.db.type !== 'file',
            advancedFiltering: this.db.type !== 'file'
          }
        };
        
        res.json(config);
      } catch (error) {
        console.error('Database config error:', error);
        res.status(500).json({ error: 'Failed to get database configuration' });
      }
    });

    // Get database statistics
    this.app.get('/api/database/stats', async (req, res) => {
      try {
        const stats = {
          logs: this.logs.length,
          monitoring: this.monitoringData.length,
          sources: this.sources.size,
          type: this.db.type,
          memoryIndexes: {
            logIndexSize: this.logIndexes.byTimeRange.length,
            monitoringIndexSize: this.monitoringIndexes.byTimeRange.length
          }
        };
        
        res.json(stats);
      } catch (error) {
        console.error('Database stats error:', error);
        res.status(500).json({ error: 'Failed to get database statistics' });
      }
    });

    // === ARCHIVE MANAGEMENT ENDPOINTS ===

    // Get archive information
    this.app.get('/api/archives', async (req, res) => {
      try {
        const archiveInfo = await this.getArchiveInfo();
        res.json(archiveInfo);
      } catch (error) {
        console.error('Get archives error:', error);
        res.status(500).json({ error: 'Failed to get archive information' });
      }
    });

    // Trigger manual log rotation
    this.app.post('/api/archives/rotate', async (req, res) => {
      try {
        const result = await this.triggerManualRotation();
        res.json(result);
      } catch (error) {
        console.error('Manual rotation error:', error);
        res.status(500).json({ error: 'Failed to perform log rotation' });
      }
    });

    // Download specific archive
    this.app.get('/api/archives/:filename', async (req, res) => {
      try {
        const { filename } = req.params;
        const path = require('path');
        const fs = require('fs').promises;
        
        // Validate filename to prevent path traversal
        if (!filename.match(/^allog-archive-[\w-]+\.json$/)) {
          return res.status(400).json({ error: 'Invalid archive filename' });
        }
        
        const archivePath = path.join(this.archiveDirectory, filename);
        
        // Check if file exists
        try {
          await fs.access(archivePath);
        } catch (error) {
          return res.status(404).json({ error: 'Archive file not found' });
        }
        
        // Set headers for download
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        // Stream the file
        const fileContent = await fs.readFile(archivePath);
        res.send(fileContent);
        
      } catch (error) {
        console.error('Archive download error:', error);
        res.status(500).json({ error: 'Failed to download archive' });
      }
    });

    // === IMPORT ENDPOINTS ===

    // Import logs from backup or external system
    this.app.post('/api/import/logs', (req, res) => {
      try {
        const { logs, metadata, replaceExisting = false } = req.body;

        if (!Array.isArray(logs)) {
          return res.status(400).json({ error: 'logs must be an array' });
        }

        let importedCount = 0;
        let skippedCount = 0;
        const errors = [];

        // Clear existing logs if requested
        if (replaceExisting) {
          this.logs = [];
          console.log('Cleared existing logs for import');
        }

        // Import each log
        logs.forEach((logData, index) => {
          try {
            // Validate and enrich log entry
            const enrichedLog = this.validateAndEnrichLogEntry(logData);
            
            // Check for duplicates (by id if present)
            if (logData.id && this.logs.find(log => log.id === logData.id)) {
              skippedCount++;
              return;
            }

            this.logs.push(enrichedLog);
            importedCount++;

            // Maintain size limit
            if (this.logs.length > this.config.maxLogs) {
              this.logs.shift();
            }
          } catch (error) {
            errors.push(`Log ${index}: ${error.message}`);
          }
        });

        // Persist if enabled
        if (this.config.enablePersistence) {
          this.persistData();
        }

        // Broadcast update to viewers
        this.broadcastToViewers({
          type: 'bulk_import',
          data: {
            imported: importedCount,
            skipped: skippedCount,
            errors: errors.length
          }
        });

        res.json({
          message: 'Log import completed',
          imported: importedCount,
          skipped: skippedCount,
          errors: errors.length > 0 ? errors : undefined,
          serverTime: new Date().toISOString()
        });
      } catch (error) {
        console.error('Import logs error:', error);
        res.status(500).json({ error: 'Failed to import logs' });
      }
    });

    // Import full system backup
    this.app.post('/api/import/backup', (req, res) => {
      try {
        const { 
          logs, 
          monitoringData, 
          sources, 
          instrumentationConfig, 
          metadata,
          replaceExisting = false
        } = req.body;

        const results = {
          logs: { imported: 0, skipped: 0 },
          monitoring: { imported: 0, skipped: 0 },
          sources: { imported: 0, skipped: 0 },
          errors: []
        };

        // Import logs
        if (logs && Array.isArray(logs)) {
          if (replaceExisting) this.logs = [];
          
          logs.forEach(logData => {
            try {
              const enrichedLog = this.validateAndEnrichLogEntry(logData);
              if (!logData.id || !this.logs.find(log => log.id === logData.id)) {
                this.logs.push(enrichedLog);
                results.logs.imported++;
              } else {
                results.logs.skipped++;
              }
            } catch (error) {
              results.errors.push(`Log import: ${error.message}`);
            }
          });

          // Maintain size limit
          if (this.logs.length > this.config.maxLogs) {
            this.logs = this.logs.slice(-this.config.maxLogs);
          }
        }

        // Import monitoring data
        if (monitoringData && Array.isArray(monitoringData)) {
          if (replaceExisting) this.monitoringData = [];
          
          monitoringData.forEach(entry => {
            try {
              if (!entry.id || !this.monitoringData.find(m => m.id === entry.id)) {
                this.monitoringData.push(entry);
                results.monitoring.imported++;
              } else {
                results.monitoring.skipped++;
              }
            } catch (error) {
              results.errors.push(`Monitoring import: ${error.message}`);
            }
          });

          // Maintain size limit
          const maxMonitoring = this.config.maxMonitoringEntries || (this.config.maxLogs * 2);
          if (this.monitoringData.length > maxMonitoring) {
            this.monitoringData = this.monitoringData.slice(-maxMonitoring);
          }
        }

        // Import sources
        if (sources && Array.isArray(sources)) {
          if (replaceExisting) this.sources.clear();
          
          sources.forEach(([sourceId, sourceData]) => {
            try {
              if (!this.sources.has(sourceId)) {
                this.sources.set(sourceId, sourceData);
                results.sources.imported++;
              } else {
                results.sources.skipped++;
              }
            } catch (error) {
              results.errors.push(`Source import: ${error.message}`);
            }
          });
        }

        // Import instrumentation config
        if (instrumentationConfig) {
          this.instrumentationConfig = { ...this.instrumentationConfig, ...instrumentationConfig };
        }

        // Persist all changes
        if (this.config.enablePersistence) {
          this.persistData();
        }

        // Broadcast update
        this.broadcastToViewers({
          type: 'backup_restored',
          data: results
        });

        res.json({
          message: 'Backup import completed',
          results,
          serverTime: new Date().toISOString()
        });
      } catch (error) {
        console.error('Import backup error:', error);
        res.status(500).json({ error: 'Failed to import backup' });
      }
    });

    // Endpoint to accept image logs (base64) and persist image to /uploads
    this.app.post('/api/logs/image', async (req, res) => {
      try {
        const { imageBase64, contentType = config.defaultContentType, fileName, message = 'Image received', level = 'debug', data = {}, sourceId } = req.body || {};
        if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });
        if (!this._uploadsDir) return res.status(500).json({ error: 'Uploads directory not available' });

        const ext = (fileName && fileName.includes('.')) ? fileName.split('.').pop() : (contentType.split('/')[1] || 'png');
        const safeName = (fileName && fileName.replace(/[^a-zA-Z0-9._-]/g, '')) || `allog_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const filePath = path.join(this._uploadsDir, safeName);
        const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');
        await require('fs').promises.writeFile(filePath, Buffer.from(base64Data, 'base64'));
        const imageUrl = `/uploads/${safeName}`;

        const logEntry = this.validateAndEnrichLogEntry({
          message,
          level,
          data: { ...data, imageUrl, contentType },
          time: new Date().toISOString()
        }, req.get('X-Source-ID') || sourceId);

        await this.addLogEntry(logEntry);
        res.json({ message: 'Image stored', imageUrl, logId: logEntry.id });
      } catch (e) {
        console.error('Image log error:', e);
        res.status(500).json({ error: 'Failed to store image' });
      }
    });

    // Accept screenshots with optional overlay metadata
    this.app.post('/api/screenshots', async (req, res) => {
      try {
        const { image, tag, platform, timestamp, overlay = {}, sourceId } = req.body || {};
        if (!image) return res.status(400).json({ error: 'image is required (data URL)' });
        if (!this._uploadsDir) return res.status(500).json({ error: 'Uploads directory not available' });

        const base64Data = image.replace(/^data:[^;]+;base64,/, '');
        const fileName = `screenshot_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
        const filePath = path.join(this._uploadsDir, fileName);
        await require('fs').promises.writeFile(filePath, Buffer.from(base64Data, 'base64'));
        const imageUrl = `/uploads/${fileName}`;

        const record = {
          id: `ss_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          imageUrl,
          tag,
          platform,
          timestamp: timestamp || new Date().toISOString(),
          overlay,
          sourceId: req.get('X-Source-ID') || sourceId || 'unknown'
        };
        this.screenshots.push(record);

        // Also add a log entry for visibility in existing flows
        const logEntry = this.validateAndEnrichLogEntry({
          message: 'screenshot received',
          level: config.defaultLogLevel,
          data: { imageUrl, tag, platform, overlay },
          time: record.timestamp
        }, record.sourceId);
        await this.addLogEntry(logEntry);

        // Broadcast to viewers
        this.broadcastToViewers({ type: 'new_screenshot', data: record });

        res.json({ ok: true, id: record.id, imageUrl });
      } catch (e) {
        console.error('Screenshot error:', e);
        res.status(500).json({ error: 'Failed to store screenshot' });
      }
    });

    // List screenshots (basic pagination)
    this.app.get('/api/screenshots', (req, res) => {
      const { offset = 0, limit } = req.query;
      const start = parseInt(offset);
      const lim = limit != null ? parseInt(limit) : this.screenshots.length;
      const total = this.screenshots.length;
      const items = this.screenshots.slice(start, start + lim);
      res.json({ total, offset: start, limit: lim, items });
    });

    // Get a single screenshot by id
    this.app.get('/api/screenshots/:id', (req, res) => {
      const item = this.screenshots.find(s => s.id === req.params.id);
      if (!item) return res.status(404).json({ error: 'Not found' });
      res.json(item);
    });

    // Export logs
    this.app.get('/api/export', (req, res) => {
      const { format = 'json', sourceId } = req.query;
      
      let exportLogs = [...this.logs];
      
      if (sourceId) {
        exportLogs = exportLogs.filter(log => log.sourceId === sourceId);
      }

      if (format === 'csv') {
        const csv = this.convertToCSV(exportLogs);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="allog-export-${Date.now()}.csv"`);
        res.send(csv);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="allog-export-${Date.now()}.json"`);
        res.json(exportLogs);
      }
    });
  }

  setupWebSocket() {
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });

    this.wss.on('connection', (ws, req) => {
      console.log('WebSocket connection established');
      this.connections.add(ws);

      // Send current state
      ws.send(JSON.stringify({
        type: 'connection_established',
        data: {
          sources: Array.from(this.sources.values()),
          logCount: this.logs.length,
          serverTime: new Date().toISOString()
        }
      }));

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleWebSocketMessage(ws, data);
        } catch (error) {
          console.error('WebSocket message error:', error);
          ws.send(JSON.stringify({
            type: 'error',
            data: { message: 'Invalid message format' }
          }));
        }
      });

      ws.on('close', () => {
        console.log('WebSocket connection closed');
        this.connections.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.connections.delete(ws);
      });
    });
  }

  handleWebSocketMessage(ws, message) {
    switch (message.type) {
      case 'subscribe':
        // Handle subscription to specific sources/levels
        ws.subscriptions = message.data || {};
        break;
      
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', data: { timestamp: Date.now() } }));
        break;
      
      default:
        console.log('Unknown WebSocket message type:', message.type);
    }
  }

  validateAndEnrichLogEntry(logData, sourceId) {
    // Validate required fields
    if (!logData.message) {
      throw new Error('message is required');
    }

    if (!logData.level || !config.isValidLogLevel(logData.level)) {
      throw new Error(`level must be one of: ${config.validLogLevels.join(', ')}`);
    }

    // Enrich with server data
    const enrichedLog = {
      id: logData.id || `${sourceId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      message: logData.message,
      time: logData.time || new Date().toISOString(),
      level: logData.level,
      data: logData.data,
      sourceId: sourceId || config.defaultSourceType,
      sourceType: logData.sourceType || config.defaultSourceType,
      sourceVersion: logData.sourceVersion || config.defaultSourceVersion,
      file: logData.file,
      line: logData.line,
      column: logData.column,
      functionName: logData.functionName,
      metadata: logData.metadata || {},
      transmissionId: logData.transmissionId,
      sequenceNumber: logData.sequenceNumber,
      serverReceivedAt: new Date().toISOString(),
      quality: 'normal'
    };

    return enrichedLog;
  }

  createRawTextLogEntry(text, sourceId, level = 'debug') {
    // Create a log entry from raw text
    const logEntry = {
      id: `raw_${sourceId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      message: text,
      time: new Date().toISOString(),
      level: config.isValidLogLevel(level) ? level : 'debug',
      data: { originalText: text, parsedAs: 'raw-text' },
      sourceId: sourceId || config.defaultSourceType,
      sourceType: config.defaultSourceType,
      sourceVersion: config.defaultSourceVersion,
      file: null,
      line: null,
      column: null,
      functionName: null,
      metadata: { 
        quality: 'raw-text',
        originalFormat: 'text',
        autoParsed: true
      },
      transmissionId: null,
      sequenceNumber: null,
      serverReceivedAt: new Date().toISOString(),
      quality: 'raw-text'
    };

    return logEntry;
  }

  createMalformedLogEntry(rawData, sourceId, validationError) {
    // Create a log entry for malformed data
    const logEntry = {
      id: `malformed_${sourceId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      message: `Malformed log data: ${validationError}`,
      time: new Date().toISOString(),
      level: 'warn',
      data: { 
        originalData: rawData,
        validationError: validationError,
        parsedAs: 'malformed'
      },
      sourceId: sourceId || config.defaultSourceType,
      sourceType: config.defaultSourceType,
      sourceVersion: config.defaultSourceVersion,
      file: null,
      line: null,
      column: null,
      functionName: null,
      metadata: { 
        quality: 'malformed',
        originalFormat: typeof rawData,
        autoParsed: true,
        validationIssues: [validationError]
      },
      transmissionId: null,
      sequenceNumber: null,
      serverReceivedAt: new Date().toISOString(),
      quality: 'malformed'
    };

    return logEntry;
  }

  addLogEntry(logEntry) {
    // Validate required fields
    if (!logEntry.id || !logEntry.message || !logEntry.level) {
      console.error('Invalid log entry:', logEntry);
      return;
    }

    // Add timestamp if missing
    if (!logEntry.timestamp) {
      logEntry.timestamp = new Date().toISOString();
    }

    // Add to logs array
    this.logs.push(logEntry);

    // Broadcast to WebSocket clients
    this.broadcastToViewers({
      type: 'new_log',
      data: logEntry
    });

    // Persist if enabled
    if (this.config.enablePersistence) {
      this.persistLogs();
    }

    // Check if we need to rotate logs
    if (this.logs.length > this.config.maxLogs) {
      this.rotateLogs();
    }
  }

  /**
   * Add server log entry (separate from application logs)
   */
  addServerLog(logEntry) {
    // Validate required fields
    if (!logEntry.id || !logEntry.message || !logEntry.level) {
      console.error('Invalid server log entry:', logEntry);
      return;
    }

    // Add timestamp if missing
    if (!logEntry.timestamp) {
      logEntry.timestamp = new Date().toISOString();
    }

    // Add to server logs array
    this.serverLogs.push(logEntry);

    // Broadcast to WebSocket clients as regular log entry for recursive logs
    this.broadcastToViewers({
      type: 'new_log',
      data: logEntry
    });

    // Persist server logs if enabled
    if (this.config.enablePersistence) {
      this.persistServerLogs();
    }

    // Keep server logs manageable
    if (this.serverLogs.length > 1000) {
      this.serverLogs = this.serverLogs.slice(-1000);
    }
  }

  /**
   * Persist server logs to storage
   */
  persistServerLogs() {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      
      const serverLogsFile = path.join(__dirname, 'server-logs.json');
      const data = {
        timestamp: new Date().toISOString(),
        logs: this.serverLogs
      };
      
      fs.writeFile(serverLogsFile, JSON.stringify(data, null, 2))
        .catch(error => console.error('Failed to persist server logs:', error));
    } catch (error) {
      console.error('Error persisting server logs:', error);
    }
  }

  broadcastToViewers(message) {
    const messageStr = JSON.stringify(message);
    
    this.connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        // Check if viewer is subscribed to this type of message
        if (this.shouldSendToViewer(ws, message)) {
          ws.send(messageStr);
        }
      }
    });
  }

  shouldSendToViewer(ws, message) {
    if (!ws.subscriptions) return true;

    const { subscriptions } = ws.subscriptions;

    if (message.type === 'new_log') {
      const log = message.data;
      
      // Check source filter
      if (subscriptions.sources && !subscriptions.sources.includes(log.sourceId)) {
        return false;
      }
      
      // Check level filter
      if (subscriptions.levels && !subscriptions.levels.includes(log.level)) {
        return false;
      }
    }

    return true;
  }

  // Initialize database connection and load data
  async initializeDatabase() {
    try {
      await this.db.initialize();
      await this.loadPersistedData();
    } catch (error) {
      console.error('Database initialization failed:', error);
      // Fallback to file-based storage if database fails
      console.log('📂 Falling back to file-based storage');
      await this.loadPersistedData();
    }
  }

  async loadPersistedData() {
    if (!this.config.enablePersistence) return;

    try {
      // Try database first
      this.logs = await this.db.loadLogs();
      this.monitoringData = await this.db.loadMonitoringData();
      this.sources = await this.db.loadSources();
      
      // Rebuild indexes for in-memory operations
      this.rebuildLogIndexes();
      this.rebuildMonitoringIndexes();
      
      console.log(`📂 Loaded ${this.logs.length} logs, ${this.monitoringData.length} monitoring entries, and ${this.sources.size} sources from database`);
    } catch (error) {
      console.error('Database load failed, trying file fallback:', error);
      
      // Fallback to file-based loading
      try {
        const data = await fs.readFile(this.config.persistenceFile, 'utf8');
        const parsed = JSON.parse(data);
        
        this.logs = parsed.logs || [];
        this.monitoringData = parsed.monitoringData || [];
        this.sources = new Map(parsed.sources || []);
        
        // Rebuild indexes
        this.rebuildLogIndexes();
        this.rebuildMonitoringIndexes();
        
        console.log(`📂 Loaded ${this.logs.length} logs and ${this.sources.size} sources from persistence file`);
      } catch (fileError) {
        if (fileError.code !== 'ENOENT') {
          console.error('Error loading persisted data:', fileError);
        }
      }
    }
  }

  async persistData() {
    if (!this.config.enablePersistence) return;

    try {
      // Try database first
      await this.db.saveLogs(this.logs);
      await this.db.saveMonitoringData(this.monitoringData);
      await this.db.saveSources(this.sources);
    } catch (error) {
      console.error('Database persist failed, using file fallback:', error);
      
      // Fallback to file-based persistence
      try {
        const data = {
          logs: this.logs,
          monitoringData: this.monitoringData,
          sources: Array.from(this.sources.entries()),
          timestamp: new Date().toISOString()
        };

        await fs.writeFile(this.config.persistenceFile, JSON.stringify(data, null, 2));
      } catch (fileError) {
        console.error('Failed to persist to file:', fileError);
      }
    }
  }

  convertToCSV(logs) {
    const headers = ['Time', 'Level', 'Source', 'Message', 'Data', 'File', 'Line'];
    const rows = logs.map(log => [
      log.time,
      log.level,
      log.sourceId,
      log.message,
      log.data ? JSON.stringify(log.data) : '',
      log.file || '',
      log.line || ''
    ]);

    return [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
  }

  start() {
    const port = this.config.port;
    
    if (this.config.enableWebSocket) {
      this.server.listen(port, () => {
        const messages = config.getStartupMessages(port, this.config.viewerPort);
        
        // Log startup as structured log
        const startupLog = {
          id: this.generateLogId(),
          timestamp: new Date().toISOString(),
          level: 'info',
          scriptId: 'server',
          sourceId: 'server',
          sourceType: 'server_startup',
          message: 'Allog Intermediary Server started successfully',
          data: {
            port: port,
            viewerPort: this.config.viewerPort,
            config: {
              maxLogs: this.config.maxLogs,
              enableWebSocket: this.config.enableWebSocket,
              enablePersistence: this.config.enablePersistence
            }
          }
        };
        
        this.addServerLog(startupLog);
        
        console.log(messages.server);
        console.log(messages.websocket);
        console.log(messages.api);
        console.log(messages.viewer);
      });
    } else {
      this.app.listen(port, () => {
        const messages = config.getStartupMessages(port, this.config.viewerPort);
        
        // Log startup as structured log
        const startupLog = {
          id: this.generateLogId(),
          timestamp: new Date().toISOString(),
          level: 'info',
          scriptId: 'server',
          sourceId: 'server',
          sourceType: 'server_startup',
          message: 'Allog Intermediary Server started successfully',
          data: {
            port: port,
            viewerPort: this.config.viewerPort,
            config: {
              maxLogs: this.config.maxLogs,
              enableWebSocket: this.config.enableWebSocket,
              enablePersistence: this.config.enablePersistence
            }
          }
        };
        
        this.addServerLog(startupLog);
        
        console.log(messages.server);
        console.log(messages.api);
        console.log(messages.viewer);
      });
    }
  }

  stop() {
    // Log shutdown as structured log
    const shutdownLog = {
      id: this.generateLogId(),
      timestamp: new Date().toISOString(),
      level: 'info',
      scriptId: 'server',
      sourceId: 'server',
      sourceType: 'server_shutdown',
      message: 'Allog Intermediary Server shutting down',
      data: {
        uptime: Date.now() - (this.startTime || Date.now()),
        logsCount: this.logs?.length || 0,
        sourcesCount: this.sources?.size || 0,
        connectionsCount: this.connections?.size || 0
      }
    };
    
    this.addServerLog(shutdownLog);
    
    if (this.server) {
      this.server.close();
    }
    console.log('Allog Intermediary Server stopped');

    // Stop monitoring systems
    if (this.metricsCollector) {
      this.metricsCollector.stopCollection();
      console.log('Metrics collection stopped');
    }

    if (this.healthChecker) {
      this.healthChecker.stop();
      console.log('Health checker stopped');
    }
  }

  // Discover active modules from received logs and source registrations
  discoverActiveModules() {
    const modules = {};
    const uniqueScripts = new Set();
    
    // Analyze logs to discover active modules
    this.logs.forEach(log => {
      const scriptId = log.scriptId || log.sourceId || 'unknown';
      uniqueScripts.add(scriptId);
      
      // Parse module name from scriptId (e.g., 'lib/allog' -> 'allog')
      const moduleName = this.parseModuleName(scriptId);
      
      if (!modules[moduleName]) {
        modules[moduleName] = {
          name: moduleName,
          scriptId: scriptId,
          type: this.inferModuleType(scriptId),
          enabled: true,
          level: config.defaultInstrumentationLevel,
          methods: this.discoverModuleMethods(scriptId),
          lastSeen: log.time || log.timestamp,
          logCount: 0,
          status: 'active'
        };
      }
      
      modules[moduleName].logCount++;
      // Update last seen time
      const logTime = new Date(log.time || log.timestamp);
      const lastSeen = new Date(modules[moduleName].lastSeen);
      if (logTime > lastSeen) {
        modules[moduleName].lastSeen = log.time || log.timestamp;
      }
    });
    
    // Add registered sources that might not have logs yet
    this.sources.forEach(source => {
      const moduleName = this.parseModuleName(source.id);
      if (!modules[moduleName]) {
        modules[moduleName] = {
          name: moduleName,
          scriptId: source.id,
          type: this.inferModuleType(source.id),
          enabled: true,
          level: config.defaultInstrumentationLevel,
          methods: [],
          lastSeen: source.lastSeen || new Date().toISOString(),
          logCount: 0,
          status: 'registered'
        };
      }
    });
    
    return modules;
  }
  
  parseModuleName(scriptId) {
    if (!scriptId) return 'unknown';
    
    // Handle different patterns:
    // 'lib/allog' -> 'allog'
    // 'features/FormHub' -> 'FormHub'
    // 'allog-engine' -> 'allog-engine'
    // 'formwise-app' -> 'formwise-app'
    
    if (scriptId.includes('/')) {
      const parts = scriptId.split('/');
      return parts[parts.length - 1]; // Get the last part
    }
    
    return scriptId;
  }
  
  inferModuleType(scriptId) {
    if (!scriptId) return 'unknown';
    
    if (scriptId.startsWith('lib/')) return 'library';
    if (scriptId.startsWith('features/')) return 'feature';
    if (scriptId.includes('allog')) return 'allog-system';
    if (scriptId.includes('server')) return 'server';
    if (scriptId.includes('viewer')) return 'viewer';
    if (scriptId.includes('app')) return 'application';
    
    return 'component';
  }
  
  discoverModuleMethods(scriptId) {
    // Analyze logs from this script to discover methods
    const methods = new Set();
    
    this.logs
      .filter(log => (log.scriptId || log.sourceId) === scriptId)
      .forEach(log => {
        // Look for method calls in log data
        if (log.data && typeof log.data === 'object') {
          if (log.data.method) methods.add(log.data.method);
          if (log.data.function) methods.add(log.data.function);
          if (log.data.methodName) methods.add(log.data.methodName);
        }
        
        // Parse method names from log messages
        const methodMatch = log.message.match(/(\w+)\s*\(/);
        if (methodMatch) {
          methods.add(methodMatch[1]);
        }
      });
    
    return Array.from(methods);
  }
  
  calculateModuleStats(modules) {
    const moduleCount = Object.keys(modules).length;
    let totalMethods = 0;
    
    Object.values(modules).forEach(module => {
      totalMethods += module.methods.length;
    });
    
    return {
      scripts: moduleCount,
      variables: moduleCount * 5, // Estimate
      states: moduleCount * 3, // Estimate  
      functions: totalMethods,
      properties: moduleCount * 4, // Estimate
      events: moduleCount * 2 // Estimate
    };
  }

  // Create a standardized monitoring entry
  createMonitoringEntry(data) {
    const { moduleId, scriptId, type, name, value, previousValue, metadata, sourceId } = data;
    
    return {
      id: `monitoring-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      moduleId: moduleId.toString(),
      scriptId: scriptId.toString(),
      type,
      name: name.toString(),
      value,
      previousValue,
      timestamp: Date.now(),
      time: new Date().toISOString(),
      sourceId: sourceId || 'unknown',
      metadata: metadata || {}
    };
  }

  // Add monitoring entry with storage management and broadcasting
  async addMonitoringEntry(entry) {
    // Add to monitoring data array
    this.monitoringData.push(entry);
    
    // Add to indexes for fast retrieval
    this.addMonitoringToIndexes(entry);

    // Maintain max monitoring data limit (default to maxLogs * 2 for more detailed tracking)
    const maxMonitoringEntries = this.config.maxMonitoringEntries || (this.config.maxLogs * 2);
    if (this.monitoringData.length > maxMonitoringEntries) {
      this.monitoringData.shift();
      // Note: Indexes will be cleaned up during next memory optimization cycle
    }

    // Update source statistics
    if (this.sources.has(entry.sourceId)) {
      const source = this.sources.get(entry.sourceId);
      source.lastSeen = new Date().toISOString();
      source.monitoringCount = (source.monitoringCount || 0) + 1;
    }

    // Broadcast to WebSocket viewers
    this.broadcastToViewers({
      type: 'monitoring_update',
      data: entry
    });

    // Broadcast to SSE monitoring clients
    this.broadcastToSSEMonitoringClients(entry, 'monitoring');

    // Persist data if enabled
    if (this.config.enablePersistence) {
      // Try direct database insert for performance
      try {
        await this.db.addMonitoringEntry(entry);
      } catch (error) {
        // Fallback to full persist
        this.persistData();
      }
    }
  }

  // Organize monitoring data into structured format for viewer
  organizeMonitoringData() {
    const modules = {};
    
    this.monitoringData.forEach(entry => {
      // Initialize module if it doesn't exist
      if (!modules[entry.moduleId]) {
        modules[entry.moduleId] = { 
          moduleId: entry.moduleId,
          scripts: {},
          lastUpdate: 0
        };
      }
      
      // Initialize script if it doesn't exist
      if (!modules[entry.moduleId].scripts[entry.scriptId]) {
        modules[entry.moduleId].scripts[entry.scriptId] = {
          variables: {},
          states: {},
          functions: {},
          properties: {},
          events: {},
          lastUpdate: 0
        };
      }
      
      const script = modules[entry.moduleId].scripts[entry.scriptId];
      const typePlural = entry.type + 's'; // variable -> variables, state -> states, etc.
      
      // Ensure the type category exists
      if (!script[typePlural]) {
        script[typePlural] = {};
      }
      
      // Store the monitoring entry by name, keeping the latest one
      if (!script[typePlural][entry.name] || 
          script[typePlural][entry.name].timestamp < entry.timestamp) {
        script[typePlural][entry.name] = entry;
        script.lastUpdate = Math.max(script.lastUpdate, entry.timestamp);
        modules[entry.moduleId].lastUpdate = Math.max(modules[entry.moduleId].lastUpdate, entry.timestamp);
      }
    });
    
    return modules;
  }

  // Calculate real monitoring statistics from actual data
    calculateRealMonitoringStats(structuredData) {
    let totalModules = 0;
    let totalScripts = 0;
    let totalVariables = 0;
    let totalStates = 0;
    let totalFunctions = 0;
    let totalProperties = 0;
    let totalEvents = 0;

    Object.keys(structuredData).forEach(moduleId => {
      totalModules++;
      const module = structuredData[moduleId];
      
      Object.keys(module.scripts).forEach(scriptId => {
        totalScripts++;
        const script = module.scripts[scriptId];
        
        totalVariables += Object.keys(script.variables || {}).length;
        totalStates += Object.keys(script.states || {}).length;
        totalFunctions += Object.keys(script.functions || {}).length;
        totalProperties += Object.keys(script.properties || {}).length;
        totalEvents += Object.keys(script.events || {}).length;
      });
    });

    return {
      totalModules,
      totalScripts,
      totalVariables,
      totalStates,
      totalFunctions,
      totalProperties,
      totalEvents,
      totalEntries: this.monitoringData.length,
      lastUpdate: new Date().toISOString()
    };
  }

  // === CSV CONVERSION HELPERS ===

  convertLogsToCSV(logs) {
    if (logs.length === 0) return 'No logs to export';

    // CSV headers
    const headers = [
      'timestamp', 'id', 'level', 'message', 'sourceId', 'scriptId', 
      'data', 'imageUrl', 'serverTime'
    ];

    // Convert logs to CSV rows
    const rows = logs.map(log => {
      return headers.map(header => {
        let value = log[header];
        
        // Handle special cases
        if (header === 'data' && typeof value === 'object') {
          value = JSON.stringify(value);
        }
        
        // Escape quotes and wrap in quotes if contains comma or newline
        if (typeof value === 'string') {
          value = value.replace(/"/g, '""'); // Escape quotes
          if (value.includes(',') || value.includes('\n') || value.includes('"')) {
            value = `"${value}"`;
          }
        }
        
        return value || '';
      });
    });

    // Combine headers and rows
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    return csvContent;
  }

  convertMonitoringToCSV(monitoringData) {
    if (monitoringData.length === 0) return 'No monitoring data to export';

    // CSV headers
    const headers = [
      'timestamp', 'id', 'moduleId', 'scriptId', 'type', 'name', 
      'value', 'previousValue', 'sourceId', 'metadata'
    ];

    // Convert monitoring data to CSV rows
    const rows = monitoringData.map(entry => {
      return headers.map(header => {
        let value = entry[header];
        
        // Handle special cases
        if ((header === 'value' || header === 'previousValue' || header === 'metadata') && typeof value === 'object') {
          value = JSON.stringify(value);
        }
        
        // Escape quotes and wrap in quotes if contains comma or newline
        if (typeof value === 'string') {
          value = value.replace(/"/g, '""'); // Escape quotes
          if (value.includes(',') || value.includes('\n') || value.includes('"')) {
            value = `"${value}"`;
          }
        }
        
        return value || '';
      });
    });

    // Combine headers and rows
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    return csvContent;
  }

  // === DATA MANAGEMENT OPTIMIZATIONS ===

  // Start memory optimization background process
  startMemoryOptimization() {
    if (!this.memoryOptimizationEnabled) return;

    // Run cleanup every cleanupInterval
    setInterval(() => {
      this.performMemoryCleanup();
    }, this.cleanupInterval);

    console.log(`✅ Memory optimization enabled (cleanup every ${this.cleanupInterval/1000}s)`);
  }

  // Perform memory cleanup
  performMemoryCleanup() {
    const before = {
      logs: this.logs.length,
      monitoring: this.monitoringData.length,
      sources: this.sources.size
    };

    try {
      // Clean up old logs beyond retention limit
      this.cleanupOldLogs();
      
      // Clean up old monitoring data
      this.cleanupOldMonitoringData();
      
      // Clean up inactive sources
      this.cleanupInactiveSources();
      
      // Rebuild indexes if needed
      this.optimizeIndexes();
      
      const after = {
        logs: this.logs.length,
        monitoring: this.monitoringData.length,
        sources: this.sources.size
      };

      console.log(`🧹 Memory cleanup completed:`, {
        logs: `${before.logs} → ${after.logs}`,
        monitoring: `${before.monitoring} → ${after.monitoring}`,
        sources: `${before.sources} → ${after.sources}`
      });

      this.lastCleanup = Date.now();
    } catch (error) {
      console.error('Memory cleanup failed:', error);
    }
  }

  // Clean up old logs based on retention policy
  cleanupOldLogs() {
    const retentionHours = this.config.logRetentionHours || 24;
    const cutoffTime = Date.now() - (retentionHours * 60 * 60 * 1000);
    
    const initialCount = this.logs.length;
    this.logs = this.logs.filter(log => {
      const logTime = new Date(log.timestamp).getTime();
      return logTime > cutoffTime;
    });
    
    // Rebuild log indexes after cleanup
    if (this.logs.length !== initialCount) {
      this.rebuildLogIndexes();
    }
  }

  // Clean up old monitoring data
  cleanupOldMonitoringData() {
    const retentionHours = this.config.monitoringRetentionHours || 48;
    const cutoffTime = Date.now() - (retentionHours * 60 * 60 * 1000);
    
    const initialCount = this.monitoringData.length;
    this.monitoringData = this.monitoringData.filter(entry => {
      return entry.timestamp > cutoffTime;
    });
    
    // Rebuild monitoring indexes after cleanup
    if (this.monitoringData.length !== initialCount) {
      this.rebuildMonitoringIndexes();
    }
  }

  // Clean up inactive sources
  cleanupInactiveSources() {
    const inactiveThresholdHours = this.config.sourceInactiveThresholdHours || 12;
    const cutoffTime = Date.now() - (inactiveThresholdHours * 60 * 60 * 1000);
    
    for (const [sourceId, sourceData] of this.sources.entries()) {
      const lastSeen = new Date(sourceData.lastSeen || sourceData.connectedAt).getTime();
      if (lastSeen < cutoffTime) {
        this.sources.delete(sourceId);
        console.log(`🗑️ Removed inactive source: ${sourceId}`);
      }
    }
  }

  // Optimize indexes by rebuilding if fragmented
  optimizeIndexes() {
    const logIndexSize = this.logIndexes.byTimeRange.length;
    const monitoringIndexSize = this.monitoringIndexes.byTimeRange.length;
    
    // Rebuild if indexes are significantly different from actual data size
    if (Math.abs(logIndexSize - this.logs.length) > 100) {
      this.rebuildLogIndexes();
    }
    
    if (Math.abs(monitoringIndexSize - this.monitoringData.length) > 100) {
      this.rebuildMonitoringIndexes();
    }
  }

  // Add log entry to indexes
  addLogToIndexes(logEntry) {
    // Index by sourceId
    if (!this.logIndexes.bySourceId.has(logEntry.sourceId)) {
      this.logIndexes.bySourceId.set(logEntry.sourceId, []);
    }
    this.logIndexes.bySourceId.get(logEntry.sourceId).push(logEntry);

    // Index by level
    if (!this.logIndexes.byLevel.has(logEntry.level)) {
      this.logIndexes.byLevel.set(logEntry.level, []);
    }
    this.logIndexes.byLevel.get(logEntry.level).push(logEntry);

    // Index by scriptId
    if (logEntry.scriptId) {
      if (!this.logIndexes.byScriptId.has(logEntry.scriptId)) {
        this.logIndexes.byScriptId.set(logEntry.scriptId, []);
      }
      this.logIndexes.byScriptId.get(logEntry.scriptId).push(logEntry);
    }

    // Index by ID
    this.logIndexes.byId.set(logEntry.id, logEntry);

    // Add to time-sorted index (maintain sort order)
    this.insertSortedByTime(this.logIndexes.byTimeRange, logEntry);
  }

  // Add monitoring entry to indexes
  addMonitoringToIndexes(entry) {
    // Index by moduleId
    if (!this.monitoringIndexes.byModuleId.has(entry.moduleId)) {
      this.monitoringIndexes.byModuleId.set(entry.moduleId, []);
    }
    this.monitoringIndexes.byModuleId.get(entry.moduleId).push(entry);

    // Index by scriptId
    if (!this.monitoringIndexes.byScriptId.has(entry.scriptId)) {
      this.monitoringIndexes.byScriptId.set(entry.scriptId, []);
    }
    this.monitoringIndexes.byScriptId.get(entry.scriptId).push(entry);

    // Index by type
    if (!this.monitoringIndexes.byType.has(entry.type)) {
      this.monitoringIndexes.byType.set(entry.type, []);
    }
    this.monitoringIndexes.byType.get(entry.type).push(entry);

    // Index by name
    if (!this.monitoringIndexes.byName.has(entry.name)) {
      this.monitoringIndexes.byName.set(entry.name, []);
    }
    this.monitoringIndexes.byName.get(entry.name).push(entry);

    // Index by ID
    this.monitoringIndexes.byId.set(entry.id, entry);

    // Add to time-sorted index
    this.insertSortedByTime(this.monitoringIndexes.byTimeRange, entry);
  }

  // Insert item into time-sorted array maintaining order
  insertSortedByTime(sortedArray, item) {
    const timestamp = item.timestamp || Date.now();
    
    // Binary search for insertion point
    let left = 0;
    let right = sortedArray.length;
    
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const midTimestamp = sortedArray[mid].timestamp || Date.now();
      
      if (midTimestamp < timestamp) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    
    sortedArray.splice(left, 0, item);
  }

  // Rebuild all log indexes
  rebuildLogIndexes() {
    // Clear all indexes
    this.logIndexes = {
      bySourceId: new Map(),
      byLevel: new Map(), 
      byScriptId: new Map(),
      byTimeRange: [],
      byId: new Map()
    };

    // Rebuild from current logs
    this.logs.forEach(log => this.addLogToIndexes(log));
    
    console.log(`🔄 Rebuilt log indexes (${this.logs.length} entries)`);
  }

  // Rebuild all monitoring indexes
  rebuildMonitoringIndexes() {
    // Clear all indexes
    this.monitoringIndexes = {
      byModuleId: new Map(),
      byScriptId: new Map(),
      byType: new Map(),
      byName: new Map(),
      byTimeRange: [],
      byId: new Map()
    };

    // Rebuild from current monitoring data
    this.monitoringData.forEach(entry => this.addMonitoringToIndexes(entry));
    
    console.log(`🔄 Rebuilt monitoring indexes (${this.monitoringData.length} entries)`);
  }

  // Fast log lookup methods using indexes
  getLogsBySourceId(sourceId) {
    return this.logIndexes.bySourceId.get(sourceId) || [];
  }

  getLogsByLevel(level) {
    return this.logIndexes.byLevel.get(level) || [];
  }

  getLogsByScriptId(scriptId) {
    return this.logIndexes.byScriptId.get(scriptId) || [];
  }

  getLogsByTimeRange(startTime, endTime) {
    // Use binary search on sorted array for efficient range queries
    const startIndex = this.findTimeIndex(this.logIndexes.byTimeRange, startTime, 'start');
    const endIndex = this.findTimeIndex(this.logIndexes.byTimeRange, endTime, 'end');
    
    return this.logIndexes.byTimeRange.slice(startIndex, endIndex + 1);
  }

  // Fast monitoring lookup methods using indexes
  getMonitoringByModuleId(moduleId) {
    return this.monitoringIndexes.byModuleId.get(moduleId) || [];
  }

  getMonitoringByType(type) {
    return this.monitoringIndexes.byType.get(type) || [];
  }

  getMonitoringByTimeRange(startTime, endTime) {
    const startIndex = this.findTimeIndex(this.monitoringIndexes.byTimeRange, startTime, 'start');
    const endIndex = this.findTimeIndex(this.monitoringIndexes.byTimeRange, endTime, 'end');
    
    return this.monitoringIndexes.byTimeRange.slice(startIndex, endIndex + 1);
  }

  // Binary search helper for time-based range queries
  findTimeIndex(sortedArray, targetTime, type) {
    let left = 0;
    let right = sortedArray.length - 1;
    let result = type === 'start' ? sortedArray.length : -1;
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const midTime = sortedArray[mid].timestamp || Date.now();
      
      if (type === 'start') {
        if (midTime >= targetTime) {
          result = mid;
          right = mid - 1;
        } else {
          left = mid + 1;
        }
      } else { // 'end'
        if (midTime <= targetTime) {
          result = mid;
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }
    }
    
    return Math.max(0, result);
  }

  // === SSE STREAMING HELPERS ===

  // Filter logs for SSE client based on their subscription
  filterLogsForClient(logs, filters) {
    if (!filters) return logs;

    return logs.filter(log => {
      // Filter by sourceId
      if (filters.sourceId && log.sourceId !== filters.sourceId) {
        return false;
      }

      // Filter by level
      if (filters.level && Array.isArray(filters.level) && !filters.level.includes(log.level)) {
        return false;
      }

      // Filter by scriptId
      if (filters.scriptId && log.scriptId !== filters.scriptId) {
        return false;
      }

      return true;
    });
  }

  // Filter monitoring data for SSE client
  filterMonitoringForClient(entries, filters) {
    if (!filters) return entries;

    return entries.filter(entry => {
      // Filter by moduleId
      if (filters.moduleId && entry.moduleId !== filters.moduleId) {
        return false;
      }

      // Filter by scriptId
      if (filters.scriptId && entry.scriptId !== filters.scriptId) {
        return false;
      }

      // Filter by type
      if (filters.type && Array.isArray(filters.type) && !filters.type.includes(entry.type)) {
        return false;
      }

      return true;
    });
  }

  // Broadcast to SSE clients
  broadcastToSSEClients(data, type = 'log') {
    if (!this.sseClients || this.sseClients.size === 0) return;

    const message = { type, data, timestamp: new Date().toISOString() };
    const messageStr = `data: ${JSON.stringify(message)}\n\n`;

    // Remove disconnected clients and send to active ones
    const clientsToRemove = [];

    this.sseClients.forEach(client => {
      try {
        // Check if log matches client filters
        const filteredData = this.filterLogsForClient([data], client.filters);
        
        if (filteredData.length > 0) {
          client.response.write(messageStr);
        }
      } catch (error) {
        // Client disconnected, mark for removal
        clientsToRemove.push(client);
      }
    });

    // Clean up disconnected clients
    clientsToRemove.forEach(client => {
      this.sseClients.delete(client);
    });
  }

  // Broadcast to SSE monitoring clients
  broadcastToSSEMonitoringClients(data, type = 'monitoring') {
    if (!this.sseMonitoringClients || this.sseMonitoringClients.size === 0) return;

    const message = { type, data, timestamp: new Date().toISOString() };
    const messageStr = `data: ${JSON.stringify(message)}\n\n`;

    // Remove disconnected clients and send to active ones
    const clientsToRemove = [];

    this.sseMonitoringClients.forEach(client => {
      try {
        // Check if monitoring entry matches client filters
        const filteredData = this.filterMonitoringForClient([data], client.filters);
        
        if (filteredData.length > 0) {
          client.response.write(messageStr);
        }
      } catch (error) {
        // Client disconnected, mark for removal
        clientsToRemove.push(client);
      }
    });

    // Clean up disconnected clients
    clientsToRemove.forEach(client => {
      this.sseMonitoringClients.delete(client);
    });
  }

  // === LOG ROTATION & ARCHIVING ===

  // Start log rotation background process
  startLogRotation() {
    if (!this.rotationEnabled) return;

    // Ensure archive directory exists
    this.ensureArchiveDirectory();

    // Check rotation every hour
    setInterval(() => {
      this.checkAndPerformRotation();
    }, 3600000); // 1 hour

    console.log(`📁 Log rotation enabled (${this.rotationInterval} rotation to ${this.archiveDirectory})`);
  }

  // Ensure archive directory exists
  async ensureArchiveDirectory() {
    const fs = require('fs').promises;
    try {
      await fs.access(this.archiveDirectory);
    } catch (error) {
      // Directory doesn't exist, create it
      await fs.mkdir(this.archiveDirectory, { recursive: true });
      console.log(`📁 Created archive directory: ${this.archiveDirectory}`);
    }
  }

  // Check if rotation should occur and perform it
  async checkAndPerformRotation() {
    try {
      const shouldRotate = this.shouldPerformRotation();
      
      if (shouldRotate) {
        await this.performLogRotation();
        this.lastRotation = Date.now();
      }
    } catch (error) {
      console.error('Log rotation check failed:', error);
    }
  }

  // Determine if rotation should occur
  shouldPerformRotation() {
    const now = Date.now();
    const timeSinceLastRotation = now - this.lastRotation;

    // Check time-based rotation
    switch (this.rotationInterval) {
      case 'hourly':
        return timeSinceLastRotation > 3600000; // 1 hour
      case 'daily':
        return timeSinceLastRotation > 86400000; // 24 hours
      case 'weekly':
        return timeSinceLastRotation > 604800000; // 7 days
      case 'monthly':
        return timeSinceLastRotation > 2592000000; // 30 days
      default:
        return false;
    }
  }

  // Perform log rotation
  async performLogRotation() {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      // Create archive filename with timestamp
      const timestamp = this.getRotationTimestamp();
      const archiveFilename = `allog-archive-${timestamp}.json`;
      const archivePath = path.join(this.archiveDirectory, archiveFilename);

      // Prepare archive data
      const archiveData = {
        metadata: {
          archivedAt: new Date().toISOString(),
          rotationInterval: this.rotationInterval,
          version: 'allog-archive-v1',
          originalLogCount: this.logs.length,
          originalMonitoringCount: this.monitoringData.length
        },
        logs: [...this.logs],
        monitoringData: [...this.monitoringData],
        sources: Array.from(this.sources.entries())
      };

      // Compress if enabled
      let archiveContent;
      if (this.config.compressionEnabled) {
        archiveContent = await this.compressArchiveData(archiveData);
      } else {
        archiveContent = JSON.stringify(archiveData, null, 2);
      }

      // Write archive file
      await fs.writeFile(archivePath, archiveContent);

      // Clear current logs and monitoring data
      const archivedLogs = this.logs.length;
      const archivedMonitoring = this.monitoringData.length;
      
      this.logs = [];
      this.monitoringData = [];
      
      // Rebuild indexes
      this.rebuildLogIndexes();
      this.rebuildMonitoringIndexes();

      // Clean up old archive files
      await this.cleanupOldArchives();

      console.log(`📁 Log rotation completed: ${archivedLogs} logs, ${archivedMonitoring} monitoring entries → ${archiveFilename}`);

      // Persist the now-empty current data
      if (this.config.enablePersistence) {
        this.persistData();
      }

    } catch (error) {
      console.error('Log rotation failed:', error);
      throw error;
    }
  }

  // Generate timestamp for rotation filename
  getRotationTimestamp() {
    const now = new Date();
    
    switch (this.rotationInterval) {
      case 'hourly':
        return now.toISOString().slice(0, 13).replace(/[-:]/g, '') + 'H';
      case 'daily':
        return now.toISOString().slice(0, 10).replace(/-/g, '');
      case 'weekly':
        const year = now.getFullYear();
        const week = this.getWeekNumber(now);
        return `${year}W${week.toString().padStart(2, '0')}`;
      case 'monthly':
        return now.toISOString().slice(0, 7).replace('-', '');
      default:
        return now.toISOString().slice(0, 19).replace(/[-:]/g, '');
    }
  }

  // Get ISO week number
  getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  // Compress archive data
  async compressArchiveData(data) {
    // Simple JSON compression - could be enhanced with gzip
    return JSON.stringify(data);
  }

  // Clean up old archive files
  async cleanupOldArchives() {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      const maxArchiveFiles = this.config.maxArchiveFiles || 30;
      const files = await fs.readdir(this.archiveDirectory);
      
      // Filter archive files and sort by date
      const archiveFiles = files
        .filter(file => file.startsWith('allog-archive-') && file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(this.archiveDirectory, file),
          stats: null
        }));

      // Get file stats for sorting
      for (const file of archiveFiles) {
        try {
          file.stats = await fs.stat(file.path);
        } catch (error) {
          console.warn(`Could not stat archive file: ${file.name}`);
        }
      }

      // Sort by creation time (oldest first)
      archiveFiles.sort((a, b) => {
        if (!a.stats || !b.stats) return 0;
        return a.stats.ctime - b.stats.ctime;
      });

      // Remove excess files
      if (archiveFiles.length > maxArchiveFiles) {
        const filesToRemove = archiveFiles.slice(0, archiveFiles.length - maxArchiveFiles);
        
        for (const file of filesToRemove) {
          try {
            await fs.unlink(file.path);
            console.log(`📁 Removed old archive: ${file.name}`);
          } catch (error) {
            console.warn(`Could not remove archive file: ${file.name}`, error);
          }
        }
      }

    } catch (error) {
      console.error('Archive cleanup failed:', error);
    }
  }

  // Manual rotation trigger (for testing or admin use)
  async triggerManualRotation() {
    console.log('📁 Manual log rotation triggered');
    await this.performLogRotation();
    return {
      success: true,
      rotatedAt: new Date().toISOString(),
      archiveDirectory: this.archiveDirectory
    };
  }

  // Get archive information
  async getArchiveInfo() {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      const files = await fs.readdir(this.archiveDirectory);
      const archiveFiles = [];
      
      for (const file of files) {
        if (file.startsWith('allog-archive-') && file.endsWith('.json')) {
          const filePath = path.join(this.archiveDirectory, file);
          const stats = await fs.stat(filePath);
          
          archiveFiles.push({
            filename: file,
            size: stats.size,
            created: stats.ctime,
            modified: stats.mtime,
            sizeFormatted: this.formatFileSize(stats.size)
          });
        }
      }
      
      return {
        archiveDirectory: this.archiveDirectory,
        totalArchives: archiveFiles.length,
        archives: archiveFiles.sort((a, b) => b.created - a.created),
        totalSize: archiveFiles.reduce((sum, file) => sum + file.size, 0)
      };
      
    } catch (error) {
      console.error('Failed to get archive info:', error);
      return { error: error.message };
    }
  }

  // Format file size for display
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Generate unique log ID
  generateLogId() {
    return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// CLI support
if (require.main === module) {
  const cliConfig = config.getCLIConfig();

  const server = new AllogIntermediaryServer(cliConfig);
  server.start();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log(config.getShutdownMessage());
    if (server.db) {
      await server.db.close();
    }
    server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log(config.getShutdownMessage());
    if (server.db) {
      await server.db.close();
    }
    server.stop();
    process.exit(0);
  });
}

module.exports = AllogIntermediaryServer;
