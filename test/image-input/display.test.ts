import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserImageAdapter, type BrowserBindings } from "../../src/image-input/browser.js";
import { startDisplaySession } from "../../src/image-input/display.js";
import { fakeCanvas, fakeBitmap, pngHeader } from "./helpers.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

class TrackedEvents extends EventTarget {
  readonly handlers = new Map<string, Set<EventListenerOrEventListenerObject>>();
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    if (listener) {
      const handlers = this.handlers.get(type) ?? new Set();
      handlers.add(listener);
      this.handlers.set(type, handlers);
    }
    super.addEventListener(type, listener, options);
  }
  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
    if (listener) this.handlers.get(type)?.delete(listener);
    super.removeEventListener(type, listener, options);
  }
  get listenerCount() { return [...this.handlers.values()].reduce((n, set) => n + set.size, 0); }
  emit(type: string) { this.dispatchEvent(new Event(type)); }
}

class FakeTrack extends TrackedEvents {
  readyState: MediaStreamTrackState = "live";
  muted = false;
  readonly stop = vi.fn(() => { this.readyState = "ended"; }); // Native stop does not fire ended.
}
class FakeVideo extends TrackedEvents {
  readyState = 2;
  videoWidth = 2;
  videoHeight = 1;
  muted = false;
  playsInline = false;
  srcObject: MediaProvider | null = null;
  readonly play = vi.fn(() => Promise.resolve());
  readonly pause = vi.fn();
}
function fixture() {
  const selection = deferred<MediaStream>();
  const track = new FakeTrack();
  const audio = new FakeTrack();
  const stream = {
    getTracks: () => [track, audio] as unknown as MediaStreamTrack[],
    getVideoTracks: () => [track] as unknown as MediaStreamTrack[],
  } as MediaStream;
  const video = new FakeVideo();
  const canvas = fakeCanvas();
  const controller = new AbortController();
  const removeAbort = vi.spyOn(controller.signal, "removeEventListener");
  const bindings: BrowserBindings = {
    createBitmap: null, createCanvas: canvas.createCanvas,
    createVideo: vi.fn(() => video as unknown as HTMLVideoElement),
    getDisplayMedia: vi.fn(() => selection.promise), secureContext: true,
  };
  function cleaned() {
    expect(track.stop).toHaveBeenCalledOnce();
    expect(audio.stop).toHaveBeenCalledOnce();
    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(video.listenerCount).toBe(0);
    expect(track.listenerCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(removeAbort).toHaveBeenCalledExactlyOnceWith("abort", expect.any(Function));
  }
  return { selection, track, audio, stream, video, canvas, controller, bindings, cleaned };
}
async function flush() { for (let i = 0; i < 6; i++) await Promise.resolve(); }
async function active(f = fixture()) {
  const start = startDisplaySession(f.controller.signal, f.bindings);
  f.selection.resolve(f.stream);
  return { ...f, session: await start };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("display session", () => {
  it("starts_native_selection_synchronously_with_explicit_constraints", async () => {
    const f = fixture();
    const start = startDisplaySession(f.controller.signal, f.bindings);
    expect(f.bindings.getDisplayMedia).toHaveBeenCalledExactlyOnceWith({ video: true, audio: false });
    expect(vi.getTimerCount()).toBe(0);
    f.selection.resolve(f.stream);
    (await start).dispose();
    f.cleaned();
  });

  it("does_not_request_selection_when_already_aborted", async () => {
    const f = fixture();
    f.controller.abort();
    await expect(startDisplaySession(f.controller.signal, f.bindings)).rejects.toMatchObject({ code: "cancelled" });
    expect(f.bindings.getDisplayMedia).not.toHaveBeenCalled();
  });

  it.each(["selection", "play", "readiness"])("aborts_during_selection_play_or_readiness (%s)", async (stage) => {
    const f = fixture();
    const play = deferred<void>();
    if (stage === "play") f.video.play.mockReturnValue(play.promise);
    if (stage === "readiness") f.video.readyState = 0;
    const removeAbort = vi.spyOn(f.controller.signal, "removeEventListener");
    const start = startDisplaySession(f.controller.signal, f.bindings);
    const rejected = expect(start).rejects.toMatchObject({ code: "cancelled" });
    if (stage !== "selection") { f.selection.resolve(f.stream); await flush(); }
    f.controller.abort();
    if (stage !== "selection") f.cleaned(); // Cleanup is synchronous, before the start settles.
    await rejected;
    expect(removeAbort).toHaveBeenCalledWith("abort", expect.any(Function));
    if (stage === "selection") {
      expect(f.bindings.createVideo).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      f.selection.resolve(f.stream); await flush();
      expect(f.track.stop).toHaveBeenCalledOnce();
      expect(f.audio.stop).toHaveBeenCalledOnce();
      expect(f.bindings.createVideo).not.toHaveBeenCalled();
    }
    if (stage === "play") { play.resolve(); await flush(); f.cleaned(); }
  });

  it("handles_late_rejection", async () => {
    const f = fixture();
    const start = startDisplaySession(f.controller.signal, f.bindings);
    const rejected = expect(start).rejects.toMatchObject({ code: "cancelled" });
    f.controller.abort(); await rejected;
    f.selection.reject(new DOMException("late", "NotAllowedError"));
    await flush();
    expect(f.bindings.createVideo).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never_revives_after_late_play_rejection", async () => {
    const f = fixture();
    const play = deferred<void>();
    f.video.play.mockReturnValue(play.promise);
    const start = startDisplaySession(f.controller.signal, f.bindings);
    const rejected = expect(start).rejects.toMatchObject({ code: "cancelled" });
    f.selection.resolve(f.stream); await flush(); f.controller.abort(); await rejected;
    play.reject(new Error("late play")); await flush(); f.cleaned();
  });

  it("captures_ready_static_frame_without_callback", async () => {
    const f = await active();
    const first = await f.session.capture();
    f.canvas.data[0] = 9;
    const second = await f.session.capture();
    expect(first).toEqual({ width: 2, height: 1, data: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 128]) });
    expect(second.data[0]).toBe(9);
    expect(second).not.toBe(first);
    expect(f.canvas.createCanvas).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    f.session.dispose(); f.cleaned();
  });

  it.each(["loadeddata", "canplay", "playing", "resize", "unmute"])("waits_for_first_frame_only (%s)", async (event) => {
    const f = fixture();
    f.video.readyState = 0;
    if (event === "unmute") f.track.muted = true;
    const start = startDisplaySession(f.controller.signal, f.bindings);
    f.selection.resolve(f.stream); await flush();
    expect(f.canvas.createCanvas).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    f.video.readyState = 2; f.track.muted = false;
    if (event === "unmute") f.track.emit(event); else f.video.emit(event);
    const session = await start;
    expect(f.video.listenerCount).toBe(0);
    await expect(session.capture()).resolves.toMatchObject({ width: 2 });
    await expect(session.capture()).resolves.toMatchObject({ width: 2 });
    expect(vi.getTimerCount()).toBe(0);
    session.dispose(); f.cleaned();
  });

  it.each(["play", "readiness"])("times_out_ten_seconds_after_stream_not_selection (%s)", async (stage) => {
    const f = fixture();
    if (stage === "play") f.video.play.mockReturnValue(deferred<void>().promise);
    else f.video.readyState = 0;
    const start = startDisplaySession(f.controller.signal, f.bindings);
    const rejected = expect(start).rejects.toMatchObject({ code: "read-failed" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(vi.getTimerCount()).toBe(0);
    f.selection.resolve(f.stream); await flush();
    await vi.advanceTimersByTimeAsync(9999);
    expect(f.track.stop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await rejected; f.cleaned();
  });

  it("rejects_8k_without_canvas_and_recovers", async () => {
    const f = await active();
    const first = await f.session.capture();
    f.video.videoWidth = 7680; f.video.videoHeight = 4320;
    await expect(f.session.capture()).rejects.toMatchObject({ code: "too-large" });
    expect(f.canvas.createCanvas).toHaveBeenCalledOnce();
    expect(f.canvas.drawImage).toHaveBeenCalledOnce();
    expect(f.canvas.getImageData).toHaveBeenCalledOnce();
    expect(first.data[0]).toBe(1);
    expect(f.track.stop).not.toHaveBeenCalled();
    f.video.videoWidth = 1; f.video.videoHeight = 2;
    await expect(f.session.capture()).resolves.toMatchObject({ width: 1, height: 2 });
    expect(f.canvas.drawImage).toHaveBeenLastCalledWith(f.video, 0, 0);
    f.session.dispose(); f.cleaned();
  });

  it.each([[8192, 2048], [2048, 8192], [4096, 4096]])("allows_dimension_and_pixel_boundaries (%s x %s)", async (width, height) => {
    const f = await active();
    // A tiny fake readback avoids allocating a real 64 MiB image for this dimension guard test.
    f.video.videoWidth = width; f.video.videoHeight = height;
    await expect(f.session.capture()).resolves.toMatchObject({ width, height });
    expect(f.canvas.getImageData).toHaveBeenCalledWith(0, 0, width, height);
    f.session.dispose();
  });

  it.each([[8193, 1], [1, 8193], [8192, 2049], [1.5, 1], [NaN, 1]])("rejects_invalid_or_oversized_current_dimensions_before_canvas (%s x %s)", async (width, height) => {
    const f = await active(); f.video.videoWidth = width; f.video.videoHeight = height;
    await expect(f.session.capture()).rejects.toMatchObject({ code: "too-large" });
    expect(f.canvas.createCanvas).not.toHaveBeenCalled(); f.session.dispose();
  });

  it.each(["muted", "no-frame", "zero-width", "ended"])("rejects_muted_or_ended_track_or_missing_current_frame (%s)", async (state) => {
    const f = await active();
    if (state === "muted") { f.track.muted = true; f.track.emit("mute"); }
    if (state === "no-frame") f.video.readyState = 1;
    if (state === "zero-width") f.video.videoWidth = 0;
    if (state === "ended") { f.track.readyState = "ended"; f.track.emit("ended"); }
    await expect(f.session.capture()).rejects.toMatchObject({ code: state === "ended" ? "stopped" : "read-failed" });
    expect(f.canvas.createCanvas).not.toHaveBeenCalled(); f.session.dispose(); f.cleaned();
  });

  it("notifies_mute_unmute_ended_and_unsubscribes", async () => {
    const f = await active(); const listener = vi.fn(); const removed = vi.fn();
    f.session.subscribe(listener); const unsubscribe = f.session.subscribe(removed); unsubscribe(); unsubscribe();
    f.track.muted = true; f.track.emit("mute");
    expect(f.session.getStatus()).toEqual({ ended: false, muted: true });
    expect(listener).toHaveBeenLastCalledWith({ ended: false, muted: true });
    f.track.muted = false; f.track.emit("unmute");
    await expect(f.session.capture()).resolves.toMatchObject({ width: 2 });
    f.track.readyState = "ended"; f.track.emit("ended");
    expect(listener).toHaveBeenLastCalledWith({ ended: true, muted: false });
    expect(removed).not.toHaveBeenCalled(); f.cleaned();
  });

  it.each(["dispose", "abort", "ended"])("disposes_all_tracks_once (%s)", async (action) => {
    const f = await active();
    if (action === "abort") f.controller.abort();
    if (action === "ended") { f.track.readyState = "ended"; f.track.emit("ended"); }
    f.session.dispose(); f.session.dispose(); f.controller.abort();
    expect(f.session.getStatus().ended).toBe(true);
    await expect(f.session.capture()).rejects.toMatchObject({ code: "stopped" }); f.cleaned();
  });

  it.each(["create-video", "play-throw", "play-reject", "video-error", "ended"])("cleans_up_preparation_failures (%s)", async (stage) => {
    const f = fixture();
    if (stage === "create-video") f.bindings.createVideo = () => { throw new Error("video creation"); };
    if (stage === "play-throw") f.video.play.mockImplementation(() => { throw new Error("play"); });
    if (stage === "play-reject") f.video.play.mockRejectedValue(new Error("play"));
    if (stage === "video-error" || stage === "ended") f.video.readyState = 0;
    const start = startDisplaySession(f.controller.signal, f.bindings);
    const rejected = expect(start).rejects.toMatchObject({ code: stage === "ended" ? "stopped" : "read-failed" });
    f.selection.resolve(f.stream); await flush();
    if (stage === "video-error") f.video.emit("error");
    if (stage === "ended") { f.track.readyState = "ended"; f.track.emit("ended"); }
    await rejected;
    if (stage === "create-video") {
      expect(f.track.stop).toHaveBeenCalledOnce(); expect(f.audio.stop).toHaveBeenCalledOnce();
      expect(f.track.listenerCount).toBe(0); expect(vi.getTimerCount()).toBe(0);
    } else f.cleaned();
  });


  it("reads_current_pixels_in_the_capture_call_before_any_await", async () => {
    const f = await active();
    const capture = f.session.capture();
    expect(f.canvas.getImageData).toHaveBeenCalledExactlyOnceWith(0, 0, 2, 1);
    f.video.videoWidth = 4;
    await expect(capture).resolves.toMatchObject({ width: 2, height: 1 });
    f.session.dispose(); f.cleaned();
  });

  it("does_not_return_a_session_until_play_completes", async () => {
    const f = fixture(); const play = deferred<void>(); f.video.play.mockReturnValue(play.promise);
    const start = startDisplaySession(f.controller.signal, f.bindings);
    let returned = false; void start.then(() => { returned = true; });
    f.selection.resolve(f.stream); await flush();
    f.video.emit("loadeddata"); await flush();
    expect(returned).toBe(false); expect(vi.getTimerCount()).toBe(1);
    expect(f.video.muted).toBe(true); expect(f.video.playsInline).toBe(true);
    expect(f.video.srcObject).toBe(f.stream);
    play.resolve(); const session = await start;
    expect(vi.getTimerCount()).toBe(0); session.dispose(); f.cleaned();
  });

  it("cleans_up_when_selection_has_no_video_track", async () => {
    const f = fixture();
    f.stream.getVideoTracks = () => [];
    const start = startDisplaySession(f.controller.signal, f.bindings);
    const rejected = expect(start).rejects.toMatchObject({ code: "read-failed" });
    f.selection.resolve(f.stream); await rejected;
    expect(f.bindings.createVideo).not.toHaveBeenCalled();
    expect(f.track.stop).toHaveBeenCalledOnce(); expect(f.audio.stop).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("abort_wins_at_readiness_completion", async () => {
    const f = fixture(); const play = deferred<void>(); f.video.play.mockReturnValue(play.promise);
    const start = startDisplaySession(f.controller.signal, f.bindings);
    const rejected = expect(start).rejects.toMatchObject({ code: "cancelled" });
    f.selection.resolve(f.stream); await flush(); play.resolve(); f.controller.abort();
    await rejected; await flush(); f.cleaned();
  });

  it.each([
    ["NotAllowedError", "permission-declined"], ["NotSupportedError", "unsupported"],
    ["NotFoundError", "source-unavailable"], ["InvalidStateError", "activation-required"],
    ["NotReadableError", "capture-failed"], ["AbortError", "capture-failed"], ["OtherError", "capture-failed"], ["constructor", "capture-failed"],
  ])("classifies_native_errors (%s)", async (name, code) => {
    const f = fixture(); const start = startDisplaySession(f.controller.signal, f.bindings);
    const rejected = expect(start).rejects.toMatchObject({ code });
    f.selection.reject(new DOMException("private error", name)); await rejected;
    expect(f.bindings.createVideo).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it("classifies_synchronous_selection_failure", async () => {
    const f = fixture(); f.bindings.getDisplayMedia = () => { throw new DOMException("activation", "InvalidStateError"); };
    await expect(startDisplaySession(f.controller.signal, f.bindings)).rejects.toMatchObject({ code: "activation-required" });
  });

  it.each(["insecure", "missing"])("reports_unsupported_without_requesting_selection (%s)", async (reason) => {
    const f = fixture(); if (reason === "insecure") f.bindings.secureContext = false;
    else f.bindings.getDisplayMedia = null;
    await expect(startDisplaySession(f.controller.signal, f.bindings)).rejects.toMatchObject({ code: "unsupported" });
    expect(f.bindings.createVideo).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});

describe("browser adapter assembly", () => {
  it("binds_native_media_receiver_and_starts_without_await", async () => {
    const f = fixture();
    const mediaDevices = { getDisplayMedia(this: unknown, options: DisplayMediaStreamOptions) {
      expect(this).toBe(mediaDevices); expect(options).toEqual({ video: true, audio: false }); return f.selection.promise;
    } };
    vi.stubGlobal("navigator", { mediaDevices }); vi.stubGlobal("isSecureContext", true);
    const adapter = createBrowserImageAdapter({ createVideo: f.bindings.createVideo, createCanvas: f.bindings.createCanvas });
    expect(adapter.supportsDisplay).toBe(true);
    const start = adapter.startDisplay(f.controller.signal); f.selection.resolve(f.stream);
    const session = await start; await expect(session.capture()).resolves.toMatchObject({ width: 2 });
    session.dispose(); f.cleaned();
  });

  it("keeps_files_available_when_display_is_unsupported", async () => {
    const f = fixture(); const { bitmap, close } = fakeBitmap();
    const adapter = createBrowserImageAdapter({ ...f.bindings, createBitmap: async () => bitmap, secureContext: false });
    expect(adapter.supportsFiles).toBe(true); expect(adapter.supportsDisplay).toBe(false);
    await expect(adapter.decode(pngHeader())).resolves.toMatchObject({ width: 2 }); expect(close).toHaveBeenCalledOnce();
    await expect(adapter.startDisplay(f.controller.signal)).rejects.toMatchObject({ code: "unsupported" });
  });
});
