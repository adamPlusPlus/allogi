/**
 * Internal Allog Logger for the Viewer App
 *
 * This provides a centralized logging system for the viewer app itself,
 * replacing the scattered console.log/console.error statements with
 * a consistent logging interface that can be configured and managed.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
interface LogEntry {
    timestamp: Date;
    level: LogLevel;
    component: string;
    message: string;
    data?: any;
}
declare class AllogLogger {
    private logs;
    private maxLogs;
    private enableConsole;
    private logLevel;
    private levelOrder;
    constructor(options?: {
        enableConsole?: boolean;
        logLevel?: LogLevel;
        maxLogs?: number;
    });
    private shouldLog;
    private addLog;
    debug(component: string, message: string, data?: any): void;
    info(component: string, message: string, data?: any): void;
    warn(component: string, message: string, data?: any): void;
    error(component: string, message: string, data?: any): void;
    getLogs(): LogEntry[];
    getLogsForComponent(component: string): LogEntry[];
    getLogsForLevel(level: LogLevel): LogEntry[];
    clearLogs(): void;
    configure(options: {
        enableConsole?: boolean;
        logLevel?: LogLevel;
        maxLogs?: number;
    }): void;
}
declare const logger: AllogLogger;
export declare const log: {
    debug: (component: string, message: string, data?: any) => void;
    info: (component: string, message: string, data?: any) => void;
    warn: (component: string, message: string, data?: any) => void;
    error: (component: string, message: string, data?: any) => void;
    getLogs: () => LogEntry[];
    getLogsForComponent: (component: string) => LogEntry[];
    clearLogs: () => void;
    configure: (options: Parameters<typeof logger.configure>[0]) => void;
};
export default logger;
