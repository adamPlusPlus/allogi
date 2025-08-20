/**
 * Allog Browser Server (optional viewer component)
 *
 * Intended to live alongside the standalone viewer/server tooling.
 */

import allogEngine, { LogEntry } from '../../allog/allog-engine';

interface BrowserServerConfig {
  port?: number;
  host?: string;
  enableCORS?: boolean;
  maxConnections?: number;
}

interface ClientConnection {
  id: string;
  send: (data: any) => void;
  isAlive: boolean;
}

class AllogBrowserServer {
  private config: BrowserServerConfig;
  private clients: Map<string, ClientConnection> = new Map();
  private server: any = null;
  private isRunning = false;
  private logBuffer: LogEntry[] = [];
  private maxBufferSize = 1000;

  constructor(config: BrowserServerConfig = {}) {
    this.config = {
      port: 8080,
      host: 'localhost',
      enableCORS: true,
      maxConnections: 10,
      ...config
    };
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('AllogBrowserServer is already running');
      return;
    }

    try {
      await this.startHttpServer();
      this.isRunning = true;
      console.log(`AllogBrowserServer started at http://${this.config.host}:${this.config.port}`);
      this.startLogListener();
    } catch (error) {
      console.error('Failed to start AllogBrowserServer:', error);
      throw error;
    }
  }

  private async startHttpServer(): Promise<void> {
    console.log('Starting HTTP server for browser log viewing...');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      this.clients.forEach(client => {
        client.isAlive = false;
      });
      this.clients.clear();

      if (this.server) {
        // Close server logic here
      }

      this.isRunning = false;
      console.log('AllogBrowserServer stopped');
    } catch (error) {
      console.error('Error stopping AllogBrowserServer:', error);
    }
  }

  private startLogListener(): void {
    setInterval(() => {
      const newLogs = allogEngine.getLogs();
      const logsToSend = newLogs.filter(log => !this.logBuffer.some(existingLog => existingLog.id === log.id));
      if (logsToSend.length > 0) {
        this.broadcastLogs(logsToSend);
        this.logBuffer = newLogs.slice(-this.maxBufferSize);
      }
    }, 100);
  }

  private broadcastLogs(logs: LogEntry[]): void {
    const message = { type: 'logs', data: logs, timestamp: Date.now() };
    this.clients.forEach((client, id) => {
      if (client.isAlive) {
        try {
          client.send(JSON.stringify(message));
        } catch (error) {
          console.warn(`Failed to send to client ${id}:`, error);
          client.isAlive = false;
        }
      }
    });
    this.cleanupDeadConnections();
  }

  private cleanupDeadConnections(): void {
    this.clients.forEach((client, id) => {
      if (!client.isAlive) {
        this.clients.delete(id);
      }
    });
  }

  getStatus(): { isRunning: boolean; clientCount: number; config: BrowserServerConfig } {
    return { isRunning: this.isRunning, clientCount: this.clients.size, config: this.config };
  }

  getBrowserUrl(): string {
    return `http://${this.config.host}:${this.config.port}`;
  }
}

const allogBrowserServer = new AllogBrowserServer();

export { AllogBrowserServer };
export default allogBrowserServer;



