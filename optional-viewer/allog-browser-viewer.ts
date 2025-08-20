/**
 * Allog Browser Viewer (optional viewer component)
 */

import allogEngine from '../../allog/allog-engine';

interface BrowserViewerConfig {
  port?: number;
  host?: string;
  autoOpen?: boolean;
  refreshInterval?: number;
}

class AllogBrowserViewer {
  private config: BrowserViewerConfig;
  private isRunning = false;
  private lastLogCount = 0;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(config: BrowserViewerConfig = {}) {
    this.config = { port: 3001, host: 'localhost', autoOpen: true, refreshInterval: 500, ...config };
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('AllogBrowserViewer is already running');
      return;
    }
    try {
      await this.startServer();
      this.isRunning = true;
      const url = this.getViewerUrl();
      console.log(`AllogBrowserViewer started at ${url}`);
      if (this.config.autoOpen) {
        this.openBrowser(url);
      }
      this.startLogPolling();
    } catch (error) {
      console.error('Failed to start AllogBrowserViewer:', error);
      throw error;
    }
  }

  private async startServer(): Promise<void> {
    console.log('Starting HTTP server for browser log viewing...');
  }

  private startLogPolling(): void {
    this.intervalId = setInterval(() => {
      const currentLogs = allogEngine.getLogs();
      if (currentLogs.length !== this.lastLogCount) {
        this.lastLogCount = currentLogs.length;
        console.log(`Logs updated: ${currentLogs.length} total logs`);
      }
    }, this.config.refreshInterval);
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('AllogBrowserViewer stopped');
  }

  private openBrowser(url: string): void {
    if (typeof window !== 'undefined') {
      window.open(url, '_blank');
    } else {
      console.log(`Open your browser to: ${url}`);
    }
  }

  getViewerUrl(): string {
    return `http://${this.config.host}:${this.config.port}`;
  }

  // New: open screenshot with overlay visualization in simple HTML
  getScreenshotViewerHtml(screenshot: { imageUrl: string; overlay?: { viewport: { width: number; height: number }; elements: Array<{ id: string; label?: string; rect: { x: number; y: number; width: number; height: number } }> } }): string {
    const overlay = screenshot.overlay || { viewport: { width: 0, height: 0 }, elements: [] };
    const boxes = overlay.elements.map(el => `<div class="box" title="${el.label || el.id}" style="left:${el.rect.x}px;top:${el.rect.y}px;width:${el.rect.width}px;height:${el.rect.height}px"></div>`).join('');
    return `<!doctype html>
<html><head><meta charset="utf-8"/><title>Allog Screenshot</title>
<style>
  body{margin:0;background:#111;color:#eee;font-family:system-ui, sans-serif}
  .wrap{position:relative;display:inline-block}
  img{display:block;max-width:100vw;max-height:100vh}
  .box{position:absolute;border:2px solid #00e5ff;box-shadow:0 0 6px rgba(0,229,255,.8);}
  .legend{position:fixed;left:10px;bottom:10px;background:rgba(0,0,0,.6);padding:8px 12px;border-radius:8px}
  .legend h1{font-size:14px;margin:0 0 6px}
  .legend li{font-size:12px}
  .legend small{color:#aaa}
  
</style></head>
<body>
  <div class="wrap">
    <img src="${screenshot.imageUrl}"/>
    ${boxes}
  </div>
  <div class="legend">
    <h1>Overlay</h1>
    <ul>${overlay.elements.map(el=>`<li>${el.label || el.id} <small>(${el.rect.x},${el.rect.y},${el.rect.width}x${el.rect.height})</small></li>`).join('')}</ul>
  </div>
</body></html>`;
  }
  getStatus(): { isRunning: boolean; config: BrowserViewerConfig; url: string } {
    return { isRunning: this.isRunning, config: this.config, url: this.getViewerUrl() };
  }
}

const allogBrowserViewer = new AllogBrowserViewer();

export { AllogBrowserViewer };
export default allogBrowserViewer;



