import { describe, expect, it } from "vitest";
import { slideLimits } from "@/lib/config";
import { inspectImage, readImage } from "./image-file";

function bytesOf(...parts: (number[] | string)[]): Uint8Array {
  return Uint8Array.from(parts.flatMap((part) => (typeof part === "string" ? [...part].map((char) => char.charCodeAt(0)) : part)));
}

function be32(value: number): number[] {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function be16(value: number): number[] {
  return [(value >>> 8) & 255, value & 255];
}

function le24(value: number): number[] {
  return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255];
}

const pngHead = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function png(width: number, height: number, extraChunk = ""): Uint8Array {
  const header = bytesOf(pngHead, be32(13), "IHDR", be32(width), be32(height), [8, 6, 0, 0, 0], be32(0));
  const extra = extraChunk ? bytesOf(be32(8), extraChunk, be32(1), be32(0), be32(0)) : new Uint8Array();
  return bytesOf([...header], [...extra], be32(0), "IDAT", be32(0));
}

function jpeg(width: number, height: number, exifBytes = 0): Uint8Array {
  const exif = exifBytes ? [0xff, 0xe1, ...be16(exifBytes + 2), ...new Array(exifBytes).fill(0)] : [];
  return bytesOf([0xff, 0xd8], [0xff, 0xe0, ...be16(16), ...new Array(14).fill(0)], exif, [0xff, 0xc0, ...be16(17), 8, ...be16(height), ...be16(width), 3], new Array(12).fill(0));
}

function webpExtended(width: number, height: number, flags = 0): Uint8Array {
  return bytesOf("RIFF", be32(0), "WEBP", "VP8X", [10, 0, 0, 0], [flags, 0, 0, 0], le24(width - 1), le24(height - 1), [0, 0]);
}

function webpLossless(width: number, height: number): Uint8Array {
  const bits = (width - 1) | ((height - 1) << 14);
  return bytesOf("RIFF", be32(0), "WEBP", "VP8L", [10, 0, 0, 0], [0x2f], [bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255], new Array(8).fill(0));
}

function webpLossy(width: number, height: number): Uint8Array {
  return bytesOf("RIFF", be32(0), "WEBP", "VP8 ", [10, 0, 0, 0], [0, 0, 0], [0x9d, 0x01, 0x2a], [width & 255, width >>> 8], [height & 255, height >>> 8], [0, 0]);
}

describe("readImage", () => {
  it("reads the size of each format", () => {
    expect(readImage(png(640, 480))).toEqual({ kind: "png", width: 640, height: 480 });
    expect(readImage(jpeg(1024, 768))).toEqual({ kind: "jpg", width: 1024, height: 768 });
    expect(readImage(jpeg(1024, 768, 60000))).toEqual({ kind: "jpg", width: 1024, height: 768 });
    expect(readImage(webpExtended(1920, 1080))).toEqual({ kind: "webp", width: 1920, height: 1080 });
    expect(readImage(webpLossless(800, 600))).toEqual({ kind: "webp", width: 800, height: 600 });
    expect(readImage(webpLossy(320, 200))).toEqual({ kind: "webp", width: 320, height: 200 });
  });

  it("flags animated files", () => {
    expect(readImage(png(64, 64, "acTL"))).toBe("animated");
    expect(readImage(webpExtended(64, 64, 0x02))).toBe("animated");
  });

  it("returns null for anything else", () => {
    expect(readImage(bytesOf("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    expect(readImage(bytesOf("%PDF-1.7"))).toBeNull();
    expect(readImage(bytesOf("GIF89a", new Array(20).fill(0)))).toBeNull();
    expect(readImage(bytesOf(pngHead))).toBeNull();
    expect(readImage(bytesOf([0xff, 0xd8, 0xff, 0xd9], new Array(12).fill(0)))).toBeNull();
    expect(readImage(new Uint8Array())).toBeNull();
  });
});

describe("inspectImage", () => {
  it("accepts a file whose name, declared type and bytes agree", () => {
    expect(inspectImage({ name: "broker.PNG", type: "image/png" }, png(640, 480))).toEqual({ kind: "png", width: 640, height: 480 });
    expect(inspectImage({ name: "photo.jpeg", type: "image/jpeg" }, jpeg(800, 600))).toMatchObject({ kind: "jpg" });
    expect(inspectImage({ name: "art.webp", type: "image/webp" }, webpLossy(320, 200))).toMatchObject({ kind: "webp" });
  });

  it.each([
    ["an empty file", { name: "a.png", type: "image/png" }, new Uint8Array(), "empty"],
    ["a file over 2 MB", { name: "a.png", type: "image/png" }, new Uint8Array(slideLimits.imageMaxBytes + 1), "too_large"],
    ["an svg", { name: "a.svg", type: "image/svg+xml" }, bytesOf("<svg></svg>"), "bad_type"],
    ["a name and type that disagree", { name: "a.png", type: "image/jpeg" }, png(10, 10), "bad_type"],
    ["no extension", { name: "image", type: "image/png" }, png(10, 10), "bad_type"],
    ["a jpeg named png", { name: "a.png", type: "image/png" }, jpeg(10, 10), "not_image"],
    ["html named png", { name: "a.png", type: "image/png" }, bytesOf("<html><script>alert(1)</script></html>"), "not_image"],
    ["an animated png", { name: "a.png", type: "image/png" }, png(64, 64, "acTL"), "animated"],
    ["a png wider than the limit", { name: "a.png", type: "image/png" }, png(slideLimits.imageMaxSide + 1, 10), "too_wide"],
    ["a png taller than the limit", { name: "a.png", type: "image/png" }, png(10, 60000), "too_wide"],
    ["a png with no size", { name: "a.png", type: "image/png" }, png(0, 10), "not_image"],
  ])("refuses %s", (_name, file, bytes, problem) => {
    expect(inspectImage(file, bytes)).toBe(problem);
  });

  it("accepts the largest allowed side", () => {
    expect(inspectImage({ name: "a.png", type: "image/png" }, png(slideLimits.imageMaxSide, slideLimits.imageMaxSide))).toMatchObject({ kind: "png" });
  });
});
