import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { release } from 'node:os';
import { startBrowserHarness } from '../../test/browser/harness';

const output = process.env.INPUT_EVIDENCE_DIR ?? 'test/artifacts/issue-24/current';
const harness = await startBrowserHarness(true);
try {
  await mkdir(output, { recursive: true });
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 800 }, { width: 960, height: 1080 }]) {
    for (const columns of [9, 30]) {
      const context = await harness.browser.newContext({ viewport, recordVideo: { dir: output, size: viewport } });
      const page = await context.newPage();
      await page.addInitScript({ content: await readFile('scripts/ui/input-probe.js', 'utf8') });
      await page.goto(harness.baseUrl);
      await page.getByLabel('幅', { exact: true }).fill(String(columns));
      await page.getByLabel('高さ', { exact: true }).fill(String(columns === 30 ? 16 : 9));
      await page.getByLabel('総地雷数', { exact: true }).fill(String(columns === 30 ? 99 : 10));
      await page.getByRole('button', { name: '盤面を作成', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.result-card')?.getAttribute('data-phase') !== 'solving');
      await page.getByRole('gridcell').first().focus();
      // Exclude setup and intentional focus scrolling from the input window.
      await page.waitForTimeout(100);
      await page.evaluate(() => (window as any).inputProbe.reset());
      // Valid edits, contradictions, recovery, navigation, and rapid input.
      for (const key of ['0', 'Delete', 'f', 'Delete', '1', 'Delete', 'ArrowRight', '0', 'Delete']) {
        await page.keyboard.press(key);
        await page.waitForTimeout(100);
      }
      for (const key of ['f', 'Delete', '0', 'Delete', '1', 'Delete']) await page.keyboard.press(key);
      await page.waitForTimeout(300);
      const report = await page.evaluate(() => (window as any).inputProbe.report());
      await page.screenshot({ path: `${output}/${viewport.width}-${columns}.png`, fullPage: true });
      const video = page.video();
      await context.close();
      await video?.saveAs(`${output}/${viewport.width}-${columns}.webm`);
      await video?.delete();
      const events = report.events as any[];
      const frames = events.filter(event => event.type === 'frame');
      const range = (values: number[]) => [Math.min(...values), Math.max(...values)];
      const summary = { viewport, columns, keys: events.filter(e => e.type === 'key').length,
        boardDraws: events.filter(e => e.type === 'draw' && e.canvas === 'board').length,
        legendDraws: events.filter(e => e.type === 'draw' && e.canvas !== 'board').length,
        canvasSizeWrites: events.filter(e => e.type === 'canvas-size').length,
        redundantSizeWrites: events.filter(e => e.type === 'canvas-size' && e.before === e.after).length,
        pageHeight: range(frames.map(e => e.pageHeight)), resultHeight: range(frames.map(e => e.result.height)),
        scrollY: range(frames.map(e => e.scrollY)), layoutShifts: events.filter(e => e.type === 'layout-shift').length };
      await writeFile(`${output}/${viewport.width}-${columns}.json`, JSON.stringify({
        commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
        sourceDiff: execFileSync('git', ['diff', '--', 'src'], { encoding: 'utf8' }),
        date: new Date().toISOString(), platform: process.platform, os: release(), browser: harness.browser.version(), summary, ...report,
      }, null, 2));
      console.log(JSON.stringify(summary));
    }
  }
} finally { await harness.close(); }
