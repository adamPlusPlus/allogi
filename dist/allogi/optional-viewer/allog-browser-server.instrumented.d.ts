/**
 * Allog Browser Server (optional viewer component)
 *
 * Intended to live alongside the standalone viewer/server tooling.
 */
interface BrowserServerConfig {
    port?: number;
    host?: string;
    enableCORS?: boolean;
    maxConnections?: number;
}
declare class AllogBrowserServer {
    private config;
    private clients;
    private server;
    private isRunning;
    private logBuffer;
    private maxBufferSize;
    constructor(config?: BrowserServerConfig);
    start(): Promise<void>;
    private startHttpServer;
    stop(): Promise<void>;
    private startLogListener;
    private broadcastLogs;
    private cleanupDeadConnections;
    getStatus(): {
        isRunning: boolean;
        clientCount: number;
        config: BrowserServerConfig;
    };
    getBrowserUrl(): string;
}
declare const allogBrowserServer: AllogBrowserServer;
export { AllogBrowserServer };
export default allogBrowserServer;
