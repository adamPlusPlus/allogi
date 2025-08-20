/**
 * Database Adapter for Allog Server
 * 
 * Provides a unified interface for multiple database backends:
 * - File-based JSON storage (default)
 * - SQLite database
 * - PostgreSQL database
 */

class DatabaseAdapter {
  constructor(config) {
    this.config = config;
    this.backend = null;
    this.type = config.backend?.type || 'file';
  }

  async initialize() {
    switch (this.type) {
      case 'sqlite':
        this.backend = new SQLiteBackend(this.config.backend.options.sqlite);
        break;
      case 'postgresql':
        this.backend = new PostgreSQLBackend(this.config.backend.options.postgresql);
        break;
      case 'file':
      default:
        this.backend = new FileBackend(this.config.backend?.options?.file || { filename: './allog-data.json' });
        break;
    }

    await this.backend.initialize();
    console.log(`🗄️ Database initialized: ${this.type}`);
  }

  async close() {
    if (this.backend && this.backend.close) {
      await this.backend.close();
    }
  }

  // Unified interface methods
  async saveLogs(logs) {
    return this.backend.saveLogs(logs);
  }

  async loadLogs() {
    return this.backend.loadLogs();
  }

  async saveMonitoringData(monitoringData) {
    return this.backend.saveMonitoringData(monitoringData);
  }

  async loadMonitoringData() {
    return this.backend.loadMonitoringData();
  }

  async saveSources(sources) {
    return this.backend.saveSources(sources);
  }

  async loadSources() {
    return this.backend.loadSources();
  }

  async addLog(log) {
    return this.backend.addLog(log);
  }

  async addMonitoringEntry(entry) {
    return this.backend.addMonitoringEntry(entry);
  }

  async getLogsByFilter(filter) {
    return this.backend.getLogsByFilter ? this.backend.getLogsByFilter(filter) : null;
  }

  async getMonitoringByFilter(filter) {
    return this.backend.getMonitoringByFilter ? this.backend.getMonitoringByFilter(filter) : null;
  }

  async cleanup(retentionHours) {
    return this.backend.cleanup ? this.backend.cleanup(retentionHours) : null;
  }
}

// File-based backend (existing JSON implementation)
class FileBackend {
  constructor(options) {
    this.filename = options.filename;
  }

  async initialize() {
    // File backend doesn't need initialization
  }

  async saveLogs(logs) {
    const data = await this.loadAllData();
    data.logs = logs;
    await this.saveAllData(data);
  }

  async loadLogs() {
    const data = await this.loadAllData();
    return data.logs || [];
  }

  async saveMonitoringData(monitoringData) {
    const data = await this.loadAllData();
    data.monitoringData = monitoringData;
    await this.saveAllData(data);
  }

  async loadMonitoringData() {
    const data = await this.loadAllData();
    return data.monitoringData || [];
  }

  async saveSources(sources) {
    const data = await this.loadAllData();
    data.sources = Array.from(sources.entries());
    await this.saveAllData(data);
  }

  async loadSources() {
    const data = await this.loadAllData();
    return new Map(data.sources || []);
  }

  async addLog(log) {
    // For file backend, we'll just trigger a full save (not optimal but simple)
    return null; // Indicates that the caller should handle it
  }

  async addMonitoringEntry(entry) {
    // For file backend, we'll just trigger a full save (not optimal but simple)
    return null; // Indicates that the caller should handle it
  }

  async loadAllData() {
    const fs = require('fs').promises;
    try {
      const data = await fs.readFile(this.filename, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is invalid, return empty structure
      return { logs: [], monitoringData: [], sources: [] };
    }
  }

  async saveAllData(data) {
    const fs = require('fs').promises;
    await fs.writeFile(this.filename, JSON.stringify(data, null, 2));
  }
}

// SQLite backend
class SQLiteBackend {
  constructor(options) {
    this.filename = options.filename;
    this.enableWAL = options.enableWAL !== false;
    this.busyTimeout = options.busyTimeout || 5000;
    this.db = null;
  }

  async initialize() {
    const sqlite3 = require('sqlite3').verbose();
    const { promisify } = require('util');

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.filename, (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Configure database
        this.db.serialize(() => {
          if (this.enableWAL) {
            this.db.run("PRAGMA journal_mode=WAL");
          }
          this.db.run(`PRAGMA busy_timeout=${this.busyTimeout}`);

          // Create tables
          this.createTables(() => {
            console.log(`✅ SQLite database initialized: ${this.filename}`);
            resolve();
          });
        });
      });
    });
  }

  createTables(callback) {
    const tables = [
      // Logs table
      `CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        script_id TEXT,
        level TEXT,
        message TEXT,
        timestamp TEXT,
        time TEXT,
        source_id TEXT,
        data TEXT,
        stack TEXT,
        server_time TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Monitoring data table
      `CREATE TABLE IF NOT EXISTS monitoring_data (
        id TEXT PRIMARY KEY,
        module_id TEXT,
        script_id TEXT,
        type TEXT,
        name TEXT,
        value TEXT,
        previous_value TEXT,
        timestamp INTEGER,
        time TEXT,
        source_id TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Sources table
      `CREATE TABLE IF NOT EXISTS sources (
        source_id TEXT PRIMARY KEY,
        data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Indexes for performance
      `CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level)`,
      `CREATE INDEX IF NOT EXISTS idx_logs_source_id ON logs(source_id)`,
      `CREATE INDEX IF NOT EXISTS idx_logs_script_id ON logs(script_id)`,
      `CREATE INDEX IF NOT EXISTS idx_monitoring_timestamp ON monitoring_data(timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_monitoring_module_id ON monitoring_data(module_id)`,
      `CREATE INDEX IF NOT EXISTS idx_monitoring_type ON monitoring_data(type)`
    ];

    let completed = 0;
    tables.forEach(sql => {
      this.db.run(sql, (err) => {
        if (err) console.error('SQLite table creation error:', err);
        completed++;
        if (completed === tables.length) {
          callback();
        }
      });
    });
  }

  async close() {
    if (this.db) {
      return new Promise((resolve) => {
        this.db.close(resolve);
      });
    }
  }

  async saveLogs(logs) {
    // Clear existing and insert all
    await this.runAsync("DELETE FROM logs");
    
    const stmt = this.db.prepare(`
      INSERT INTO logs (id, script_id, level, message, timestamp, time, source_id, data, stack, server_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const log of logs) {
      await this.runAsync(stmt, [
        log.id, log.scriptId, log.level, log.message, log.timestamp, log.time,
        log.sourceId, JSON.stringify(log.data), log.stack, log.serverTime
      ]);
    }

    stmt.finalize();
  }

  async loadLogs() {
    const rows = await this.allAsync("SELECT * FROM logs ORDER BY timestamp DESC");
    return rows.map(row => ({
      id: row.id,
      scriptId: row.script_id,
      level: row.level,
      message: row.message,
      timestamp: row.timestamp,
      time: row.time,
      sourceId: row.source_id,
      data: row.data ? JSON.parse(row.data) : null,
      stack: row.stack,
      serverTime: row.server_time
    }));
  }

  async saveMonitoringData(monitoringData) {
    // Clear existing and insert all
    await this.runAsync("DELETE FROM monitoring_data");
    
    const stmt = this.db.prepare(`
      INSERT INTO monitoring_data (id, module_id, script_id, type, name, value, previous_value, timestamp, time, source_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const entry of monitoringData) {
      await this.runAsync(stmt, [
        entry.id, entry.moduleId, entry.scriptId, entry.type, entry.name,
        JSON.stringify(entry.value), JSON.stringify(entry.previousValue),
        entry.timestamp, entry.time, entry.sourceId, JSON.stringify(entry.metadata)
      ]);
    }

    stmt.finalize();
  }

  async loadMonitoringData() {
    const rows = await this.allAsync("SELECT * FROM monitoring_data ORDER BY timestamp DESC");
    return rows.map(row => ({
      id: row.id,
      moduleId: row.module_id,
      scriptId: row.script_id,
      type: row.type,
      name: row.name,
      value: row.value ? JSON.parse(row.value) : null,
      previousValue: row.previous_value ? JSON.parse(row.previous_value) : null,
      timestamp: row.timestamp,
      time: row.time,
      sourceId: row.source_id,
      metadata: row.metadata ? JSON.parse(row.metadata) : {}
    }));
  }

  async saveSources(sources) {
    // Clear existing and insert all
    await this.runAsync("DELETE FROM sources");
    
    const stmt = this.db.prepare("INSERT INTO sources (source_id, data) VALUES (?, ?)");
    
    for (const [sourceId, sourceData] of sources.entries()) {
      await this.runAsync(stmt, [sourceId, JSON.stringify(sourceData)]);
    }

    stmt.finalize();
  }

  async loadSources() {
    const rows = await this.allAsync("SELECT * FROM sources");
    const sources = new Map();
    
    rows.forEach(row => {
      sources.set(row.source_id, JSON.parse(row.data));
    });

    return sources;
  }

  async addLog(log) {
    const sql = `
      INSERT INTO logs (id, script_id, level, message, timestamp, time, source_id, data, stack, server_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.runAsync(sql, [
      log.id, log.scriptId, log.level, log.message, log.timestamp, log.time,
      log.sourceId, JSON.stringify(log.data), log.stack, log.serverTime
    ]);
  }

  async addMonitoringEntry(entry) {
    const sql = `
      INSERT INTO monitoring_data (id, module_id, script_id, type, name, value, previous_value, timestamp, time, source_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.runAsync(sql, [
      entry.id, entry.moduleId, entry.scriptId, entry.type, entry.name,
      JSON.stringify(entry.value), JSON.stringify(entry.previousValue),
      entry.timestamp, entry.time, entry.sourceId, JSON.stringify(entry.metadata)
    ]);
  }

  async getLogsByFilter(filter) {
    let sql = "SELECT * FROM logs WHERE 1=1";
    const params = [];

    if (filter.sourceId) {
      sql += " AND source_id = ?";
      params.push(filter.sourceId);
    }

    if (filter.level) {
      sql += " AND level = ?";
      params.push(filter.level);
    }

    if (filter.scriptId) {
      sql += " AND script_id = ?";
      params.push(filter.scriptId);
    }

    if (filter.start) {
      sql += " AND timestamp >= ?";
      params.push(filter.start);
    }

    if (filter.end) {
      sql += " AND timestamp <= ?";
      params.push(filter.end);
    }

    sql += " ORDER BY timestamp DESC";

    if (filter.limit) {
      sql += " LIMIT ?";
      params.push(parseInt(filter.limit));
    }

    const rows = await this.allAsync(sql, params);
    return rows.map(row => ({
      id: row.id,
      scriptId: row.script_id,
      level: row.level,
      message: row.message,
      timestamp: row.timestamp,
      time: row.time,
      sourceId: row.source_id,
      data: row.data ? JSON.parse(row.data) : null,
      stack: row.stack,
      serverTime: row.server_time
    }));
  }

  async cleanup(retentionHours) {
    const cutoffTime = Date.now() - (retentionHours * 60 * 60 * 1000);
    
    const logsDeleted = await this.runAsync("DELETE FROM logs WHERE timestamp < ?", [new Date(cutoffTime).toISOString()]);
    const monitoringDeleted = await this.runAsync("DELETE FROM monitoring_data WHERE timestamp < ?", [cutoffTime]);
    
    return {
      logsDeleted: logsDeleted.changes || 0,
      monitoringDeleted: monitoringDeleted.changes || 0
    };
  }

  // Helper methods to promisify SQLite operations
  runAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (typeof sql === 'object') {
        // It's a prepared statement
        sql.run(params, function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes, lastID: this.lastID });
        });
      } else {
        this.db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes, lastID: this.lastID });
        });
      }
    });
  }

  allAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
}

// PostgreSQL backend
class PostgreSQLBackend {
  constructor(options) {
    this.options = options;
    this.client = null;
  }

  async initialize() {
    const { Client } = require('pg');
    
    this.client = new Client({
      host: this.options.host,
      port: this.options.port,
      database: this.options.database,
      user: this.options.user,
      password: this.options.password,
      ssl: this.options.ssl
    });

    await this.client.connect();
    await this.createTables();
    
    console.log(`✅ PostgreSQL database connected: ${this.options.host}:${this.options.port}/${this.options.database}`);
  }

  async close() {
    if (this.client) {
      await this.client.end();
    }
  }

  async createTables() {
    const tables = [
      // Logs table
      `CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        script_id TEXT,
        level TEXT,
        message TEXT,
        timestamp TIMESTAMP,
        time TEXT,
        source_id TEXT,
        data JSONB,
        stack TEXT,
        server_time TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Monitoring data table
      `CREATE TABLE IF NOT EXISTS monitoring_data (
        id TEXT PRIMARY KEY,
        module_id TEXT,
        script_id TEXT,
        type TEXT,
        name TEXT,
        value JSONB,
        previous_value JSONB,
        timestamp BIGINT,
        time TEXT,
        source_id TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Sources table
      `CREATE TABLE IF NOT EXISTS sources (
        source_id TEXT PRIMARY KEY,
        data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Indexes for performance
      `CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level)`,
      `CREATE INDEX IF NOT EXISTS idx_logs_source_id ON logs(source_id)`,
      `CREATE INDEX IF NOT EXISTS idx_logs_script_id ON logs(script_id)`,
      `CREATE INDEX IF NOT EXISTS idx_monitoring_timestamp ON monitoring_data(timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_monitoring_module_id ON monitoring_data(module_id)`,
      `CREATE INDEX IF NOT EXISTS idx_monitoring_type ON monitoring_data(type)`
    ];

    for (const sql of tables) {
      try {
        await this.client.query(sql);
      } catch (error) {
        console.error('PostgreSQL table creation error:', error);
      }
    }
  }

  async saveLogs(logs) {
    // Clear existing and insert all
    await this.client.query("DELETE FROM logs");
    
    if (logs.length === 0) return;

    const values = logs.map((log, i) => {
      const base = i * 10;
      return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, $${base+7}, $${base+8}, $${base+9}, $${base+10})`;
    }).join(',');

    const params = logs.flatMap(log => [
      log.id, log.scriptId, log.level, log.message, log.timestamp, log.time,
      log.sourceId, JSON.stringify(log.data), log.stack, log.serverTime
    ]);

    const sql = `
      INSERT INTO logs (id, script_id, level, message, timestamp, time, source_id, data, stack, server_time)
      VALUES ${values}
    `;

    await this.client.query(sql, params);
  }

  async loadLogs() {
    const result = await this.client.query("SELECT * FROM logs ORDER BY timestamp DESC");
    return result.rows.map(row => ({
      id: row.id,
      scriptId: row.script_id,
      level: row.level,
      message: row.message,
      timestamp: row.timestamp,
      time: row.time,
      sourceId: row.source_id,
      data: row.data,
      stack: row.stack,
      serverTime: row.server_time
    }));
  }

  async saveMonitoringData(monitoringData) {
    // Clear existing and insert all
    await this.client.query("DELETE FROM monitoring_data");
    
    if (monitoringData.length === 0) return;

    const values = monitoringData.map((entry, i) => {
      const base = i * 11;
      return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, $${base+7}, $${base+8}, $${base+9}, $${base+10}, $${base+11})`;
    }).join(',');

    const params = monitoringData.flatMap(entry => [
      entry.id, entry.moduleId, entry.scriptId, entry.type, entry.name,
      JSON.stringify(entry.value), JSON.stringify(entry.previousValue),
      entry.timestamp, entry.time, entry.sourceId, JSON.stringify(entry.metadata)
    ]);

    const sql = `
      INSERT INTO monitoring_data (id, module_id, script_id, type, name, value, previous_value, timestamp, time, source_id, metadata)
      VALUES ${values}
    `;

    await this.client.query(sql, params);
  }

  async loadMonitoringData() {
    const result = await this.client.query("SELECT * FROM monitoring_data ORDER BY timestamp DESC");
    return result.rows.map(row => ({
      id: row.id,
      moduleId: row.module_id,
      scriptId: row.script_id,
      type: row.type,
      name: row.name,
      value: row.value,
      previousValue: row.previous_value,
      timestamp: row.timestamp,
      time: row.time,
      sourceId: row.source_id,
      metadata: row.metadata || {}
    }));
  }

  async saveSources(sources) {
    // Clear existing and insert all
    await this.client.query("DELETE FROM sources");
    
    if (sources.size === 0) return;

    const values = Array.from(sources.entries()).map((_, i) => {
      const base = i * 2;
      return `($${base+1}, $${base+2})`;
    }).join(',');

    const params = Array.from(sources.entries()).flatMap(([sourceId, sourceData]) => [
      sourceId, JSON.stringify(sourceData)
    ]);

    const sql = `INSERT INTO sources (source_id, data) VALUES ${values}`;
    await this.client.query(sql, params);
  }

  async loadSources() {
    const result = await this.client.query("SELECT * FROM sources");
    const sources = new Map();
    
    result.rows.forEach(row => {
      sources.set(row.source_id, row.data);
    });

    return sources;
  }

  async addLog(log) {
    const sql = `
      INSERT INTO logs (id, script_id, level, message, timestamp, time, source_id, data, stack, server_time)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;
    
    await this.client.query(sql, [
      log.id, log.scriptId, log.level, log.message, log.timestamp, log.time,
      log.sourceId, JSON.stringify(log.data), log.stack, log.serverTime
    ]);
  }

  async addMonitoringEntry(entry) {
    const sql = `
      INSERT INTO monitoring_data (id, module_id, script_id, type, name, value, previous_value, timestamp, time, source_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;
    
    await this.client.query(sql, [
      entry.id, entry.moduleId, entry.scriptId, entry.type, entry.name,
      JSON.stringify(entry.value), JSON.stringify(entry.previousValue),
      entry.timestamp, entry.time, entry.sourceId, JSON.stringify(entry.metadata)
    ]);
  }

  async getLogsByFilter(filter) {
    let sql = "SELECT * FROM logs WHERE 1=1";
    const params = [];
    let paramCount = 0;

    if (filter.sourceId) {
      params.push(filter.sourceId);
      sql += ` AND source_id = $${++paramCount}`;
    }

    if (filter.level) {
      params.push(filter.level);
      sql += ` AND level = $${++paramCount}`;
    }

    if (filter.scriptId) {
      params.push(filter.scriptId);
      sql += ` AND script_id = $${++paramCount}`;
    }

    if (filter.start) {
      params.push(filter.start);
      sql += ` AND timestamp >= $${++paramCount}`;
    }

    if (filter.end) {
      params.push(filter.end);
      sql += ` AND timestamp <= $${++paramCount}`;
    }

    sql += " ORDER BY timestamp DESC";

    if (filter.limit) {
      params.push(parseInt(filter.limit));
      sql += ` LIMIT $${++paramCount}`;
    }

    const result = await this.client.query(sql, params);
    return result.rows.map(row => ({
      id: row.id,
      scriptId: row.script_id,
      level: row.level,
      message: row.message,
      timestamp: row.timestamp,
      time: row.time,
      sourceId: row.source_id,
      data: row.data,
      stack: row.stack,
      serverTime: row.server_time
    }));
  }

  async cleanup(retentionHours) {
    const cutoffTime = Date.now() - (retentionHours * 60 * 60 * 1000);
    
    const logsResult = await this.client.query("DELETE FROM logs WHERE timestamp < $1", [new Date(cutoffTime).toISOString()]);
    const monitoringResult = await this.client.query("DELETE FROM monitoring_data WHERE timestamp < $1", [cutoffTime]);
    
    return {
      logsDeleted: logsResult.rowCount || 0,
      monitoringDeleted: monitoringResult.rowCount || 0
    };
  }
}

module.exports = { DatabaseAdapter };
