import { afterAll, beforeAll, expect, it } from 'vitest';
import type { BrowserHarness } from './harness';
import { startBrowserHarness } from './harness';

let harness: BrowserHarness;
beforeAll(async () => { harness = await startBrowserHarness(); });
afterAll(async () => { await harness?.close(); });

it('defaults to keyboard input on desktop and resumes without changing observations', async () => {
  const page = await harness.browser.newPage(); page.setDefaultTimeout(3000);
  try {
    await page.goto(`${harness.baseUrl}/test/browser/editor.fixture.html`);
    const cell = page.getByRole('gridcell').first();
    await cell.focus(); await page.keyboard.press('3');
    const before = await page.evaluate(() => (window as any).inspection);
    await page.getByLabel('幅', { exact: true }).focus();
    await cell.click();
    expect(await page.evaluate(() => (window as any).inspection)).toEqual(before);
    expect(await cell.evaluate(el => el === document.activeElement)).toBe(true);
    expect(await page.getByLabel('キーボード中心', { exact: true }).isChecked()).toBe(true);
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('f');
    expect(await page.getByRole('gridcell').nth(1).getAttribute('aria-label')).toContain('入力旗');
    const after = await page.evaluate(() => (window as any).inspection);
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => (window as any).inspection)).toEqual(after);
  } finally { await page.close(); }
});

it.each(['mouse', 'touch'] as const)('inputs every palette value through %s and allows manual override', async method => {
  const context = await harness.browser.newContext({ hasTouch: method === 'touch', viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); page.setDefaultTimeout(3000);
  try {
    await page.goto(`${harness.baseUrl}/test/browser/editor.fixture.html`);
    const pointerMode = page.getByLabel('クリック・タップ中心', { exact: true });
    const keyboardMode = page.getByLabel('キーボード中心', { exact: true });
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(method === 'touch');
    if (method === 'mouse') await pointerMode.check();
    expect(await pointerMode.isChecked()).toBe(true);
    const cell = page.getByRole('gridcell').first();
    for (const label of ['空き', '旗', '1', '2', '3', '4', '5', '6', '7', '8', '閉じる']) {
      const palette = page.getByRole('button', { name: label, exact: true });
      if (method === 'touch') { await palette.tap(); await cell.tap(); }
      else { await palette.click(); await cell.click(); }
      const value = await page.evaluate(() => (window as any).inspection.state.board.cells[0].value);
      expect(value).toBe(label === '空き' ? 0 : label === '旗' ? 'flag' : label === '閉じる' ? 'closed' : Number(label));
    }
    await keyboardMode.check();
    const before = await page.evaluate(() => (window as any).inspection);
    if (method === 'touch') await cell.tap(); else await cell.click();
    expect(await page.evaluate(() => (window as any).inspection)).toEqual(before);
    // Board updates and reset must retain the explicit choice.
    await page.getByRole('button', { name: '盤面を作成', exact: true }).click();
    await page.getByRole('button', { name: '盤面をリセット', exact: true }).click();
    expect(await keyboardMode.isChecked()).toBe(true);
    await pointerMode.check();
    await page.getByRole('button', { name: '旗', exact: true }).click();
    await cell.focus(); await page.keyboard.press('Enter');
    expect(await cell.getAttribute('aria-label')).toContain('入力旗');
  } finally { await context.close(); }
});

it.each(['キーボード中心', 'クリック・タップ中心'])('keeps IME and settings input out of editing in %s mode', async mode => {
  const page = await harness.browser.newPage(); page.setDefaultTimeout(3000);
  try {
    await page.goto(`${harness.baseUrl}/test/browser/editor.fixture.html`);
    await page.getByLabel(mode, { exact: true }).check();
    const cell = page.getByRole('gridcell').first();
    await cell.focus(); await page.keyboard.press('1');
    const before = await page.evaluate(() => (window as any).inspection);
    for (const key of ['f', '2', 'ArrowRight', 'Enter']) {
      expect(await cell.evaluate((el, key) => {
        const event = new KeyboardEvent('keydown', { key, isComposing: true, bubbles: true, cancelable: true });
        el.dispatchEvent(event); return event.defaultPrevented;
      }, key)).toBe(false);
    }
    await page.getByLabel('幅', { exact: true }).fill('2');
    expect(await page.evaluate(() => (window as any).inspection)).toEqual(before);
  } finally { await page.close(); }
});
