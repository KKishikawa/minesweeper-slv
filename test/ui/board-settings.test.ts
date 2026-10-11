import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createBoard, editCell } from '../../src/board/board';
import { createAppState, transition } from '../../src/app/state';
import type { AppState } from '../../src/app/state';
import { solve } from '../../src/solver/solve';
import { mountBoardSettings } from '../../src/ui/board-settings';

// Only the DOM attributes, tree and events used by this settings component.
// The real submit/update handlers, state transitions and solver remain in use.
class Element extends EventTarget {
  children: Element[] = [];
  value = '';
  textContent = '';
  private attributes = new Map<string, string>();
  constructor(readonly tag: string) { super(); }
  append(...children: Element[]) { this.children.push(...children); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  removeAttribute(name: string) { this.attributes.delete(name); }
  focus() {}
  remove() {}
}
beforeEach(() => { vi.stubGlobal('document', { createElement: (tag: string) => new Element(tag) }); });
afterEach(() => { vi.unstubAllGlobals(); });
function mount() {
  const root = new Element('div');
  const settings = mountBoardSettings(root as unknown as HTMLElement, () => { throw new Error('Invalid form must not create a board'); });
  const form = root.children[0]!;
  const inputs = form.children.filter(child => child.tag === 'label').map(label => label.children[0]!);
  const error = form.children.find(child => child.tag === 'p')!;
  return { settings, form, inputs, error };
}
function complete(state: AppState): AppState {
  if (state.phase !== 'solving') state = transition(state, { type: 'solve' }).state;
  return transition(state, { type: 'response', response: { kind: 'result', requestId: state.activeRequestId!,
    revision: state.board.revision, result: solve(state.board, { maxNodes: 200_000 }) } }).state;
}

// A same-settings early return during explicit restoration leaves draft/error state behind.
it.each(['undo', 'redo'].flatMap(action => [false, true].flatMap(saved => [false, true].map(invalid => ({ action, saved, invalid })))))
  ('synchronizes same-settings $action with saved=$saved and invalid=$invalid', ({ action, saved, invalid }) => {
    const { settings, form, inputs, error } = mount();
    let state = createAppState(createBoard(9, 9, 10, 0));
    if (saved) state = complete(state);
    state = transition(state, { type: 'board-changed', board: editCell(state.board, 0, 0) }).state;
    if (saved) state = complete(state);
    if (action === 'redo') state = transition(state, { type: 'undo' }).state;
    settings.update(state.board);
    inputs[0]!.value = invalid ? '0' : '12'; inputs[1]!.value = '7'; inputs[2]!.value = '20';
    if (invalid) {
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      expect(inputs[0]!.getAttribute('aria-invalid')).toBe('true'); expect(error.textContent).not.toBe('');
    }
    const next = transition(state, { type: action as 'undo' | 'redo' }).state;
    expect(next.history.cursor).not.toBe(state.history.cursor);
    expect(next.restoredResult).toBe(saved);
    settings.update(next.board, true);
    expect(inputs.map(input => input.value)).toEqual(['9', '9', '10']);
    expect(inputs.map(input => input.getAttribute('aria-invalid'))).toEqual([null, null, null]);
    expect(error.textContent).toBe('');
  });

// Forcing every update would erase ordinary drafts/errors and those at no-op history boundaries.
it.each(['render', 'cell edit', 'response', 'undo boundary', 'redo boundary'])('preserves a draft and validation error on %s', action => {
  const { settings, form, inputs, error } = mount();
  let state = createAppState(createBoard(9, 9, 10, 0));
  settings.update(state.board);
  inputs[0]!.value = '0'; inputs[1]!.value = '7'; inputs[2]!.value = '20';
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  if (action === 'cell edit') state = transition(state, { type: 'board-changed', board: editCell(state.board, 0, 0) }).state;
  else if (action === 'response') state = complete(state);
  else if (action.endsWith('boundary')) {
    const next = transition(state, { type: action === 'undo boundary' ? 'undo' : 'redo' }).state;
    expect(next.history.cursor).toBe(state.history.cursor); state = next;
  }
  settings.update(state.board);
  expect(inputs.map(input => input.value)).toEqual(['0', '7', '20']);
  expect(inputs[0]!.getAttribute('aria-invalid')).toBe('true'); expect(error.textContent).not.toBe('');
});
