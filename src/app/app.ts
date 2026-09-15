export function mountApp(root: HTMLElement): void {
  const heading = document.createElement('h1');
  heading.textContent = 'マインスイーパー ソルバー';
  root.replaceChildren(heading);
}
