/**
 * Allog Browser Viewer (optional viewer component)
 */
interface BrowserViewerConfig {
    port?: number;
    host?: string;
    autoOpen?: boolean;
    refreshInterval?: number;
}
declare class AllogBrowserViewer {
    private config;
    private isRunning;
    private lastLogCount;
    private intervalId;
    constructor(config?: BrowserViewerConfig);
    start(): Promise<void>;
    private startServer;
    private startLogPolling;
    stop(): Promise<void>;
    private openBrowser;
    getViewerUrl(): string;
    getScreenshotViewerHtml(screenshot: {
        imageUrl: string;
        overlay?: {
            viewport: {
                width: number;
                height: number;
            };
            elements: Array<{
                id: string;
                label?: string;
                rect: {
                    x: number;
                    y: number;
                    width: number;
                    height: number;
                };
            }>;
        };
    }): string;
    getStatus(): {
        isRunning: boolean;
        config: BrowserViewerConfig;
        url: string;
    };
}
declare const allogBrowserViewer: AllogBrowserViewer;
export { AllogBrowserViewer };
export default allogBrowserViewer;
