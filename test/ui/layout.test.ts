import { expect, it } from 'vitest';
import { computeLayout } from '../../src/ui/layout';
it('uses a right sidebar only when cells stay at least 24 CSS pixels', () => {
  expect(computeLayout(1032, 30)).toEqual({ placement: 'right', cellSize: 24 });
  expect(computeLayout(1031, 30)).toEqual({ placement: 'below', cellSize: 34 });
  expect(computeLayout(912, 30)).toEqual({ placement: 'below', cellSize: 30 });
  expect(computeLayout(912, 9)).toEqual({ placement: 'right', cellSize: 40 });
});
