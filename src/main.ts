import { mountApp } from './app/app.js';
import './app/style.css';

const root = document.querySelector<HTMLElement>('#app');
if (root) {
  try { mountApp(root); }
  catch (error) {
    root.replaceChildren();
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = `起動できませんでした: ${error instanceof Error ? error.message : String(error)}`;
    root.append(message);
  }
}
