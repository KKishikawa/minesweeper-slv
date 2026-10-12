import { describe, expect, it, vi } from "vitest";
import { createImageInputController } from "../../src/image-input/controller.js";
import { ImageInputError, type ImageInputAdapter, type DisplaySession } from "../../src/image-input/types.js";
import type { PixelImage } from "../../src/recognition/types.js";
import { deferred, fakeDisplaySession, pixelImage, pngHeader } from "./helpers.js";

function setup() {
  const display = fakeDisplaySession();
  const decode = vi.fn(async (_blob: Blob) => pixelImage());
  const startDisplay = vi.fn(async (_signal: AbortSignal) => display.session);
  const adapter: ImageInputAdapter = { supportsFiles: true, supportsDisplay: true, decode, startDisplay };
  const controller = createImageInputController(adapter);
  return { controller, adapter, decode, startDisplay, display };
}

function delayedHeader() {
  const header = deferred<ArrayBuffer>();
  const blob = pngHeader();
  blob.slice = () => ({ arrayBuffer: () => header.promise }) as Blob;
  return { blob, header, bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer };
}

async function decodeStarted(decode: ReturnType<typeof setup>["decode"], count = 1) {
  await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(count));
}

describe("image input controller", () => {
  it("all_file_paths_use_same_decode", async () => {
    const { controller, decode } = setup();
    for (const [index, source] of (["file", "paste", "drop"] as const).entries()) {
      const blob = pngHeader();
      const image = pixelImage(index + 1);
      decode.mockResolvedValueOnce(image);
      await controller.importFiles([blob], source);
      expect(decode).toHaveBeenLastCalledWith(blob);
      expect(controller.getState()).toMatchObject({ phase: "ready", image: { image, source, revision: index + 1 }, imageResult: "success" });
    }
  });

  it("last_started_import_wins", async () => {
    const { controller, decode } = setup();
    const first = deferred<PixelImage>();
    decode.mockReturnValueOnce(first.promise).mockResolvedValueOnce(pixelImage(9));
    const firstImport = controller.importFiles([pngHeader()], "file");
    await decodeStarted(decode);
    await controller.importFiles([pngHeader()], "paste");
    first.resolve(pixelImage(3));
    await firstImport;
    expect(controller.getState().image).toEqual({ image: pixelImage(9), source: "paste", revision: 1 });
  });

  it("new_import_invalidates_pending_signature_selection", async () => {
    const { controller, decode } = setup();
    const slow = delayedHeader();
    const firstImport = controller.importFiles([slow.blob], "file");
    await controller.importFiles([pngHeader()], "drop");
    slow.header.resolve(slow.bytes);
    await firstImport;
    expect(decode).toHaveBeenCalledTimes(1);
    expect(controller.getState().image?.source).toBe("drop");
  });

  it("clear_invalidates_selection_and_decode", async () => {
    const { controller, decode } = setup();
    const slow = delayedHeader();
    const selected = controller.importFiles([slow.blob], "file");
    controller.clear();
    slow.header.resolve(slow.bytes);
    await selected;
    expect(decode).not.toHaveBeenCalled();
    const pixels = deferred<PixelImage>();
    decode.mockReturnValueOnce(pixels.promise);
    const imported = controller.importFiles([pngHeader()], "file");
    await decodeStarted(decode);
    controller.clear();
    pixels.resolve(pixelImage());
    await imported;
    expect(controller.getState()).toMatchObject({ phase: "empty", image: null, imageResult: null });
  });

  it("failed_import_preserves_image_revision_and_clears_loading", async () => {
    const { controller, decode } = setup();
    await controller.importFiles([pngHeader()], "file");
    const previous = controller.getState().image;
    decode.mockRejectedValueOnce(new ImageInputError("too-large"));
    await controller.importFiles([pngHeader()], "paste");
    expect(controller.getState()).toMatchObject({ phase: "ready", image: previous, imageResult: "too-large" });
    await controller.importFiles([pngHeader()], "drop");
    expect(controller.getState().image?.revision).toBe(2);
  });

  it("reports_multiple_supported_images_and_selection_errors", async () => {
    const { controller } = setup();
    await controller.importFiles([pngHeader(), pngHeader()], "file");
    expect(controller.getState().imageResult).toBe("multiple");
    const previous = controller.getState().image;
    await controller.importFiles([new Blob(["text"])], "paste");
    expect(controller.getState()).toMatchObject({ image: previous, imageResult: "unsupported-format" });
    controller.clear();
    await controller.importFiles([], "paste");
    expect(controller.getState()).toMatchObject({ phase: "empty", imageResult: "no-image" });
  });

  it("failed_capture_preserves_image_revision", async () => {
    const { controller, display } = setup();
    await controller.importFiles([pngHeader()], "file");
    await controller.startDisplay();
    const previous = controller.getState().image;
    display.capture.mockRejectedValueOnce(new ImageInputError("read-failed"));
    await controller.captureDisplay();
    expect(controller.getState()).toMatchObject({ phase: "ready", image: previous, imageResult: "read-failed", sharing: "active" });
    await controller.captureDisplay();
    expect(controller.getState().image?.revision).toBe(2);
  });

  it("repeated_capture_uses_one_session", async () => {
    const { controller, startDisplay, display } = setup();
    await controller.startDisplay();
    expect(controller.getState().image).toBeNull();
    await controller.startDisplay();
    display.capture.mockResolvedValueOnce(pixelImage(5)).mockResolvedValueOnce(pixelImage(8));
    await controller.captureDisplay();
    expect(controller.getState().image).toEqual({ image: pixelImage(5), source: "display", revision: 1 });
    await controller.captureDisplay();
    expect(controller.getState().image).toEqual({ image: pixelImage(8), source: "display", revision: 2 });
    expect(startDisplay).toHaveBeenCalledTimes(1);
  });

  it("file_import_invalidates_pending_capture", async () => {
    const { controller, display } = setup();
    await controller.startDisplay();
    const pixels = deferred<PixelImage>();
    display.capture.mockReturnValueOnce(pixels.promise);
    const capture = controller.captureDisplay();
    await controller.importFiles([pngHeader()], "paste");
    pixels.resolve(pixelImage(6));
    await capture;
    expect(controller.getState().image?.source).toBe("paste");
  });

  it("start_invokes_adapter_in_the_calling_stack_and_ignores_duplicate_requests", async () => {
    const { controller, startDisplay, display } = setup();
    const pending = deferred<DisplaySession>();
    startDisplay.mockReturnValueOnce(pending.promise);
    const started = controller.startDisplay();
    expect(startDisplay).toHaveBeenCalledTimes(1);
    expect(controller.getState().sharing).toBe("requesting");
    await controller.startDisplay();
    expect(startDisplay).toHaveBeenCalledTimes(1);
    pending.resolve(display.session);
    await started;
    expect(controller.getState().sharing).toBe("active");
  });

  it("stop_aborts_pending_start", async () => {
    const { controller, startDisplay, display } = setup();
    const pending = deferred<DisplaySession>();
    startDisplay.mockReturnValueOnce(pending.promise);
    const started = controller.startDisplay();
    const signal = startDisplay.mock.calls[0]![0];
    controller.stopDisplay();
    expect(signal.aborted).toBe(true);
    expect(controller.getState()).toMatchObject({ sharing: "idle", displayResult: "cancelled" });
    pending.resolve(display.session);
    await started;
    expect(display.dispose).toHaveBeenCalledTimes(1);
    expect(controller.getState().sharing).toBe("idle");
  });

  it("restart_is_not_affected_by_old_completion", async () => {
    const { controller, startDisplay, display: old } = setup();
    const pending = deferred<DisplaySession>();
    const current = fakeDisplaySession();
    startDisplay.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(current.session);
    const started = controller.startDisplay();
    controller.stopDisplay();
    await controller.startDisplay();
    pending.resolve(old.session);
    await started;
    expect(old.dispose).toHaveBeenCalledTimes(1);
    expect(current.dispose).not.toHaveBeenCalled();
    old.update({ ended: true, muted: false });
    expect(controller.getState().sharing).toBe("active");
    await controller.captureDisplay();
    expect(controller.getState().image?.source).toBe("display");
  });

  it("stop_between_session_resolution_and_adoption_disposes_only_old_session", async () => {
    const { controller, startDisplay, display } = setup();
    const pending = deferred<DisplaySession>();
    startDisplay.mockReturnValueOnce(pending.promise);
    const started = controller.startDisplay();
    pending.resolve(display.session);
    controller.stopDisplay();
    await started;
    expect(display.dispose).toHaveBeenCalledTimes(1);
    expect(display.listenerCount()).toBe(0);
    expect(controller.getState().sharing).toBe("idle");
  });

  it("stop_invalidates_pending_capture_and_aborts_active_session", async () => {
    const { controller, startDisplay, display } = setup();
    await controller.importFiles([pngHeader()], "file");
    const previous = controller.getState().image;
    await controller.startDisplay();
    const pixels = deferred<PixelImage>();
    display.capture.mockReturnValueOnce(pixels.promise);
    const capture = controller.captureDisplay();
    controller.stopDisplay();
    pixels.resolve(pixelImage(6));
    await capture;
    expect(startDisplay.mock.calls[0]![0].aborted).toBe(true);
    expect(display.dispose).toHaveBeenCalledTimes(1);
    expect(display.listenerCount()).toBe(0);
    expect(controller.getState()).toMatchObject({ phase: "ready", image: previous, sharing: "ended", displayResult: "stopped" });
  });

  it("stop_does_not_cancel_file_decode", async () => {
    const { controller, decode, display } = setup();
    await controller.startDisplay();
    const pixels = deferred<PixelImage>();
    decode.mockReturnValueOnce(pixels.promise);
    const imported = controller.importFiles([pngHeader()], "drop");
    await decodeStarted(decode);
    controller.stopDisplay();
    expect(controller.getState()).toMatchObject({ phase: "loading", imageResult: null });
    pixels.resolve(pixelImage(4));
    await imported;
    expect(controller.getState()).toMatchObject({ phase: "ready", image: { source: "drop", revision: 1 }, imageResult: "success", displayResult: "stopped" });
    expect(display.dispose).toHaveBeenCalledTimes(1);
  });

  it("clear_keeps_sharing_and_revisions_monotonic", async () => {
    const { controller, display } = setup();
    await controller.startDisplay();
    await controller.captureDisplay();
    controller.clear();
    expect(controller.getState()).toMatchObject({ phase: "empty", image: null, sharing: "active" });
    expect(display.dispose).not.toHaveBeenCalled();
    await controller.captureDisplay();
    expect(controller.getState().image?.revision).toBe(2);
  });

  it("suspend_clears_and_allows_explicit_restart", async () => {
    const { controller, decode, startDisplay, display } = setup();
    await controller.importFiles([pngHeader()], "file");
    await controller.startDisplay();
    const pending = deferred<PixelImage>();
    decode.mockReturnValueOnce(pending.promise);
    const imported = controller.importFiles([pngHeader()], "drop");
    await decodeStarted(decode, 2);
    controller.suspend();
    expect(startDisplay.mock.calls[0]![0].aborted).toBe(true);
    expect(controller.getState()).toEqual({ phase: "empty", image: null, imageResult: null, sharing: "idle", displayResult: null, muted: false });
    pending.resolve(pixelImage(4));
    await imported;
    expect(controller.getState().image).toBeNull();
    expect(display.dispose).toHaveBeenCalledTimes(1);
    const restarted = fakeDisplaySession();
    startDisplay.mockResolvedValueOnce(restarted.session);
    await controller.startDisplay();
    await controller.captureDisplay();
    expect(controller.getState()).toMatchObject({ sharing: "active", image: { revision: 2 } });
  });

  it("dispose_rejects_late_updates_and_all_future_operations", async () => {
    const { controller, decode, startDisplay, display } = setup();
    const pixels = deferred<PixelImage>();
    const session = deferred<DisplaySession>();
    decode.mockReturnValueOnce(pixels.promise);
    startDisplay.mockReturnValueOnce(session.promise);
    const imported = controller.importFiles([pngHeader()], "file");
    await decodeStarted(decode);
    const started = controller.startDisplay();
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.dispose();
    const count = listener.mock.calls.length;
    pixels.resolve(pixelImage());
    session.resolve(display.session);
    await Promise.all([imported, started]);
    await controller.importFiles([pngHeader()], "file");
    await controller.startDisplay();
    await controller.captureDisplay();
    controller.clear();
    controller.stopDisplay();
    controller.suspend();
    controller.dispose();
    expect(decode).toHaveBeenCalledTimes(1);
    expect(startDisplay).toHaveBeenCalledTimes(1);
    expect(display.dispose).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(count);
    expect(controller.getState()).toMatchObject({ phase: "empty", image: null, sharing: "idle" });
  });

  it("reads_initial_status_then_observes_mute_unmute_and_external_end", async () => {
    const { controller, display, startDisplay } = setup();
    display.update({ ended: false, muted: true });
    await controller.startDisplay();
    expect(controller.getState()).toMatchObject({ sharing: "active", muted: true });
    display.update({ ended: false, muted: false });
    expect(controller.getState().muted).toBe(false);
    const pixels = deferred<PixelImage>();
    display.capture.mockReturnValueOnce(pixels.promise);
    const capture = controller.captureDisplay();
    display.update({ ended: true, muted: false });
    expect(controller.getState()).toMatchObject({ phase: "empty", sharing: "ended", displayResult: "stopped", muted: false });
    expect(startDisplay.mock.calls[0]![0].aborted).toBe(true);
    expect(display.listenerCount()).toBe(0);
    pixels.resolve(pixelImage(7));
    await capture;
    expect(controller.getState().image).toBeNull();
  });

  it("reports_typed_start_errors_separately_from_image_results", async () => {
    const { controller, startDisplay } = setup();
    await controller.importFiles([pngHeader()], "file");
    startDisplay.mockRejectedValueOnce(new ImageInputError("permission-declined"));
    await controller.startDisplay();
    expect(controller.getState()).toMatchObject({ sharing: "idle", displayResult: "permission-declined", imageResult: "success", image: { revision: 1 } });
    startDisplay.mockImplementationOnce(() => { throw new Error("private details"); });
    await controller.startDisplay();
    expect(controller.getState().displayResult).toBe("capture-failed");
  });

  it("unsupported_adapters_do_not_start_resources", async () => {
    const { controller, adapter, decode, startDisplay } = setup();
    adapter.supportsFiles = false;
    adapter.supportsDisplay = false;
    await controller.importFiles([pngHeader()], "file");
    await controller.startDisplay();
    expect(controller.getState()).toMatchObject({ phase: "empty", imageResult: "unsupported", displayResult: "unsupported" });
    expect(decode).not.toHaveBeenCalled();
    expect(startDisplay).not.toHaveBeenCalled();
  });

  it("subscriptions_observe_changes_and_can_unsubscribe", async () => {
    const { controller } = setup();
    const states: string[] = [];
    const unsubscribe = controller.subscribe((state) => { states.push(state.phase); });
    await controller.importFiles([pngHeader()], "file");
    expect(states).toContain("loading");
    expect(states.at(-1)).toBe("ready");
    unsubscribe();
    const count = states.length;
    controller.clear();
    expect(states).toHaveLength(count);
  });
});
