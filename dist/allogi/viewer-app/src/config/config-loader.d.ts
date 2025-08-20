/**
 * Configuration Loader for Allog Viewer
 *
 * Centralizes all configuration values and provides a single source of truth
 * for repeated constants throughout the viewer application.
 */
export interface ViewerConfig {
    network: {
        ports: {
            viewer: number;
            server: number;
        };
        urls: {
            defaultServer: string;
            alternativeServer: string;
            productionServer: string;
        };
        connection: {
            timeout: number;
            retries: number;
            minTimeout: number;
            maxTimeout: number;
            retryDelay: number;
        };
    };
    refresh: {
        intervals: {
            default: number;
            minimum: number;
            options: number[];
        };
        autoRefresh: {
            enabled: boolean;
            minInterval: number;
        };
    };
    logging: {
        levels: {
            valid: string[];
            default: string;
            colors: Record<string, string>;
        };
        internal: {
            maxLogs: number;
            enableConsole: boolean;
            defaultLevel: string;
        };
    };
    ui: {
        colors: {
            status: Record<string, string>;
            script: string[];
        };
        layout: {
            imagePreview: Record<string, any>;
            notification: Record<string, number>;
        };
    };
    buffers: {
        logs: {
            default: number;
            maximum: number;
        };
        stats: {
            enabledModules: number;
            totalModules: number;
        };
    };
    instrumentation: {
        levels: Record<string, string>;
        defaults: {
            enabled: boolean;
            level: string;
        };
    };
    defaults: {
        fallback: Record<string, string>;
        messages: Record<string, string>;
    };
    export: {
        formats: string[];
        filenamePrefixes: Record<string, string>;
    };
}
declare class ViewerConfigLoader {
    private config;
    constructor();
    get viewerPort(): number;
    get serverPort(): number;
    get defaultServerUrl(): string;
    get alternativeServerUrl(): string;
    get productionServerUrl(): string;
    get connectionTimeout(): number;
    get connectionRetries(): number;
    get minTimeout(): number;
    get maxTimeout(): number;
    get defaultRefreshInterval(): number;
    get minRefreshInterval(): number;
    get refreshOptions(): number[];
    get autoRefreshEnabled(): boolean;
    get minAutoRefreshInterval(): number;
    get validLogLevels(): string[];
    get defaultLogLevel(): string;
    get logLevelColors(): Record<string, string>;
    get maxInternalLogs(): number;
    get enableConsoleLogging(): boolean;
    get defaultInternalLogLevel(): string;
    get statusColors(): Record<string, string>;
    get scriptColors(): string[];
    get imagePreviewConfig(): Record<string, any>;
    get notificationConfig(): Record<string, number>;
    get defaultLogBuffer(): number;
    get maxLogBuffer(): number;
    get instrumentationLevels(): Record<string, string>;
    get defaultInstrumentationEnabled(): boolean;
    get defaultInstrumentationLevel(): string;
    get fallbackValues(): Record<string, string>;
    get defaultMessages(): Record<string, string>;
    get exportFormats(): string[];
    get exportFilenamePrefixes(): Record<string, string>;
    isValidLogLevel(level: string): boolean;
    getLogLevelColor(level: string): string;
    getScriptColor(scriptId: string): string;
    getStatusColor(status: 'connected' | 'error' | 'neutral' | 'warning'): string;
    getConnectionConfig(): {
        baseUrl: string;
        timeout: number;
        retries: number;
    };
    getWebSocketUrl(currentPort?: string): string;
    getApiServerUrl(): string;
    formatMessage(messageKey: string, variables?: Record<string, any>): string;
    getServerUrl(): string;
    getInitialLogStats(): {
        totalLogs: number;
        bufferSize: number;
        enabledModules: number;
        totalModules: number;
        logLevels: Record<string, number>;
        lastUpdate: string;
    };
    getInitialConnectionStatus(): {
        isConnected: boolean;
        retryCount: number;
    };
    getInitialMonitoringStats(): {
        totalModules: number;
        totalScripts: number;
        totalVariables: number;
        totalStates: number;
        totalFunctions: number;
        totalProperties: number;
        totalEvents: number;
        lastUpdate: string;
    };
}
export declare const viewerConfig: ViewerConfigLoader;
export default viewerConfig;
