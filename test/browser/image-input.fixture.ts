import { mountApp } from '../../src/app/app';
import { createModuleSolverWorker } from '../../src/app/solver-client';
import { createBrowserImageAdapter } from '../../src/image-input/browser';
import '../../src/app/style.css';

const source = document.createElement('canvas');
source.width = 4; source.height = 3;
const context = source.getContext('2d')!;
context.fillStyle = '#ff0000'; context.fillRect(0, 0, 4, 3);
const stream = source.captureStream(0);
const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
let resolveSelection: ((stream: MediaStream) => void) | undefined;
const mode = new URLSearchParams(location.search).get('mode');
const adapter = createBrowserImageAdapter({ getDisplayMedia: mode === 'unsupported' ? null : (constraints) => {
  if (constraints.video !== true || constraints.audio !== false) throw new Error('Unexpected sharing constraints');
  if (mode === 'pending') return new Promise(resolve => { resolveSelection = resolve; });
  return Promise.resolve(stream);
} });
const solverRequests: number[] = [];
const app = mountApp(document.querySelector<HTMLElement>('#app')!, {
  imageInputAdapter: adapter,
  workerFactory: () => {
    const worker = createModuleSolverWorker();
    const postMessage = worker.postMessage.bind(worker);
    worker.postMessage = request => { solverRequests.push(request.requestId); postMessage(request); };
    return worker;
  },
});

window.imageFixture = {
  solverRequests() { return [...solverRequests]; },
  send(color = '#ff0000', width = source.width, height = source.height) {
    source.width = width; source.height = height;
    context.fillStyle = color; context.fillRect(0, 0, width, height); track.requestFrame();
  },
  finishSelection() { resolveSelection?.(stream); },
  externalStop() { track.stop(); track.dispatchEvent(new Event('ended')); },
  trackState() { return track.readyState; },
  trackLabel() { return track.label; },
  dispose() { app.dispose(); },
  preview(sample = false) {
    const canvas = document.querySelector<HTMLCanvasElement>('.image-preview')!;
    return { width: canvas.width, height: canvas.height, pixels: canvas.width && canvas.height
      ? Array.from(canvas.getContext('2d')!.getImageData(0, 0, sample ? 1 : canvas.width, sample ? 1 : canvas.height).data) : [] };
  },
  async image(type: string) {
    const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 3;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 4, 3);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), type));
    return { type: blob.type, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
  },
  transfer(target: string, kind: 'paste' | 'drop' | 'dragover', files: Array<{ type: string; bytes: number[] }>, text = '') {
    const data = new DataTransfer();
    for (const file of files) data.items.add(new File([new Uint8Array(file.bytes)], 'private-image', { type: file.type }));
    if (text) { data.setData('text/plain', text); data.setData('text/html', `<img src="${text}">`); }
    const event = kind === 'paste' ? new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
      : new DragEvent(kind, { dataTransfer: data, bubbles: true, cancelable: true });
    document.querySelector(target)!.dispatchEvent(event); return event.defaultPrevented;
  },
};
declare global { interface Window { imageFixture: {
  solverRequests(): number[];
  send(color?: string, width?: number, height?: number): void;
  finishSelection(): void; externalStop(): void; trackState(): string; trackLabel(): string; dispose(): void;
  preview(sample?: boolean): { width: number; height: number; pixels: number[] };
  image(type: string): Promise<{ type: string; bytes: number[] }>;
  transfer(target: string, kind: 'paste' | 'drop' | 'dragover', files: Array<{ type: string; bytes: number[] }>, text?: string): boolean;
} } }
