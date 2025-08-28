#!/usr/bin/env node

/**
 * Test Client for Allog Server
 * 
 * Demonstrates how to connect to the Allog server from another application
 */

const http = require('http');

class AllogTestClient {
  constructor(serverUrl = 'http://localhost:3002') {
    this.serverUrl = serverUrl;
    this.sourceId = 'test-client-' + Date.now();
  }

  /**
   * Send a structured log entry
   */
  async sendStructuredLog(message, level = 'info', additionalData = {}) {
    const logEntry = {
      message,
      level,
      scriptId: 'test-script',
      timestamp: new Date().toISOString(),
      ...additionalData
    };

    return this.sendRequest('/logs', 'POST', logEntry);
  }

  /**
   * Send a simple text log
   */
  async sendTextLog(message, level = 'info') {
    const logEntry = {
      text: message,
      level
    };

    return this.sendRequest('/logs', 'POST', logEntry);
  }

  /**
   * Send raw text as log
   */
  async sendRawLog(text) {
    return this.sendRequest('/logs', 'POST', text, 'text/plain');
  }

  /**
   * Get all logs
   */
  async getLogs(limit = 100, offset = 0) {
    const query = `?limit=${limit}&offset=${offset}`;
    return this.sendRequest(`/logs${query}`, 'GET');
  }

  /**
   * Clear all logs
   */
  async clearLogs() {
    return this.sendRequest('/logs', 'DELETE');
  }

  /**
   * Get server status
   */
  async getServerStatus() {
    return this.sendRequest('/', 'GET');
  }

  /**
   * Send HTTP request to server
   */
  async sendRequest(path, method = 'GET', data = null, contentType = 'application/json') {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.serverUrl);
      
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: method,
        headers: {
          'X-Source-ID': this.sourceId,
          'Content-Type': contentType,
          'User-Agent': 'AllogTestClient/1.0.0'
        }
      };

      const req = http.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              data: parsed
            });
          } catch (error) {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              data: responseData
            });
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (data && method !== 'GET') {
        if (typeof data === 'string') {
          req.write(data);
        } else {
          req.write(JSON.stringify(data));
        }
      }

      req.end();
    });
  }

  /**
   * Run a comprehensive test
   */
  async runTest() {
    console.log('🚀 Starting Allog Server Test...\n');

    try {
      // Test 1: Get server status
      console.log('📊 Test 1: Getting server status...');
      const status = await this.getServerStatus();
      console.log('✅ Server Status:', status.data);
      console.log('');

      // Test 2: Send structured log
      console.log('📝 Test 2: Sending structured log...');
      const structuredLog = await this.sendStructuredLog(
        'Hello from test client!',
        'info',
        { userId: 123, action: 'test' }
      );
      console.log('✅ Structured Log Response:', structuredLog.data);
      console.log('');

      // Test 3: Send text log
      console.log('📝 Test 3: Sending text log...');
      const textLog = await this.sendTextLog('Simple text message', 'warn');
      console.log('✅ Text Log Response:', textLog.data);
      console.log('');

      // Test 4: Send raw text
      console.log('📝 Test 4: Sending raw text...');
      const rawLog = await this.sendRawLog('Raw text log entry');
      console.log('✅ Raw Text Response:', rawLog.data);
      console.log('');

      // Test 5: Get logs
      console.log('📋 Test 5: Getting logs...');
      const logs = await this.getLogs(10, 0);
      console.log(`✅ Retrieved ${logs.data.logs?.length || 0} logs`);
      console.log('');

      // Test 6: Clear logs
      console.log('🗑️ Test 6: Clearing logs...');
      const clearResult = await this.clearLogs();
      console.log('✅ Clear Response:', clearResult.data);
      console.log('');

      // Test 7: Verify logs are cleared
      console.log('📋 Test 7: Verifying logs are cleared...');
      const logsAfterClear = await this.getLogs(10, 0);
      console.log(`✅ Logs after clear: ${logsAfterClear.data.logs?.length || 0}`);
      console.log('');

      console.log('🎉 All tests completed successfully!');
      console.log(`📡 Client Source ID: ${this.sourceId}`);
      console.log(`🌐 Server URL: ${this.serverUrl}`);

    } catch (error) {
      console.error('❌ Test failed:', error.message);
      process.exit(1);
    }
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  const client = new AllogTestClient();
  client.runTest();
}

module.exports = AllogTestClient;
