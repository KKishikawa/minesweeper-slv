import { vi } from "vitest";

// Browser resource boundaries are injected because the unit suite runs in Node.
export function fakeBitmap(width = 2, height = 1) {
  const close = vi.fn();
  const bitmap = { width, height, close } as unknown as ImageBitmap;
  return { bitmap, close };
}

export function fakeCanvas(data = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 128])) {
  const drawImage = vi.fn();
  const getImageData = vi.fn(() => ({ data }) as ImageData);
  const context = { drawImage, getImageData } as unknown as CanvasRenderingContext2D;
  const getContext = vi.fn<() => CanvasRenderingContext2D | null>(() => context);
  const canvas = { width: 300, height: 150, getContext } as unknown as HTMLCanvasElement;
  const createCanvas = vi.fn(() => canvas);
  return { canvas, context, createCanvas, getContext, drawImage, getImageData, data };
}

export function pngHeader(): Blob {
  return new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]);
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

export function pixelImage(value = 1): import("../../src/recognition/types.js").PixelImage {
  return { width: 1, height: 1, data: new Uint8ClampedArray([value, 2, 3, 255]) };
}

export function fakeDisplaySession() {
  type Status = import("../../src/image-input/types.js").DisplayStatus;
  const listeners = new Set<(status: Status) => void>();
  let status: Status = { ended: false, muted: false };
  const capture = vi.fn(async () => pixelImage());
  const dispose = vi.fn(() => {
    status = { ...status, ended: true };
    for (const listener of listeners) listener({ ...status });
    listeners.clear();
  });
  const session: import("../../src/image-input/types.js").DisplaySession = {
    getStatus: () => ({ ...status }),
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    capture,
    dispose,
  };
  return {
    session, capture, dispose,
    update(next: Status) {
      status = next;
      for (const listener of listeners) listener({ ...status });
    },
    listenerCount: () => listeners.size,
  };
}
