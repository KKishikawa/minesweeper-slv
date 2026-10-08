import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { startBrowserHarness } from './harness';
import type { BrowserHarness } from './harness';
let harness: BrowserHarness;
let page: Page;
beforeAll(async () => { harness = await startBrowserHarness(); page = await harness.browser.newPage(); page.setDefaultTimeout(3000); });
afterAll(async () => { await harness?.close(); });
const inspect = () => page.evaluate(() => (window as any).inspection);
it('creates a board, supports every keyboard value and keeps focus', async () => {
  await page.goto(`${harness.baseUrl}/test/browser/editor.fixture.html`);
  await page.getByLabel('幅', { exact: true }).fill('3');
  await page.getByLabel('高さ', { exact: true }).fill('2');
  await page.getByLabel('総地雷数', { exact: true }).fill('1');
  await page.getByRole('button', { name: '盤面を作成', exact: true }).click();
  expect(await page.getByRole('gridcell').count()).toBe(6);
  await page.getByRole('button', { name: '旗', exact: true }).click();
  await page.getByRole('gridcell').nth(0).click();
  expect((await inspect()).state.board.cells[0].value).toBe('flag');
  await page.keyboard.press('ArrowRight');
  for (const [key, value] of [['0', 0], ['1', 1], ['2', 2], ['3', 3], ['4', 4], ['5', 5], ['6', 6], ['7', 7], ['8', 8], ['f', 'flag'], ['Delete', 'closed'], ['Space', 0]] as const) {
    await page.keyboard.press(key);
    expect((await inspect()).state.board.cells[1].value).toBe(value);
    expect(await page.getByRole('gridcell').nth(1).evaluate(el => el === document.activeElement)).toBe(true);
  }
  const before = await inspect();
  await page.getByLabel('幅', { exact: true }).fill('0');
  await page.getByRole('button', { name: '盤面を作成', exact: true }).click();
  expect((await inspect()).state.board.revision).toBe(before.state.board.revision);
  expect(await page.locator('[role=alert]').textContent()).toContain('1〜30');
});
it.each(['mouse', 'keyboard'])('resets exactly once through %s and retains settings and policy', async method => {
  await page.goto(`${harness.baseUrl}/test/browser/editor.fixture.html`);
  await page.getByRole('button', { name: '旗', exact: true }).click();
  await page.getByRole('gridcell').nth(0).click();
  const before = await inspect();
  const reset = page.getByRole('button', { name: '盤面をリセット', exact: true });
  if (method === 'mouse') await reset.click();
  else { await reset.focus(); await page.keyboard.press('Enter'); }
  const after = await inspect();
  expect(after.resets).toBe(1);
  expect(after.edits).toBe(before.edits);
  expect(after.state.board.revision).toBe(before.state.board.revision + 1);
  expect(after.state.board.cells.every((cell: any) => cell.value === 'closed' && cell.source === 'manual' && !cell.uncertain)).toBe(true);
  expect(after.state.policy).toBe('reconsidered');
  expect(after.state.board.totalMines).toBe(1);
  expect(after.state.proposal).toBeNull();
});
it('leaves modified browser shortcuts out of board editing', async () => {
  await page.goto(`${harness.baseUrl}/test/browser/editor.fixture.html`);
  await page.getByRole('gridcell').first().focus();
  const before = await inspect();
  for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
    for (const key of ['f', '1', '0', 'Delete', 'ArrowRight']) {
      const prevented = await page.getByRole('gridcell').first().evaluate((element, data) => {
        const event = new KeyboardEvent('keydown', { ...data, bubbles: true, cancelable: true });
        element.dispatchEvent(event);
        return event.defaultPrevented;
      }, { key, ...modifiers });
      expect(prevented, `${key}/${JSON.stringify(modifiers)}`).toBe(false);
      expect((await inspect()).state.board).toEqual(before.state.board);
      expect((await inspect()).edits).toBe(before.edits);
    }
  }
});
