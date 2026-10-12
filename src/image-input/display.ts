import type { PixelImage } from "../recognition/types.js";
import { readPixels, type BrowserBindings } from "./browser.js";
import { ImageInputError, type DisplaySession, type DisplayStatus, type ImageErrorCode } from "./types.js";

function displayError(error: unknown): ImageInputError {
  const name = error instanceof Error ? error.name : "";
  const codes: Record<string, ImageErrorCode> = {
    NotAllowedError: "permission-declined",
    NotSupportedError: "unsupported",
    NotFoundError: "source-unavailable",
    InvalidStateError: "activation-required",
  };
  return new ImageInputError(Object.hasOwn(codes, name) ? codes[name]! : "capture-failed");
}

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

export function startDisplaySession(signal: AbortSignal, bindings: BrowserBindings): Promise<DisplaySession> {
  if (signal.aborted) return Promise.reject(new ImageInputError("cancelled"));
  if (!bindings.secureContext || bindings.getDisplayMedia === null) {
    return Promise.reject(new ImageInputError("unsupported"));
  }
  const getDisplayMedia = bindings.getDisplayMedia;

  // The executor invokes the browser API in the caller's activation stack.
  return new Promise<DisplaySession>((resolve, reject) => {
    let stream: MediaStream | undefined;
    let track: MediaStreamTrack | undefined;
    let video: HTMLVideoElement | undefined;
    let released = false;
    let settled = false;
    let played = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const preparationEvents: Array<() => void> = [];
    const lifetimeEvents: Array<() => void> = [];
    const listeners = new Set<(status: DisplayStatus) => void>();

    function listen(target: EventTarget, event: string, handler: () => void, removers: Array<() => void>) {
      target.addEventListener(event, handler);
      removers.push(() => target.removeEventListener(event, handler));
    }
    function clearPreparation() {
      if (timeout !== undefined) { clearTimeout(timeout); timeout = undefined; }
      for (const remove of preparationEvents.splice(0)) remove();
    }
    function getStatus(): DisplayStatus {
      return { ended: released || track?.readyState === "ended", muted: track?.muted ?? false };
    }
    function notify() {
      const status = getStatus();
      for (const listener of listeners) listener({ ...status });
    }
    function release() {
      if (released) return;
      released = true;
      clearPreparation();
      signal.removeEventListener("abort", abort);
      for (const remove of lifetimeEvents.splice(0)) remove();
      if (stream) stopStream(stream);
      if (video) { video.pause(); video.srcObject = null; }
      notify();
      listeners.clear();
    }
    function fail(error: ImageInputError) {
      release();
      if (!settled) { settled = true; reject(error); }
    }
    function abort() { fail(new ImageInputError("cancelled")); }
    function currentFrameReady(): boolean {
      return video !== undefined && video.readyState >= 2
        && Number.isSafeInteger(video.videoWidth) && video.videoWidth > 0
        && Number.isSafeInteger(video.videoHeight) && video.videoHeight > 0
        && track?.readyState === "live" && !track.muted;
    }
    const session: DisplaySession = {
      getStatus,
      subscribe(listener) {
        if (!released) listeners.add(listener);
        return () => { listeners.delete(listener); };
      },
      async capture(): Promise<PixelImage> {
        if (released || signal.aborted || track?.readyState !== "live") {
          throw new ImageInputError("stopped");
        }
        if (track.muted || !video || video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) {
          throw new ImageInputError("read-failed");
        }
        // No await: dimensions, draw and readback all use the same current frame.
        return readPixels(video, video.videoWidth, video.videoHeight, bindings.createCanvas);
      },
      dispose: release,
    };
    function checkReady() {
      if (released || settled) return;
      if (signal.aborted) { abort(); return; }
      if (track?.readyState === "ended") { fail(new ImageInputError("stopped")); return; }
      if (played && currentFrameReady()) {
        clearPreparation();
        settled = true;
        resolve(session);
      }
    }
    function updateTrack() { notify(); checkReady(); }

    signal.addEventListener("abort", abort);
    try {
      // Always retain both native completion paths, even after outer cancellation.
      getDisplayMedia({ video: true, audio: false }).then((acquiredStream) => {
        if (released || signal.aborted) { stopStream(acquiredStream); return; }
        stream = acquiredStream;
        timeout = setTimeout(() => fail(new ImageInputError("read-failed")), 10_000);
        try {
          track = stream.getVideoTracks()[0];
          if (!track) { fail(new ImageInputError("read-failed")); return; }
          listen(track, "ended", () => fail(new ImageInputError("stopped")), lifetimeEvents);
          listen(track, "mute", updateTrack, lifetimeEvents);
          listen(track, "unmute", updateTrack, lifetimeEvents);
          video = bindings.createVideo();
          video.muted = true;
          video.playsInline = true;
          video.srcObject = stream;
          for (const event of ["loadeddata", "canplay", "playing", "resize"]) {
            listen(video, event, checkReady, preparationEvents);
          }
          listen(video, "error", () => fail(new ImageInputError("read-failed")), preparationEvents);
          // play may throw or reject; its late completion never reconnects video.
          video.play().then(() => { played = true; checkReady(); }, () => {
            fail(new ImageInputError("read-failed"));
          });
          checkReady();
        } catch {
          fail(new ImageInputError("read-failed"));
        }
      }, (error: unknown) => fail(displayError(error)));
    } catch (error) {
      fail(displayError(error));
    }
  });
}
