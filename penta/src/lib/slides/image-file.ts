import { slideLimits } from "@/lib/config";

export type ImageKind = "png" | "jpg" | "webp";

export type ImageInfo = { kind: ImageKind; width: number; height: number };

export type ImageProblem = "empty" | "too_large" | "bad_type" | "not_image" | "animated" | "too_wide";

export const imageMimeByKind: Record<ImageKind, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

const kindByExtension: Record<string, ImageKind> = { png: "png", jpg: "jpg", jpeg: "jpg", webp: "webp" };
const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const jpegSizeMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function readPng(bytes: Uint8Array): ImageInfo | "animated" | null {
  if (bytes.length < 33 || ascii(bytes, 12, 4) !== "IHDR") return null;
  const data = view(bytes);
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset + 4, 4);
    if (type === "acTL") return "animated";
    if (type === "IDAT") break;
    offset += 12 + data.getUint32(offset);
  }
  return { kind: "png", width: data.getUint32(16), height: data.getUint32(20) };
}

function readJpeg(bytes: Uint8Array): ImageInfo | null {
  const data = view(bytes);
  let offset = 2;
  while (offset + 9 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (jpegSizeMarkers.has(marker)) {
      return { kind: "jpg", width: data.getUint16(offset + 7), height: data.getUint16(offset + 5) };
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    offset += 2 + data.getUint16(offset + 2);
  }
  return null;
}

function readWebp(bytes: Uint8Array): ImageInfo | "animated" | null {
  if (bytes.length < 30) return null;
  const data = view(bytes);
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X") {
    if (bytes[20] & 0x02) return "animated";
    const width = 1 + (data.getUint32(24, true) & 0xffffff);
    const height = 1 + (data.getUint32(27, true) & 0xffffff);
    return { kind: "webp", width, height };
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const bits = data.getUint32(21, true);
    return { kind: "webp", width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
  }
  if (chunk === "VP8 " && startsWith(bytes, [0x9d, 0x01, 0x2a], 23)) {
    return { kind: "webp", width: data.getUint16(26, true) & 0x3fff, height: data.getUint16(28, true) & 0x3fff };
  }
  return null;
}

export function readImage(bytes: Uint8Array): ImageInfo | "animated" | null {
  if (startsWith(bytes, pngSignature)) return readPng(bytes);
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return readJpeg(bytes);
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return readWebp(bytes);
  return null;
}

export function inspectImage(file: { name: string; type: string }, bytes: Uint8Array): ImageInfo | ImageProblem {
  if (bytes.length === 0) return "empty";
  if (bytes.length > slideLimits.imageMaxBytes) return "too_large";
  const named = kindByExtension[file.name.split(".").pop()?.toLowerCase() ?? ""];
  if (!named || imageMimeByKind[named] !== file.type) return "bad_type";
  const read = readImage(bytes);
  if (read === "animated") return "animated";
  if (!read || read.kind !== named) return "not_image";
  if (read.width < 1 || read.height < 1) return "not_image";
  if (read.width > slideLimits.imageMaxSide || read.height > slideLimits.imageMaxSide) return "too_wide";
  return read;
}

export const imageProblemMessages: Record<ImageProblem, string> = {
  empty: "That file is empty.",
  too_large: "Images must be 2 MB or less.",
  bad_type: "Use a PNG, JPG or WebP image.",
  not_image: "That file is not a PNG, JPG or WebP image.",
  animated: "Animated images are not supported.",
  too_wide: `Images can be at most ${slideLimits.imageMaxSide.toLocaleString("en-US")} pixels on a side.`,
};
