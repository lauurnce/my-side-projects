import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { putFile, uploadAborted } from "./put-file";

class FakeRequest {
  static last: FakeRequest;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown = null;
  status = 0;
  upload: { onprogress: ((event: { loaded: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeRequest.last = this;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  send(body: unknown) {
    this.body = body;
  }

  abort() {
    this.onabort?.();
  }

  answer(status: number) {
    this.status = status;
    this.onload?.();
  }
}

const target = { url: "https://storage.test/upload/slides?token=one", contentType: "application/pdf" };
const file = new File(["%PDF-1.7"], "week-1.pdf");

beforeEach(() => {
  vi.stubGlobal("XMLHttpRequest", FakeRequest);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("putFile", () => {
  it("sends one PUT with the file as the body and the two headers", async () => {
    const sent = putFile(target, file, () => {}, new AbortController().signal);
    const request = FakeRequest.last;
    expect([request.method, request.url]).toEqual(["PUT", target.url]);
    expect(request.headers).toEqual({ "content-type": "application/pdf", "x-upsert": "false" });
    expect(request.body).toBe(file);
    request.answer(200);
    await expect(sent).resolves.toBeUndefined();
  });

  it("reports the bytes the browser has sent", async () => {
    const report = vi.fn();
    const sent = putFile(target, file, report, new AbortController().signal);
    FakeRequest.last.upload.onprogress?.({ loaded: 3 });
    FakeRequest.last.upload.onprogress?.({ loaded: 8 });
    FakeRequest.last.answer(200);
    await sent;
    expect(report.mock.calls).toEqual([[3], [8]]);
  });

  it("fails when storage refuses the file", async () => {
    const sent = putFile(target, file, () => {}, new AbortController().signal);
    FakeRequest.last.answer(409);
    await expect(sent).rejects.toThrow("upload_refused");
  });

  it("fails when the connection drops", async () => {
    const sent = putFile(target, file, () => {}, new AbortController().signal);
    FakeRequest.last.onerror?.();
    await expect(sent).rejects.toThrow("upload_failed");
  });

  it("aborts the request when the signal fires", async () => {
    const controller = new AbortController();
    const sent = putFile(target, file, () => {}, controller.signal);
    controller.abort();
    await expect(sent).rejects.toThrow(uploadAborted);
  });

  it("sends nothing when the signal has already fired", async () => {
    const controller = new AbortController();
    controller.abort();
    const before = FakeRequest.last;
    await expect(putFile(target, file, () => {}, controller.signal)).rejects.toThrow(uploadAborted);
    expect(FakeRequest.last).toBe(before);
  });
});
