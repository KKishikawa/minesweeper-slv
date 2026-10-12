import { ImageInputError } from "./types.js";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50];

function matches(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

export async function selectImage(files: readonly Blob[]): Promise<{ blob: Blob; count: number }> {
  if (files.length === 0) throw new ImageInputError("no-image");

  let first: Blob | undefined;
  let count = 0;
  for (const blob of files) {
    let header: Uint8Array;
    try {
      header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    } catch {
      throw new ImageInputError("read-failed");
    }
    if (
      matches(header, PNG_SIGNATURE) || matches(header, JPEG_SIGNATURE)
      || (matches(header, RIFF_SIGNATURE) && matches(header, WEBP_SIGNATURE, 8))
    ) {
      first ??= blob;
      count += 1;
    }
  }
  if (first === undefined) throw new ImageInputError("unsupported-format");
  return { blob: first, count };
}
