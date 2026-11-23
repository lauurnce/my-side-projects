import { describe, expect, it } from "vitest";
import { deckLimits, megabyte, storagePlan } from "@/lib/config";
import {
  deckFormat,
  downloadFileName,
  formatBytes,
  freeBytes,
  toDeckSummary,
  toStorageUsage,
  usageLevel,
} from "@/lib/decks";

const row = {
  id: "d1",
  class_id: "c1",
  lesson_id: null,
  title: "Message-based integration",
  kind: "pptx",
  slide_count: 24,
  size_bytes: 3 * megabyte,
  ready_at: "2026-11-22T01:00:00Z",
  created_at: "2026-11-22T00:59:00Z",
};

describe("download file name", () => {
  it("keeps letters and digits and takes the extension from the kind", () => {
    expect(downloadFileName("Week 3: Message-based integration", "pdf")).toBe("Week-3-Message-based-integration.pdf");
    expect(downloadFileName("Week 3", "pptx")).toBe("Week-3.pptx");
  });

  it("drops path parts, quotes and line breaks", () => {
    expect(downloadFileName('../../etc/passwd"\r\nX-Evil: 1', "pdf")).toBe("etc-passwd-X-Evil-1.pdf");
    expect(downloadFileName("report.exe", "pdf")).toBe("report-exe.pdf");
  });

  it("falls back to deck when nothing is left", () => {
    expect(downloadFileName("数据库", "pdf")).toBe("deck.pdf");
    expect(downloadFileName("...", "pptx")).toBe("deck.pptx");
  });

  it("caps the length", () => {
    expect(downloadFileName("a".repeat(120), "pdf")).toBe(`${"a".repeat(80)}.pdf`);
  });
});

describe("deck summary", () => {
  it("maps a row and clamps the viewed count to the slide count", () => {
    expect(toDeckSummary(row, 30)).toMatchObject({ kind: "pptx", slideCount: 24, viewedCount: 24, ready: true });
    expect(toDeckSummary(row, -2).viewedCount).toBe(0);
  });

  it("treats an unfinished upload as not ready with no slides", () => {
    expect(toDeckSummary({ ...row, slide_count: null, ready_at: null }, 3)).toMatchObject({
      ready: false,
      slideCount: 0,
      viewedCount: 0,
    });
  });

  it("names the format of the downloadable file", () => {
    expect(deckFormat("pptx")).toBe("PPTX");
    expect(deckFormat("pdf")).toBe("PDF");
  });
});

describe("sizes", () => {
  it("formats bytes for people", () => {
    expect(formatBytes(300)).toBe("1 KB");
    expect(formatBytes(512 * 1024)).toBe("512 KB");
    expect(formatBytes(12.44 * megabyte)).toBe("12.4 MB");
    expect(formatBytes(312 * megabyte)).toBe("312 MB");
  });
});

describe("storage usage", () => {
  const budgetBytes = deckLimits.budgetBytes;

  it("reads the usage the database returns", () => {
    expect(toStorageUsage({ used_bytes: 5, reserved_bytes: 2, budget_bytes: 10 })).toEqual({
      usedBytes: 5,
      reservedBytes: 2,
      budgetBytes: 10,
    });
    expect(toStorageUsage(null)).toBeNull();
    expect(toStorageUsage({ used_bytes: "5" })).toBeNull();
  });

  it("counts reservations against the free space", () => {
    expect(freeBytes({ usedBytes: 100, reservedBytes: 50, budgetBytes: 400 })).toBe(250);
    expect(freeBytes({ usedBytes: 500, reservedBytes: 0, budgetBytes: 400 })).toBe(0);
  });

  it("warns at 90 percent and stops at full", () => {
    expect(usageLevel({ usedBytes: 0.5 * budgetBytes, reservedBytes: 0, budgetBytes })).toBe("ok");
    expect(usageLevel({ usedBytes: 0.85 * budgetBytes, reservedBytes: 0.05 * budgetBytes, budgetBytes })).toBe(
      "nearly_full",
    );
    expect(usageLevel({ usedBytes: budgetBytes, reservedBytes: 0, budgetBytes })).toBe("full");
  });

  it("keeps the deck budget inside the storage plan", () => {
    expect(deckLimits.budgetBytes).toBeLessThan(storagePlan.totalBytes);
  });
});
