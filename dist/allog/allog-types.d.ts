/**
 * Allog Type Definitions
 *
 * Comprehensive type definitions for the Allog system to ensure type safety.
 */
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export interface LogEntry {
    id: string;
    message: string;
    time: Date;
    level?: LogLevel;
    data?: unknown;
    stack?: string;
    file?: string;
    line?: number;
    column?: number;
    functionName?: string;
}
export interface LogToggle {
    enabled: boolean;
    level: LogLevel;
    lastToggled: Date;
}
export interface AllogConfig {
    bufferSize?: number;
    defaultLevel?: LogLevel;
    enableCrashCapture?: boolean;
    enableConsoleLogging?: boolean;
    autoEnableModules?: string[];
    developmentMode?: boolean;
    maxRetryAttempts?: number;
    retryDelayMs?: number;
    debounceDelayMs?: number;
}
export interface AllogStats {
    totalLogs: number;
    bufferSize: number;
    enabledModules: number;
    totalModules: number;
    logLevels: Record<string, number>;
    recentActivity: LogEntry[];
}
export interface ServerConfig {
    url: string;
    enabled: boolean;
    maxRetryAttempts: number;
    retryDelayMs: number;
}
export interface FileInfo {
    file?: string;
    line?: number;
    column?: number;
    functionName?: string;
    timestamp?: number;
}
export interface LoggerInterface {
    info: (message: string, data?: unknown) => void;
    warn: (message: string, data?: unknown) => void;
    error: (message: string, data?: unknown) => void;
    debug: (message: string, data?: unknown) => void;
    enable: () => void;
    disable: () => void;
    isEnabled: () => boolean;
    toggle: () => void;
}
export interface AllogEngineInterface {
    log: (scriptId: string, message: string, level?: LogLevel, data?: unknown) => void;
    enable: (scriptId: string, level?: LogLevel) => void;
    disable: (scriptId: string) => void;
    isEnabled: (scriptId: string) => boolean;
    toggle: (scriptId: string) => void;
    getLogs: () => LogEntry[];
    getLogsByScript: (scriptId: string) => LogEntry[];
    getLogsByLevel: (level: LogLevel) => LogEntry[];
    getKnownScripts: () => string[];
    getToggleStatus: () => Record<string, LogToggle>;
    clear: () => void;
    setBufferSize: (size: number) => void;
    getBufferSize: () => number;
    getLogCount: () => number;
    configureServer: (url: string, enabled?: boolean) => void;
    getServerConfig: () => ServerConfig;
    flushPendingLogs: () => Promise<void>;
    getPerformanceMetrics: () => PerformanceMetrics;
    cleanup: () => void;
    getCleanupStatus: () => {
        pendingLogsCount: number;
        cacheSize: number;
        retryAttempts: number;
        isSending: boolean;
    };
    configureRetention: (maxAgeHours: number, maxCount: number) => void;
    getRetentionSettings: () => {
        maxAgeHours: number;
        maxCount: number;
    };
}
export interface AllogManagerInterface {
    initialize: () => void;
    enableModule: (moduleId: string, level?: LogLevel) => void;
    disableModule: (moduleId: string) => void;
    toggleModule: (moduleId: string) => void;
    enableModules: (modules: Array<{
        id: string;
        level?: LogLevel;
    }>) => void;
    disableModules: (moduleIds: string[]) => void;
    getStats: () => AllogStats;
    getLogs: (options?: {
        moduleId?: string;
        level?: LogLevel;
        limit?: number;
        since?: Date;
    }) => LogEntry[];
    clearLogs: () => void;
    exportLogs: (options?: LogExportOptions) => string;
    getEnabledModules: () => string[];
    getDisabledModules: () => string[];
    setBufferSize: (size: number) => void;
    reset: () => void;
    configure: (newConfig: Partial<AllogConfig>) => void;
    getConfig: () => AllogConfig;
    isSystemInitialized: () => boolean;
    getEngine: () => AllogEngineInterface;
    configureServer: (url: string, enabled?: boolean) => void;
    getServerConfig: () => ServerConfig;
    flushPendingLogs: () => Promise<void>;
    getPerformanceMetrics: () => PerformanceMetrics;
}
export interface AllogCoordinatorInterface {
    handleInternalRequest: (args: {
        action: string;
        target?: 'manager';
        [key: string]: unknown;
    }) => Promise<unknown>;
    handleExternalRequest: (args: {
        targetModule: string;
        action: string;
        [key: string]: unknown;
    }) => Promise<unknown>;
}
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
}
export interface ConfigValidation {
    validateAllogConfig: (config: Partial<AllogConfig>) => ValidationResult;
    validateLogEntry: (entry: Partial<LogEntry>) => ValidationResult;
}
export interface ConnectionStatus {
    isConnected: boolean;
    lastConnected?: string;
    error?: string;
    retryCount: number;
}
export interface MonitoringStats {
    totalModules: number;
    totalScripts: number;
    totalVariables: number;
    totalStates: number;
    totalFunctions: number;
    totalProperties: number;
    totalEvents: number;
    lastUpdate: string;
}
export interface PerformanceMetrics {
    loggingLatency: number;
    bufferUtilization: number;
    memoryUsage: number;
    throughput: number;
    timestamp: Date;
}
export interface LogRetentionConfig {
    maxAgeHours: number;
    maxCount: number;
    enableAutoCleanup: boolean;
    cleanupIntervalMinutes: number;
}
export interface DataValidationConfig {
    maxDataSize: number;
    maxStringLength: number;
    enableSensitiveDataDetection: boolean;
    enableCircularReferenceDetection: boolean;
    sensitivePatterns: string[];
    sensitiveKeys: string[];
}
export interface LogExportOptions {
    format: 'json' | 'csv' | 'html' | 'markdown';
    includeMetadata?: boolean;
    timeRange?: {
        start: Date;
        end: Date;
    };
    filters?: {
        level?: LogLevel[];
        scriptIds?: string[];
        search?: string;
    };
    maxDataSize?: number;
    truncateLargeData?: boolean;
}
export interface WebSocketMessage {
    type: 'log' | 'stats' | 'config' | 'error';
    data: unknown;
    timestamp: Date;
}
export interface WebSocketSubscription {
    id: string;
    filters?: {
        levels?: LogLevel[];
        scriptIds?: string[];
    };
    callback: (message: WebSocketMessage) => void;
}
