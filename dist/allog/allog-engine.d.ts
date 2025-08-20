/**
 * Allog Engine - Simplified core logging functionality
 *
 * Provides centralized logging with toggle-based control,
 * buffer management, and development console output.
 *
 * Simplified version without complex routing - just essential logging.
 */
import { LogEntry, LogToggle, PerformanceMetrics, ServerConfig } from './allog-types';
declare class AllogEngine {
    private logBuffer;
    private logToggles;
    private bufferSize;
    private isInitialized;
    private serverUrl;
    private serverEnabled;
    private serverMaxRetryAttempts;
    private serverRetryDelayMs;
    private debounceDelayMs;
    private pendingLogs;
    private isSending;
    private retentionMaxAgeHours;
    private retentionMaxCount;
    private cleanupRetryAttempts;
    private fileInfoSamplingRate;
    constructor();
    private initialize;
    /**
     * Send logs to the Allog API server
     */
    private sendLogsToServer;
    /**
     * Process pending logs in batches
     */
    private processPendingLogs;
    /**
     * Log a message for a specific script/module
     */
    log(scriptId: string, message: string, level?: 'info' | 'warn' | 'error' | 'debug', data?: any): void;
    /**
     * Route log entry to Allog (simplified)
     */
    private routeLogEntry;
    /**
     * Route log entry to Allog (original behavior)
     */
    private routeToAllog;
    /**
     * Enable logging for a specific script/module
     */
    enable(scriptId: string, level?: 'info' | 'warn' | 'error' | 'debug'): void;
    /**
     * Disable logging for a specific script/module
     */
    disable(scriptId: string): void;
    /**
     * Check if logging is enabled for a specific script/module
     */
    isEnabled(scriptId: string): boolean;
    /**
     * Toggle logging for a specific script/module
     */
    toggle(scriptId: string): void;
    /**
     * Get all logs
     */
    getLogs(): LogEntry[];
    /**
     * Get logs by script ID
     */
    getLogsByScript(scriptId: string): LogEntry[];
    /**
     * Get logs by level
     */
    getLogsByLevel(level: 'info' | 'warn' | 'error' | 'debug'): LogEntry[];
    /**
     * Get known script IDs
     */
    getKnownScripts(): string[];
    /**
     * Get toggle status for all scripts
     */
    getToggleStatus(): Record<string, LogToggle>;
    /**
     * Clear all logs
     */
    clear(): void;
    /**
     * Set buffer size
     */
    setBufferSize(size: number): void;
    /**
     * Get buffer size
     */
    getBufferSize(): number;
    /**
     * Get log count
     */
    getLogCount(): number;
    /**
     * Configure server settings
     */
    configureServer(url: string, enabled?: boolean): void;
    /**
     * Configure retry and debounce behavior for server sending
     */
    configureRetryBehavior(maxRetryAttempts: number, retryDelayMs: number, debounceDelayMs?: number): void;
    /**
     * Get server configuration
     */
    getServerConfig(): ServerConfig;
    /**
     * Force send all pending logs to server
     */
    flushPendingLogs(): Promise<void>;
    getPerformanceMetrics(): PerformanceMetrics;
    cleanup(): void;
    getCleanupStatus(): {
        pendingLogsCount: number;
        cacheSize: number;
        retryAttempts: number;
        isSending: boolean;
    };
    configureRetention(maxAgeHours: number, maxCount: number): void;
    getRetentionSettings(): {
        maxAgeHours: number;
        maxCount: number;
    };
    enableAll(level?: 'info' | 'warn' | 'error' | 'debug'): void;
    disableAll(): void;
    setFileInfoSamplingRate(rate: number): void;
    getAllModules(): string[];
    getEnabledModules(): string[];
}
declare const allogEngine: AllogEngine;
export default allogEngine;
