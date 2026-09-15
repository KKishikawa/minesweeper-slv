import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { startBrowserHarness } from './harness.js';
import type { BrowserHarness } from './harness.js';

describe('startup smoke', () => {
  let harness: BrowserHarness;
  let browser: Browser;
  let page: Page;
  beforeAll(async () => {
    harness = await startBrowserHarness();
    browser = harness.browser;
    page = await browser.newPage();
  });
  afterAll(async () => { await page?.close(); await harness?.close(); });
  it('日本語見出しを表示しページエラーがない', async () => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(harness.baseUrl);
    expect(await page.locator('h1').textContent()).toBe('マインスイーパー ソルバー');
    expect(errors).toEqual([]);
  });
});
