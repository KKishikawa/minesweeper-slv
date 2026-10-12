import { describe, expect, it, vi } from "vitest";
import { decodeBlob, readPixels } from "../../src/image-input/browser.js";
import { selectImage } from "../../src/image-input/files.js";
import { fakeBitmap, fakeCanvas, pngHeader } from "./helpers.js";

describe("browser image decoding", () => {
  it("preserves_native_rgba", async () => {
    const { bitmap, close } = fakeBitmap();
    const canvas = fakeCanvas();
    canvas.drawImage.mockImplementation(() => {
      expect(canvas.canvas.width).toBe(2);
      expect(canvas.canvas.height).toBe(1);
    });
    const createBitmap = vi.fn(async () => bitmap);
    const blob = pngHeader();
    const result = await decodeBlob(blob, { createBitmap, createCanvas: canvas.createCanvas });
    expect(result).toEqual({ width: 2, height: 1, data: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 128]) });
    expect(result.data).toHaveLength(8);
    expect(result.data).not.toBe(canvas.data);
    canvas.data[0] = 99;
    expect(result.data[0]).toBe(1);
    expect(createBitmap).toHaveBeenCalledExactlyOnceWith(blob, {
      imageOrientation: "from-image", premultiplyAlpha: "default", colorSpaceConversion: "default",
    });
    expect(canvas.drawImage).toHaveBeenCalledExactlyOnceWith(bitmap, 0, 0);
    expect(canvas.getImageData).toHaveBeenCalledExactlyOnceWith(0, 0, 2, 1);
    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects_file_above_20_mib_before_decode", async () => {
    const { bitmap } = fakeBitmap();
    const canvas = fakeCanvas();
    const createBitmap = vi.fn(async () => bitmap);
    await expect(decodeBlob(new Blob([new Uint8Array(20 * 1024 * 1024 + 1)]), {
      createBitmap, createCanvas: canvas.createCanvas,
    })).rejects.toMatchObject({ code: "too-large" });
    expect(createBitmap).not.toHaveBeenCalled();
    expect(canvas.createCanvas).not.toHaveBeenCalled();
  });

  it("allows_exactly_20_mib", async () => {
    const { bitmap } = fakeBitmap();
    const canvas = fakeCanvas();
    await expect(decodeBlob(new Blob([new Uint8Array(20 * 1024 * 1024)]), {
      createBitmap: async () => bitmap, createCanvas: canvas.createCanvas,
    })).resolves.toMatchObject({ width: 2, height: 1 });
  });

  it.each([[8193, 1], [1, 8193], [8192, 2049], [0, 1], [1.5, 1]])(
    "rejects_dimensions_before_canvas_creation (%s x %s)", async (width, height) => {
      const { bitmap, close } = fakeBitmap(width, height);
      const canvas = fakeCanvas();
      await expect(decodeBlob(pngHeader(), {
        createBitmap: async () => bitmap, createCanvas: canvas.createCanvas,
      })).rejects.toMatchObject({ code: "too-large" });
      expect(canvas.createCanvas).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledOnce();
      expect(() => readPixels(bitmap, width, height, canvas.createCanvas))
        .toThrow(expect.objectContaining({ code: "too-large" }));
      expect(canvas.createCanvas).not.toHaveBeenCalled();
    },
  );

  it("closes_bitmap_on_read_failure", async () => {
    const { bitmap, close } = fakeBitmap();
    const canvas = fakeCanvas();
    canvas.getImageData.mockImplementation(() => { throw new Error("read failed"); });
    await expect(decodeBlob(pngHeader(), {
      createBitmap: async () => bitmap, createCanvas: canvas.createCanvas,
    })).rejects.toMatchObject({ code: "read-failed" });
    expect(close).toHaveBeenCalledOnce();
  });

  it.each(["success", "draw", "read", "context"])("releases_canvas_after_success_or_failure (%s)", (stage) => {
    const { bitmap } = fakeBitmap();
    const canvas = fakeCanvas();
    if (stage === "draw") canvas.drawImage.mockImplementation(() => { throw new Error("draw failed"); });
    if (stage === "read") canvas.getImageData.mockImplementation(() => { throw new Error("read failed"); });
    if (stage === "context") canvas.getContext.mockImplementation(() => { throw new Error("context failed"); });
    if (stage === "success") readPixels(bitmap, 2, 1, canvas.createCanvas);
    else expect(() => readPixels(bitmap, 2, 1, canvas.createCanvas))
      .toThrow(expect.objectContaining({ code: "read-failed" }));
    expect(canvas.canvas.width).toBe(0);
    expect(canvas.canvas.height).toBe(0);
  });

  it("reports_corrupt_supported_file", async () => {
    const { blob } = await selectImage([pngHeader()]);
    const canvas = fakeCanvas();
    await expect(decodeBlob(blob, {
      createBitmap: async () => { throw new DOMException("corrupt", "InvalidStateError"); },
      createCanvas: canvas.createCanvas,
    })).rejects.toMatchObject({ code: "read-failed" });
    expect(canvas.createCanvas).not.toHaveBeenCalled();
  });

  it("reports_missing_bitmap_api_as_unsupported", async () => {
    const canvas = fakeCanvas();
    await expect(decodeBlob(pngHeader(), { createBitmap: null, createCanvas: canvas.createCanvas }))
      .rejects.toMatchObject({ code: "unsupported" });
    expect(canvas.createCanvas).not.toHaveBeenCalled();
  });

  it("reports_missing_canvas_context_as_unsupported_and_releases_canvas", () => {
    const { bitmap } = fakeBitmap();
    const canvas = fakeCanvas();
    canvas.getContext.mockReturnValue(null);
    expect(() => readPixels(bitmap, 2, 1, canvas.createCanvas))
      .toThrow(expect.objectContaining({ code: "unsupported" }));
    expect(canvas.canvas.width).toBe(0);
    expect(canvas.canvas.height).toBe(0);
  });
});
