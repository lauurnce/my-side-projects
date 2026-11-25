import { describe, expect, it } from "vitest";
import { slideLimits } from "@/lib/config";
import { fittedSize } from "./image-send";

describe("fittedSize", () => {
  it("leaves an image that already fits alone", () => {
    expect(fittedSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fittedSize(slideLimits.imageSendSide, 10)).toEqual({ width: slideLimits.imageSendSide, height: 10 });
  });

  it("shrinks the longest side to the limit and keeps the shape", () => {
    expect(fittedSize(3840, 2160)).toEqual({ width: 1920, height: 1080 });
    expect(fittedSize(2000, 4000)).toEqual({ width: 960, height: 1920 });
  });

  it("never returns a side below one pixel", () => {
    expect(fittedSize(40000, 1)).toEqual({ width: 1920, height: 1 });
  });
});
