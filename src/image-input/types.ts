import type { PixelImage } from "../recognition/types.js";

export type ImageSource = "file" | "paste" | "drop" | "display";
export type FileSource = Exclude<ImageSource, "display">;
export type ImageErrorCode =
  | "cancelled" | "stopped" | "permission-declined" | "unsupported"
  | "source-unavailable" | "activation-required" | "capture-failed" | "read-failed"
  | "unsupported-format" | "no-image" | "too-large";

export class ImageInputError extends Error {
  constructor(readonly code: ImageErrorCode) {
    super(code);
    this.name = "ImageInputError";
  }
}

export interface DisplayStatus {
  ended: boolean;
  muted: boolean;
}

export interface DisplaySession {
  getStatus(): DisplayStatus;
  subscribe(listener: (status: DisplayStatus) => void): () => void;
  capture(): Promise<PixelImage>;
  dispose(): void;
}

export interface ImageInputAdapter {
  supportsFiles: boolean;
  supportsDisplay: boolean;
  decode(blob: Blob): Promise<PixelImage>;
  startDisplay(signal: AbortSignal): Promise<DisplaySession>;
}

export interface AcquiredImage {
  image: PixelImage;
  source: ImageSource;
  revision: number;
}

export interface ImageInputState {
  phase: "empty" | "loading" | "ready";
  image: AcquiredImage | null;
  imageResult: ImageErrorCode | "success" | "multiple" | null;
  sharing: "idle" | "requesting" | "active" | "ended";
  displayResult: ImageErrorCode | null;
  muted: boolean;
}

export interface ImageInputController {
  getState(): ImageInputState;
  subscribe(listener: (state: ImageInputState) => void): () => void;
  importFiles(files: readonly Blob[], source: FileSource): Promise<void>;
  startDisplay(): Promise<void>;
  captureDisplay(): Promise<void>;
  stopDisplay(): void;
  clear(): void;
  suspend(): void;
  dispose(): void;
}
