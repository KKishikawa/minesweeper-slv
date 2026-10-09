import type { AppState } from '../app/state';
export function statusText(state: AppState): string {
  switch (state.phase) {
    case 'editing': return '盤面を入力してください';
    case 'needs-review': return '入力を確認してください';
    case 'inconsistent': return '盤面に矛盾があります';
    case 'solving': return '解析中';
    case 'guess-required': return '推測が必要です';
    case 'limit-reached': return '探索上限に達しました';
    case 'error': return '解析に失敗しました';
    case 'solved': return state.proposal && (state.proposal.safe.length || state.proposal.mines.length)
      ? '確定した手があります' : '盤面の確認が完了しました';
  }
}
