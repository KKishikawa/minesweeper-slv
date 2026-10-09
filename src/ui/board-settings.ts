export function mountBoardSettings(root: HTMLElement, onCreate: (width: number, height: number, totalMines: number) => void): { dispose(): void } {
  const form = document.createElement('form');
  form.className = 'board-settings'; form.noValidate = true;
  const inputs = ['幅', '高さ', '総地雷数'].map((labelText, index) => {
    const label = document.createElement('label'); label.textContent = labelText;
    const input = document.createElement('input'); input.type = 'number'; input.step = '1';
    input.min = index === 2 ? '0' : '1'; input.max = index === 2 ? '900' : '30';
    input.value = index === 2 ? '10' : '9'; input.required = true;
    label.append(input); form.append(label); return input;
  });
  const button = document.createElement('button'); button.type = 'submit'; button.textContent = '盤面を作成';
  const error = document.createElement('p'); error.setAttribute('role', 'alert'); error.className = 'field-error';
  form.append(button, error); root.append(form);
  const submit = (event: SubmitEvent) => {
    event.preventDefault(); error.textContent = '';
    inputs.forEach(input => input.removeAttribute('aria-invalid'));
    const [width, height, totalMines] = inputs.map(input => input.value.trim() ? Number(input.value) : NaN) as [number, number, number];
    for (let index = 0; index < inputs.length; index++) {
      const value = [width, height, totalMines][index]!;
      const min = index === 2 ? 0 : 1;
      const max = index === 2 ? width * height : 30;
      if (!Number.isInteger(value) || value < min || value > max) {
        inputs[index]!.setAttribute('aria-invalid', 'true'); inputs[index]!.focus();
        error.textContent = index === 2 ? '総地雷数は0〜セル数の整数で入力してください。' : '幅と高さは1〜30の整数で入力してください。';
        return;
      }
    }
    onCreate(width, height, totalMines);
  };
  form.addEventListener('submit', submit);
  return { dispose() { form.removeEventListener('submit', submit); form.remove(); } };
}
