import sharp from "sharp";

import type { GridGeometry, PixelImage, RecognizedCell } from "../../src/recognition/types.js";

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function labelText(cell: RecognizedCell): string {
  const label = cell.label === "empty" ? "·" : cell.label === "closed" ? "#" : cell.label === "flag" ? "F" : String(cell.label);
  return cell.confidence < 0.999 ? `${label} ${cell.confidence.toFixed(3)}` : label;
}

export async function renderOverlay(
  image: PixelImage,
  geometry: GridGeometry,
  cells: readonly RecognizedCell[],
  outputPath: string,
): Promise<void> {
  const { bounds, columns, rows, pitchX, pitchY } = geometry;
  const cellShapes = cells.map((cell) => {
    const column = cell.index % columns;
    const row = Math.floor(cell.index / columns);
    if (row < 0 || row >= rows) return "";
    const x = bounds.x + column * pitchX;
    const y = bounds.y + row * pitchY;
    const text = escapeXml(labelText(cell));
    return `<rect x="${x}" y="${y}" width="${pitchX}" height="${pitchY}" fill="none" stroke="#00ffff" stroke-width="1"/><text x="${x + 2}" y="${y + 12}" fill="#00ffff" font-family="monospace" font-size="12" stroke="#000000" stroke-width="2" paint-order="stroke">${text}</text>`;
  }).join("");
  const svg = `<svg width="${image.width}" height="${image.height}" xmlns="http://www.w3.org/2000/svg"><rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="none" stroke="#ff00ff" stroke-width="2"/>${cellShapes}</svg>`;

  await sharp(Buffer.from(image.data), { raw: { width: image.width, height: image.height, channels: 4 } })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toFile(outputPath);
}
