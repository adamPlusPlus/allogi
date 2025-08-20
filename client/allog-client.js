/**
 * Allog Client Library
 * 
 * A universal client library that any application can use to send
 * Allog formatted data to the intermediary server. This library
 * supports multiple transport protocols and provides a simple API
 * for cross-platform logging.
 * 
 * Features:
 * - HTTP and WebSocket transport
 * - Automatic reconnection
 * - Batch sending
 * - Rate limiting
 * - Error handling
 * - Cross-platform compatibility
 */

class AllogClient {
  constructor(config = {}) {
    this.config = {
      serverUrl: config.serverUrl || 'http://localhost:3002',
      sourceId: config.sourceId || 'unknown',
      sourceType: config.sourceType || 'unknown',
      sourceVersion: config.sourceVersion || '1.0.0',
      enableWebSocket: config.enableWebSocket !== false,
      batchSize: config.batchSize || 10,
      batchInterval: config.batchInterval || 1000, // ms
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000, // ms
      ...config
    };

    this.pendingLogs = [];
    this.isConnected = false;
    this.retryCount = 0;
    this.batchTimer = null;
    this.ws = null;
    this.registered = false;

    // Initialize
    this.init();
  }

  async init() {
    try {
      // Register with the server
      await this.register();
      
      // Start batch processing
      this.startBatchProcessing();
      
      // Connect WebSocket if enabled
      if (this.config.enableWebSocket) {
        this.connectWebSocket();
      }
    } catch (error) {
      console.warn('AllogClient initialization failed:', error);
    }
  }

  async register() {
    try {
      const response = await fetch(`${this.config.serverUrl}/api/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Source-ID': this.config.sourceId
        },
        body: JSON.stringify({
          sourceId: this.config.sourceId,
          sourceType: this.config.sourceType,
          sourceVersion: this.config.sourceVersion,
          metadata: {
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
            platform: typeof process !== 'undefined' ? process.platform : 'unknown',
            timestamp: new Date().toISOString()
          }
        })
      });

      if (response.ok) {
        this.registered = true;
        console.log('AllogClient registered successfully');
      } else {
        throw new Error(`Registration failed: ${response.status}`);
      }
    } catch (error) {
      console.warn('AllogClient registration failed:', error);
      throw error;
    }
  }

  connectWebSocket() {
    try {
      const wsUrl = this.config.serverUrl.replace('http', 'ws');
      // Ensure WebSocket exists in Node environments
      if (typeof WebSocket === 'undefined' && typeof require !== 'undefined') {
        try { global.WebSocket = require('ws'); } catch (error) {
          console.warn('[AllogClient] Failed to load WebSocket polyfill:', error);
        }
      }
      if (typeof WebSocket === 'undefined') {
        // Fallback: disable WS if not available
        return;
      }
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.retryCount = 0;
        console.log('AllogClient WebSocket connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleWebSocketMessage(message);
        } catch (error) {
          console.warn('AllogClient WebSocket message error:', error);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        console.log('AllogClient WebSocket disconnected');
        
        // Attempt to reconnect
        setTimeout(() => {
          if (this.config.enableWebSocket) {
            this.connectWebSocket();
          }
        }, this.config.retryDelay);
      };

      this.ws.onerror = (error) => {
        console.warn('AllogClient WebSocket error:', error);
      };
    } catch (error) {
      console.warn('AllogClient WebSocket connection failed:', error);
    }
  }

  handleWebSocketMessage(message) {
    switch (message.type) {
      case 'connection_established':
        console.log('AllogClient WebSocket connection established');
        break;
      
      case 'pong':
        // Handle ping/pong for connection health
        break;
      
      default:
        console.log('AllogClient received message:', message.type);
    }
  }

  startBatchProcessing() {
    this.batchTimer = setInterval(() => {
      this.flushBatch();
    }, this.config.batchInterval);
  }

  async flushBatch() {
    if (this.pendingLogs.length === 0) return;

    const logsToSend = [...this.pendingLogs];
    this.pendingLogs = [];

    try {
      await this.sendBatch(logsToSend);
    } catch (error) {
      console.warn('AllogClient batch send failed:', error);
      
      // Re-add logs to pending queue
      this.pendingLogs.unshift(...logsToSend);
    }
  }

  async sendBatch(logs) {
    const response = await fetch(`${this.config.serverUrl}/api/logs/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Source-ID': this.config.sourceId
      },
      body: JSON.stringify({ logs })
    });

    if (!response.ok) {
      throw new Error(`Batch send failed: ${response.status}`);
    }

    return response.json();
  }

  async sendSingle(log) {
    const response = await fetch(`${this.config.serverUrl}/api/logs/single`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Source-ID': this.config.sourceId
      },
      body: JSON.stringify(log)
    });

    if (!response.ok) {
      throw new Error(`Single send failed: ${response.status}`);
    }

    return response.json();
  }

  // Public API methods
  log(message, level = 'info', data = null, options = {}) {
    const logEntry = {
      message,
      level,
      data,
      time: new Date().toISOString(),
      sourceType: this.config.sourceType,
      sourceVersion: this.config.sourceVersion,
      ...options
    };

    // Add to pending batch
    this.pendingLogs.push(logEntry);

    // Send immediately if batch is full
    if (this.pendingLogs.length >= this.config.batchSize) {
      this.flushBatch();
    }

    // Also send via WebSocket if available
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          type: 'log',
          data: logEntry
        }));
      } catch (error) {
        console.warn('AllogClient WebSocket send failed:', error);
      }
    }
  }

  info(message, data = null, options = {}) {
    this.log(message, 'info', data, options);
  }

  warn(message, data = null, options = {}) {
    this.log(message, 'warn', data, options);
  }

  error(message, data = null, options = {}) {
    this.log(message, 'error', data, options);
  }

  debug(message, data = null, options = {}) {
    this.log(message, 'debug', data, options);
  }

  // Utility methods
  async getStatus() {
    try {
      const response = await fetch(`${this.config.serverUrl}/api/status`);
      return response.json();
    } catch (error) {
      console.warn('AllogClient status check failed:', error);
      return null;
    }
  }

  async getLogs(options = {}) {
    try {
      const params = new URLSearchParams(options);
      const response = await fetch(`${this.config.serverUrl}/api/logs?${params}`);
      return response.json();
    } catch (error) {
      console.warn('AllogClient get logs failed:', error);
      return null;
    }
  }

  async clearLogs(sourceId = null) {
    try {
      const url = sourceId 
        ? `${this.config.serverUrl}/api/logs?sourceId=${sourceId}`
        : `${this.config.serverUrl}/api/logs`;
      
      const response = await fetch(url, { method: 'DELETE' });
      return response.json();
    } catch (error) {
      console.warn('AllogClient clear logs failed:', error);
      return null;
    }
  }

  async exportLogs(format = 'json', sourceId = null) {
    try {
      const params = new URLSearchParams({ format });
      if (sourceId) params.append('sourceId', sourceId);
      
      const response = await fetch(`${this.config.serverUrl}/api/export?${params}`);
      
      if (format === 'csv') {
        return response.text();
      } else {
        return response.json();
      }
    } catch (error) {
      console.warn('AllogClient export failed:', error);
      return null;
    }
  }

  // Cleanup
  destroy() {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Send any remaining logs
    this.flushBatch();
  }

  // Image helpers
  /**
   * Send a base64-encoded image to the intermediary server and create a log with an imageUrl
   * @param {string} imageBase64 - The base64 data (data URL or raw base64)
   * @param {object} options - { contentType, fileName, message, level, data }
   */
  async logImageBase64(imageBase64, options = {}) {
    const payload = {
      imageBase64,
      contentType: options.contentType || 'image/png',
      fileName: options.fileName,
      message: options.message || 'Image captured',
      level: options.level || 'info',
      data: options.data || {}
    };
    const res = await fetch(`${this.config.serverUrl}/api/logs/image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Source-ID': this.config.sourceId
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Image upload failed: ${res.status}`);
    return res.json();
  }

  /**
   * Node-only helper to send an image file path
   * @param {string} filePath
   * @param {object} options - { contentType, fileName, message, level, data }
   */
  async logImageFile(filePath, options = {}) {
    if (typeof require === 'undefined') throw new Error('logImageFile requires Node.js');
    const fs = require('fs');
    const path = require('path');
    const contentType = options.contentType || inferContentTypeFromExt(path.extname(filePath));
    const fileName = options.fileName || path.basename(filePath);
    const base64 = fs.readFileSync(filePath).toString('base64');
    return this.logImageBase64(`data:${contentType};base64,${base64}`, {
      ...options,
      contentType,
      fileName
    });
  }
}

function inferContentTypeFromExt(ext) {
  const e = (ext || '').toLowerCase();
  if (e === '.png') return 'image/png';
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
  if (e === '.gif') return 'image/gif';
  if (e === '.webp') return 'image/webp';
  if (e === '.bmp') return 'image/bmp';
  return 'application/octet-stream';
}

// Browser/Node.js compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AllogClient;
} else if (typeof window !== 'undefined') {
  window.AllogClient = AllogClient;
}

// Auto-initialization for browser (optional)
if (typeof window !== 'undefined' && !window.allogClient) {
  window.allogClient = new AllogClient({
    sourceId: 'browser-' + Math.random().toString(36).substr(2, 9),
    sourceType: 'web',
    sourceVersion: '1.0.0'
  });
}
