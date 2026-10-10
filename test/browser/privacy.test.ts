import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { startBrowserHarness } from './harness';
import type { BrowserHarness } from './harness';

let harness: BrowserHarness;
beforeAll(async () => { harness = await startBrowserHarness(); });
afterAll(async () => { await harness?.close(); });

it('opens privacy details on demand and restores focus without changing the board', async () => {
  const page = await harness.browser.newPage();
  page.setDefaultTimeout(2000);
  await page.goto(harness.baseUrl);
  await page.getByRole('gridcell').first().focus();
  await page.keyboard.press('1');
  const observation = await page.getByRole('gridcell').first().getAttribute('aria-label');
  const trigger = page.getByRole('button', { name: /端末内で解析/ });
  const dialog = page.getByRole('dialog', { name: '通信・保存・不具合報告' });
  expect(await dialog.isVisible()).toBe(false);
  await trigger.click();
  expect(await dialog.isVisible()).toBe(true);
  expect(await dialog.getByRole('link', { name: 'GitHub Issue', exact: true }).isVisible()).toBe(true);
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  expect(await dialog.isVisible()).toBe(false);
  expect(await trigger.evaluate(button => document.activeElement === button)).toBe(true);
  expect(await page.getByRole('gridcell').first().getAttribute('aria-label')).toBe(observation);
  await page.close();
});

it('supports keyboard opening and Escape dismissal with readable details on a narrow screen', async () => {
  const page = await harness.browser.newPage({ viewport: { width: 375, height: 667 } });
  page.setDefaultTimeout(2000);
  await page.goto(harness.baseUrl);
  const trigger = page.getByRole('button', { name: /端末内で解析/ });
  const dialog = page.getByRole('dialog', { name: '通信・保存・不具合報告' });
  await page.keyboard.press('Tab');
  expect(await trigger.evaluate(button => document.activeElement === button)).toBe(true);
  await page.keyboard.press('Enter');
  expect(await dialog.isVisible()).toBe(true);
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(667);
  await mkdir('test/artifacts/issue-33', { recursive: true });
  await page.screenshot({ path: 'test/artifacts/issue-33/privacy-narrow.png' });
  await page.keyboard.press('Escape');
  expect(await dialog.isVisible()).toBe(false);
  expect(await trigger.evaluate(button => document.activeElement === button)).toBe(true);
  await page.keyboard.press('Space');
  expect(await dialog.isVisible()).toBe(true);
  await page.keyboard.press('Escape');
  await page.close();
});
