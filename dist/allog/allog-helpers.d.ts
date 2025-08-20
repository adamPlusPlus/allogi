/**
 * Allog Helpers - Internal, side-effect-free helpers for the Allog wrapper
 *
 * These helpers must not import from app-wide utils and must not log to Allog
 * to avoid recursion. Keep them minimal and portable.
 */
export interface SafeStringifyOptions {
    maxBytes?: number;
    maxDepth?: number;
    circularStrategy?: 'omit' | 'replace';
    circularPlaceholder?: string;
}
export interface SafeStringifyResult {
    json: string;
    truncated: boolean;
    exceededDepth: boolean;
    circularCount: number;
    bytes: number;
}
/**
 * Environment check that works across RN/Web/Node without external deps.
 */
export declare function isDevelopment(): boolean;
/**
 * Safely stringify arbitrary data with depth and circular protections.
 */
export declare function safeStringify(value: unknown, options?: SafeStringifyOptions): SafeStringifyResult;
/**
 * Scan object for sensitive keys/values using regex patterns.
 */
export declare function scanSensitiveData(obj: unknown, patterns?: RegExp[]): {
    matches: {
        path: string;
        key?: string;
        valueSnippet?: string;
    }[];
};
