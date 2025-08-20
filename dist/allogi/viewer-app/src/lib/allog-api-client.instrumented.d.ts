/**
 * Allog API Client
 *
 * Standalone viewer HTTP client for the intermediary server
 */
export interface AllogLogEntry {
    id: string;
    message: string;
    time?: string;
    timestamp?: string;
    serverReceivedAt?: string;
    level: 'debug' | 'info' | 'warn' | 'error';
    scriptId?: string;
    data?: any;
    sourceId?: string;
    sourceType?: string;
}
export interface AllogApiClient {
    getLogs(options?: any): Promise<AllogLogEntry[]>;
    clearLogs(): Promise<void>;
    exportLogs(): Promise<string>;
    getStats(): Promise<any>;
    healthCheck(): Promise<boolean>;
    sendRawLog(data: any, level?: string): Promise<any>;
    sendTextLog(text: string, level?: string): Promise<any>;
    sendTextLogGet(text: string, level?: string, source?: string): Promise<any>;
    getRecursiveLogs?(): Promise<AllogLogEntry[]>;
    getRecursiveLogsStats?(): Promise<any>;
    getLevelColor?(level: string): Promise<string>;
    getScriptColor?(scriptId: string): Promise<string>;
    formatTime?(timestamp: string): Promise<string>;
}
export declare function createAllogApiClient(serverUrl: string): AllogApiClient;
export default createAllogApiClient;
