import { createBoard, editCell } from '../../src/board/board';
import { createAppState, transition } from '../../src/app/state';
import { mountBoardEditor } from '../../src/ui/board-editor';
import { mountBoardSettings } from '../../src/ui/board-settings';
import '../../src/app/style.css';
let state = { ...createAppState(createBoard(3, 1, 1, 0)), policy: 'reconsidered' as const };
let edits = 0;
let resets = 0;
function update() {
  editor.update(state.board, state.proposal, state.validation);
  Object.assign(window, { inspection: { state, edits, resets } });
}
const editor = mountBoardEditor(document.querySelector('#editor')!, (index, value) => {
  edits++;
  state = transition(state, { type: 'board-changed', board: editCell(state.board, index, value) }).state as typeof state;
  update();
}, () => {
  resets++;
  const { width, height, totalMines, revision } = state.board;
  state = transition(state, { type: 'board-changed', board: createBoard(width, height, totalMines, revision + 1) }).state as typeof state;
  update();
});
mountBoardSettings(document.querySelector('#settings')!, (width, height, totalMines) => {
  state = transition(state, { type: 'board-changed', board: createBoard(width, height, totalMines, state.board.revision + 1) }).state as typeof state;
  update();
});
update();
