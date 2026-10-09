export function computeLayout(availableWidth: number, columns: number): { placement: 'right' | 'below'; cellSize: number } {
  const beside = Math.floor((availableWidth - 288 - 24) / columns);
  return beside >= 24 ? { placement: 'right', cellSize: Math.min(40, beside) }
    : { placement: 'below', cellSize: Math.min(40, Math.floor(availableWidth / columns)) };
}
