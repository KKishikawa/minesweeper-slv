import { describe, expect, it } from "vitest";
import { selectImage } from "../../src/image-input/files.js";
import { ImageInputError } from "../../src/image-input/types.js";

const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const jpeg = [0xff, 0xd8, 0xff];
const webp = [0x52, 0x49, 0x46, 0x46, 0x08, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];

function image(bytes: number[], type = ""): Blob {
  return new Blob([new Uint8Array(bytes)], { type });
}

describe("image file selection", () => {
  it("selects_first_supported_signature", async () => {
    const first = image(png);
    await expect(selectImage([new Blob(["text"]), first, image(jpeg)]))
      .resolves.toEqual({ blob: first, count: 2 });
  });

  it("ignores_empty_or_incorrect_mime", async () => {
    const first = image(webp, "text/plain");
    await expect(selectImage([
      new Blob(["<svg></svg>"], { type: "image/svg+xml" }),
      new Blob(["GIF89a"], { type: "image/gif" }),
      new Blob(["not PNG"], { type: "image/png" }),
      first, image(png, "image/gif"), image(jpeg),
    ])).resolves.toEqual({ blob: first, count: 3 });
  });

  it("reports_no_image_for_empty_input", async () => {
    await expect(selectImage([])).rejects.toMatchObject({ code: "no-image" });
    await expect(selectImage([])).rejects.toBeInstanceOf(ImageInputError);
  });

  it("reports_unsupported_format_for_unrecognized_or_incomplete_signatures", async () => {
    await expect(selectImage([
      new Blob(), image(png.slice(0, 7)), image(jpeg.slice(0, 2)),
      image(webp.slice(0, 11)), new Blob(["RIFF1234WAVE"]),
      image([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0a, 0x1a, 0x0a]),
    ])).rejects.toMatchObject({ code: "unsupported-format" });
  });

  it("leaves_complete_image_validation_to_decode", async () => {
    const headerOnly = image(png);
    await expect(selectImage([headerOnly])).resolves.toEqual({ blob: headerOnly, count: 1 });
  });

  it("reports_read_failed_when_header_read_rejects", async () => {
    class UnreadableBlob extends Blob {
      override slice(): Blob {
        const header = new Blob();
        header.arrayBuffer = async () => { throw new Error("read failure"); };
        return header;
      }
    }
    await expect(selectImage([new UnreadableBlob()])).rejects.toMatchObject({ code: "read-failed" });
  });

  it("reports_read_failed_when_slice_throws", async () => {
    class UnreadableBlob extends Blob {
      override slice(): Blob { throw new Error("slice failure"); }
    }
    await expect(selectImage([new UnreadableBlob()])).rejects.toMatchObject({ code: "read-failed" });
  });
});
