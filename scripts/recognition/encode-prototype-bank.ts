import { createHash } from "node:crypto";

import { FEATURE_LENGTH } from "../../src/recognition/features.js";
import {
  CELL_LABEL_ORDER,
  validatePrototypeBank,
  type PrototypeBank,
} from "../../src/recognition/prototype-bank.js";
import type { SerializedPrototypeBank } from "../../src/recognition/prototype-bank-codec.js";
import type { CellLabel } from "../../src/recognition/types.js";

type SerializedPrototypeBankContent = Omit<SerializedPrototypeBank, "sha256">;

function encodeFloat32(values: ArrayLike<number>, description: string): string {
  const bytes = Buffer.alloc(values.length * Float32Array.BYTES_PER_ELEMENT);
  for (let index = 0; index < values.length; index += 1) {
    const float32 = Math.fround(values[index]!);
    if (!Number.isFinite(float32)) {
      throw new RangeError(`${description} cannot be represented as finite Float32 values.`);
    }
    bytes.writeFloatLE(float32, index * Float32Array.BYTES_PER_ELEMENT);
  }
  return bytes.toString("base64");
}

export function encodePrototypeBank(bank: PrototypeBank): SerializedPrototypeBank {
  validatePrototypeBank(bank);

  const labels: CellLabel[] = [];
  const prototypeCounts: number[] = [];
  const prototypeValues: number[] = [];
  for (const label of CELL_LABEL_ORDER) {
    const prototypes = bank.prototypes.filter((prototype) => prototype.label === label);
    if (prototypes.length === 0) continue;
    labels.push(label);
    prototypeCounts.push(prototypes.length);
    for (const prototype of prototypes) prototypeValues.push(...prototype.vector);
  }

  const content: SerializedPrototypeBankContent = {
    formatVersion: 1,
    featureVersion: "features-v1",
    featureLength: FEATURE_LENGTH,
    thresholds: {
      relativeMargin: bank.thresholds.relativeMargin,
      absoluteDistance: bank.thresholds.absoluteDistance,
    },
    labels,
    prototypeCounts,
    centerBase64: encodeFloat32(bank.scaler.center, "Scaler center"),
    scaleBase64: encodeFloat32(bank.scaler.scale, "Scaler scale"),
    prototypeBase64: encodeFloat32(prototypeValues, "Prototype vectors"),
  };
  const sha256 = createHash("sha256").update(JSON.stringify(content)).digest("hex");
  return { ...content, sha256 };
}
