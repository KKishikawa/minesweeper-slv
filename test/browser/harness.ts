import { chromium } from 'playwright';
import type { Browser } from 'playwright';
import { createServer, preview } from 'vite';
import type { ViteDevServer, PreviewServer } from 'vite';
import type { AddressInfo } from 'node:net';

export interface BrowserHarness {
  baseUrl: string;
  browser: Browser;
  server: ViteDevServer | PreviewServer;
  close(): Promise<void>;
}

export async function startBrowserHarness(production = false): Promise<BrowserHarness> {
  const server = production
    ? await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: false } })
    : await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false } });
  if ('listen' in server) await server.listen();
  const address = server.httpServer?.address() as AddressInfo | null;
  if (!address) { await server.close(); throw new Error('Vite server did not start'); }
  let browser: Browser;
  try { browser = await chromium.launch(); }
  catch (error) { await server.close(); throw error; }
  return { baseUrl: `http://127.0.0.1:${address.port}`, browser, server,
    async close() { try { await browser.close(); } finally { await server.close(); } } };
}
