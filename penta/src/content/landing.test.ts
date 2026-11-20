import { describe, expect, it } from "vitest";
import { panelsContent } from "@/content/landing";
import { megabyte, submissionUpload } from "@/lib/config";

describe("landing content", () => {
  it("shows the submission size limit from the config", () => {
    const text = JSON.stringify(panelsContent);
    expect(text).toContain(`DOCX or PDF · ${submissionUpload.maxBytes / megabyte} MB`);
    expect(text).toContain("25 MB");
  });
});
