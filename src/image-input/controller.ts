import type { PixelImage } from "../recognition/types.js";
import { selectImage } from "./files.js";
import {
  ImageInputError, type DisplaySession, type DisplayStatus, type FileSource,
  type ImageErrorCode, type ImageInputAdapter, type ImageInputController,
  type ImageInputState, type ImageSource,
} from "./types.js";

export function createImageInputController(adapter: ImageInputAdapter): ImageInputController {
  let state: ImageInputState = {
    phase: "empty", image: null, imageResult: null,
    sharing: "idle", displayResult: null, muted: false,
  };
  let disposed = false;
  let imageGeneration = 0;
  let shareGeneration = 0;
  let revision = 0;
  let pendingSource: ImageSource | null = null;
  let shareAbort: AbortController | undefined;
  let session: DisplaySession | undefined;
  let unsubscribeSession: (() => void) | undefined;
  const listeners = new Set<(state: ImageInputState) => void>();

  function getState(): ImageInputState { return { ...state }; }
  function update(next: Partial<ImageInputState>) {
    state = { ...state, ...next };
    for (const listener of listeners) listener(getState());
  }
  function imageCurrent(generation: number): boolean {
    return !disposed && imageGeneration === generation;
  }
  function shareCurrent(generation: number): boolean {
    return !disposed && shareGeneration === generation;
  }
  function beginImage(source: ImageSource): number {
    const generation = ++imageGeneration;
    pendingSource = source;
    update({ phase: "loading", imageResult: null });
    return generation;
  }
  function finishImage(generation: number, image: PixelImage, source: ImageSource, multiple = false) {
    if (!imageCurrent(generation)) return;
    pendingSource = null;
    update({
      phase: "ready", image: { image, source, revision: ++revision },
      imageResult: multiple ? "multiple" : "success",
    });
  }
  function failImage(generation: number, error: unknown) {
    if (!imageCurrent(generation)) return;
    pendingSource = null;
    update({ phase: state.image === null ? "empty" : "ready", imageResult: errorCode(error, "read-failed") });
  }
  function errorCode(error: unknown, fallback: ImageErrorCode): ImageErrorCode {
    return error instanceof ImageInputError ? error.code : fallback;
  }
  function releaseSharing() {
    // Invalidate before abort/dispose: either may synchronously emit ended.
    ++shareGeneration;
    const previousAbort = shareAbort;
    const previousSession = session;
    const previousUnsubscribe = unsubscribeSession;
    shareAbort = undefined;
    session = undefined;
    unsubscribeSession = undefined;
    previousUnsubscribe?.();
    previousAbort?.abort();
    previousSession?.dispose();
    if (pendingSource === "display") {
      ++imageGeneration;
      pendingSource = null;
      state = { ...state, phase: state.image === null ? "empty" : "ready", imageResult: "stopped" };
    }
  }
  function observeStatus(generation: number, status: DisplayStatus) {
    if (!shareCurrent(generation)) return;
    if (status.ended) {
      releaseSharing();
      update({ sharing: "ended", displayResult: "stopped", muted: false });
    } else {
      update({ muted: status.muted });
    }
  }
  function clearImage() {
    ++imageGeneration;
    pendingSource = null;
    update({ phase: "empty", image: null, imageResult: null });
  }
  function reset() {
    ++imageGeneration;
    pendingSource = null;
    releaseSharing();
    update({ phase: "empty", image: null, imageResult: null, sharing: "idle", displayResult: null, muted: false });
  }

  return {
    getState,
    subscribe(listener) {
      if (!disposed) listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async importFiles(files: readonly Blob[], source: FileSource) {
      if (disposed) return;
      const generation = beginImage(source);
      if (!imageCurrent(generation)) return;
      try {
        if (!adapter.supportsFiles) throw new ImageInputError("unsupported");
        const selected = await selectImage(files);
        if (!imageCurrent(generation)) return;
        const image = await adapter.decode(selected.blob);
        finishImage(generation, image, source, selected.count > 1);
      } catch (error) {
        failImage(generation, error);
      }
    },
    async startDisplay() {
      if (disposed || state.sharing === "requesting" || state.sharing === "active") return;
      const generation = ++shareGeneration;
      const abort = new AbortController();
      shareAbort = abort;
      update({ sharing: "requesting", displayResult: null, muted: false });
      if (!shareCurrent(generation)) return;
      try {
        if (!adapter.supportsDisplay) throw new ImageInputError("unsupported");
        // Invoke synchronously in the caller's activation stack, before any await.
        const started = adapter.startDisplay(abort.signal);
        const acquired = await started;
        if (!shareCurrent(generation)) { acquired.dispose(); return; }
        session = acquired;
        unsubscribeSession = acquired.subscribe((status) => observeStatus(generation, status));
        if (!shareCurrent(generation)) { unsubscribeSession?.(); unsubscribeSession = undefined; return; }
        update({ sharing: "active" });
        if (shareCurrent(generation)) observeStatus(generation, acquired.getStatus());
      } catch (error) {
        if (!shareCurrent(generation)) return;
        releaseSharing();
        update({ sharing: "idle", displayResult: errorCode(error, "capture-failed"), muted: false });
      }
    },
    async captureDisplay() {
      if (disposed || state.sharing !== "active" || session === undefined) return;
      const capturedSession = session;
      const generation = beginImage("display");
      if (!imageCurrent(generation)) return;
      try {
        const image = await capturedSession.capture();
        finishImage(generation, image, "display");
      } catch (error) {
        failImage(generation, error);
      }
    },
    stopDisplay() {
      if (disposed || (shareAbort === undefined && session === undefined)) return;
      const requesting = state.sharing === "requesting";
      releaseSharing();
      update({ sharing: requesting ? "idle" : "ended", displayResult: requesting ? "cancelled" : "stopped", muted: false });
    },
    clear() { if (!disposed) clearImage(); },
    suspend() { if (!disposed) reset(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      reset();
      listeners.clear();
    },
  };
}
