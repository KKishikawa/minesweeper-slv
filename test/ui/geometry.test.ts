import { expect, it } from 'vitest';
import { hitTest } from '../../src/ui/board-renderer';
it('maps CSS coordinates to cells with exclusive right and bottom edges', () => {
  expect(hitTest(24, 0, 24, 2, 1)).toBe(1);
  expect(hitTest(48, 0, 24, 2, 1)).toBeNull();
  expect(hitTest(0, 24, 24, 2, 1)).toBeNull();
  expect(hitTest(-1, 0, 24, 2, 1)).toBeNull();
  expect(hitTest(NaN, 0, 24, 2, 1)).toBeNull();
});
