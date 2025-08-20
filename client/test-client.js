#!/usr/bin/env node

/**
 * Allog Test Client
 * 
 * A simple test client that demonstrates how to use the Allog client library
 * to send logs to the intermediary server.
 */

const AllogClient = require('./allog-client.js');

class AllogTestClient {
  constructor() {
    this.allog = new AllogClient({
      serverUrl: 'http://localhost:3002',
      sourceId: 'test-client',
      sourceType: 'test',
      sourceVersion: '1.0.0',
      enableWebSocket: true,
      batchSize: 5,
      batchInterval: 2000
    });

    this.testCounter = 0;
  }

  async runTests() {
    console.log('🧪 Starting Allog Test Client...\n');

    // Wait for registration
    await this.wait(1000);

    // Test 1: Basic logging
    console.log('📝 Test 1: Basic logging');
    this.allog.info('Test client started', { timestamp: new Date().toISOString() });
    this.allog.warn('This is a warning message', { testId: 1 });
    this.allog.error('This is an error message', { testId: 2, error: 'Test error' });
    this.allog.debug('This is a debug message', { testId: 3, debug: true });

    await this.wait(1000);

    // Test 2: Batch logging
    console.log('📦 Test 2: Batch logging');
    for (let i = 0; i < 10; i++) {
      this.allog.info(`Batch log ${i + 1}`, { 
        batchId: 'test-batch-1',
        sequence: i + 1,
        timestamp: new Date().toISOString()
      });
    }

    await this.wait(3000);

    // Test 3: Structured data
    console.log('📊 Test 3: Structured data');
    this.allog.info('User action completed', {
      userId: 12345,
      action: 'login',
      timestamp: new Date().toISOString(),
      metadata: {
        browser: 'Chrome',
        version: '120.0.0',
        platform: 'Windows'
      }
    });

    this.allog.error('API call failed', {
      endpoint: '/api/users',
      method: 'POST',
      statusCode: 500,
      responseTime: 1500,
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    });

    await this.wait(1000);

    // Test 4: Performance metrics
    console.log('⚡ Test 4: Performance metrics');
    this.allog.info('Performance test started', { testType: 'performance' });
    
    const startTime = Date.now();
    await this.simulateWork();
    const endTime = Date.now();
    
    this.allog.info('Performance test completed', {
      testType: 'performance',
      duration: endTime - startTime,
      success: true
    });

    await this.wait(1000);

    // Test 5: Continuous logging
    console.log('🔄 Test 5: Continuous logging (10 seconds)');
    const interval = setInterval(() => {
      this.testCounter++;
      this.allog.info(`Continuous log ${this.testCounter}`, {
        counter: this.testCounter,
        timestamp: new Date().toISOString(),
        randomValue: Math.random()
      });

      if (this.testCounter >= 20) {
        clearInterval(interval);
        this.finishTests();
      }
    }, 500);

  }

  async simulateWork() {
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
  }

  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async finishTests() {
    console.log('\n✅ All tests completed!');
    
    // Get status
    try {
      const status = await this.allog.getStatus();
      console.log('\n📊 Server Status:');
      console.log(`- Total logs: ${status.totalLogs}`);
      console.log(`- Sources: ${status.sources}`);
      console.log(`- Connections: ${status.connections}`);
      console.log(`- Level counts:`, status.levelCounts);
    } catch (error) {
      console.error('Failed to get status:', error);
    }

    // Cleanup
    setTimeout(() => {
      this.allog.destroy();
      console.log('🧹 Test client cleaned up');
      process.exit(0);
    }, 2000);
  }
}

// Handle process signals
process.on('SIGINT', () => {
  console.log('\n🛑 Test client interrupted');
  process.exit(0);
});

// Start the test client
const testClient = new AllogTestClient();
testClient.runTests().catch(error => {
  console.error('❌ Test client error:', error);
  process.exit(1);
});
