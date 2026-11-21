import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { megabyte } from "@/lib/config";
import { DeckUploadForm } from "./DeckUploadForm";
import { lessonGroups } from "./labels";
import { putFile } from "./put-file";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  startDeckUpload: vi.fn(),
  finishDeckUpload: vi.fn(),
  cancelDeckUpload: vi.fn(),
  putFile: vi.fn(),
  getDocument: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

vi.mock("@/app/decks/upload-actions", () => ({
  startDeckUpload: mocks.startDeckUpload,
  finishDeckUpload: mocks.finishDeckUpload,
  cancelDeckUpload: mocks.cancelDeckUpload,
}));

vi.mock("@/lib/pdf-client", () => ({
  documentOptions: { isEvalSupported: false, enableXfa: false, stopAtErrors: true },
  loadPdfjs: async () => ({ getDocument: mocks.getDocument }),
}));

vi.mock("./put-file", () => ({ uploadAborted: "upload_aborted", putFile: mocks.putFile }));

const classId = "3f2b8c1e-6a4d-4e5f-9b7a-1c2d3e4f5a6b";
const deckId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const weekOne = "11111111-1111-4111-8111-111111111111";
const brokers = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const lessons = lessonGroups({
  classId,
  modules: [
    {
      id: weekOne,
      classId,
      title: "Week 1",
      lessons: [
        { id: brokers, moduleId: weekOne, title: "Message brokers", estMinutes: 12, published: false, done: false },
      ],
    },
  ],
});

const pdfTarget = { url: "https://storage.test/upload/slides", contentType: "application/pdf" };
const pptxTarget = {
  url: "https://storage.test/upload/original",
  contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function fileOf(name: string, size: number): File {
  const file = new File(["%PDF-1.7"], name);
  Object.defineProperty(file, "size", { value: size });
  Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(8) });
  return file;
}

const slides = fileOf("week-1.pdf", 300);
const original = fileOf("week-1.pptx", 100);

function opensWith(pages: number) {
  mocks.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: pages }), destroy: mocks.destroy });
}

function failsToOpenWith(name: string) {
  const failure = Promise.reject(Object.assign(new Error("cannot open"), { name }));
  failure.catch(() => undefined);
  mocks.getDocument.mockReturnValue({ promise: failure, destroy: mocks.destroy });
}

function renderForm(storageFull = false) {
  return render(<DeckUploadForm classId={classId} lessons={lessons} storageFull={storageFull} />);
}

function titleInput() {
  return screen.getByLabelText("Deck title") as HTMLInputElement;
}

function choose(label: RegExp, file: File) {
  fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } });
}

function choosePdf(file: File = slides) {
  choose(/Slides as PDF/, file);
}

function choosePptx(file: File = original) {
  choose(/PowerPoint original/, file);
}

function fill(title = "Week 1 slides") {
  fireEvent.change(titleInput(), { target: { value: title } });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Upload deck" }));
}

beforeEach(() => {
  mocks.destroy.mockResolvedValue(undefined);
  mocks.startDeckUpload.mockResolvedValue({ status: "ok", deckId, targets: { pdf: pdfTarget, pptx: null } });
  mocks.finishDeckUpload.mockResolvedValue({ status: "ok" });
  mocks.cancelDeckUpload.mockResolvedValue({ status: "ok" });
  mocks.putFile.mockResolvedValue(undefined);
  opensWith(24);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("upload form", () => {
  it("explains what to upload, once", () => {
    renderForm();
    expect(
      screen.getAllByText("Upload a PDF. To share a PowerPoint, export it to PDF and add both files."),
    ).toHaveLength(1);
    expect(screen.getByText("PDF, 50 MB or less. This is what students see.")).toBeTruthy();
    expect(screen.getByText("Optional. The PowerPoint file students can download.")).toBeTruthy();
  });

  it("lists every lesson and marks drafts", () => {
    renderForm();
    const select = screen.getByLabelText("Link to a lesson") as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual(["No lesson", "Message brokers (Draft)"]);
    expect(select.value).toBe("");
  });

  it("shows the chosen file name and size as text", () => {
    renderForm();
    choosePdf();
    choosePptx();
    expect(screen.getByText("week-1.pdf, 1 KB")).toBeTruthy();
    expect(screen.getByText("week-1.pptx, 1 KB")).toBeTruthy();
  });

  it("refuses a file of the wrong kind before anything is sent", () => {
    renderForm();
    choosePdf(fileOf("week-1.docx", 300));
    choosePptx(fileOf("week-1.pptm", 300));
    expect(screen.getByText("Error: Choose a file that ends in .pdf.")).toBeTruthy();
    expect(screen.getByText("Error: Choose a file that ends in .pptx.")).toBeTruthy();
  });

  it("refuses a file above 50 MB", () => {
    renderForm();
    choosePdf(fileOf("week-1.pdf", 50 * megabyte + 1));
    expect(screen.getByText("Error: The PDF is larger than 50 MB.")).toBeTruthy();
  });

  it("warns that a large deck loads slowly", () => {
    renderForm();
    choosePdf();
    expect(screen.queryByText("Large decks load slowly for students on phones.")).toBeNull();
    choosePdf(fileOf("big.pdf", 21 * megabyte));
    expect(screen.getByText("Large decks load slowly for students on phones.")).toBeTruthy();
  });

  it("asks for a title and a PDF", () => {
    renderForm();
    submit();
    expect(screen.getByText("Error: Enter a deck title")).toBeTruthy();
    expect(screen.getByText("Error: Choose a PDF file.")).toBeTruthy();
    expect(mocks.getDocument).not.toHaveBeenCalled();
    expect(mocks.startDeckUpload).not.toHaveBeenCalled();
  });

  it("stops at a password protected PDF", async () => {
    failsToOpenWith("PasswordException");
    renderForm();
    fill();
    choosePdf();
    submit();
    expect(
      await screen.findByText("Error: This PDF is password protected. Remove the password and try again."),
    ).toBeTruthy();
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
    expect(mocks.startDeckUpload).not.toHaveBeenCalled();
  });

  it("stops at a PDF that cannot be opened", async () => {
    failsToOpenWith("InvalidPDFException");
    renderForm();
    fill();
    choosePdf();
    submit();
    expect(await screen.findByText("Error: This PDF could not be opened. Export it again and retry.")).toBeTruthy();
    expect(mocks.startDeckUpload).not.toHaveBeenCalled();
  });

  it("stops at a PDF with more than 300 pages", async () => {
    opensWith(301);
    renderForm();
    fill();
    choosePdf();
    submit();
    expect(await screen.findByText("Error: This PDF has 301 pages. A deck can have 300 at most.")).toBeTruthy();
    expect(mocks.startDeckUpload).not.toHaveBeenCalled();
  });

  it("opens the PDF with the safe options", async () => {
    renderForm();
    fill();
    choosePdf();
    submit();
    await screen.findByText("Deck uploaded");
    expect(mocks.getDocument).toHaveBeenCalledWith({
      data: expect.any(ArrayBuffer),
      isEvalSupported: false,
      enableXfa: false,
      stopAtErrors: true,
    });
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
  });

  it("uploads a PDF, finishes with the page count and resets", async () => {
    renderForm();
    fill("  Week 1 slides ");
    choosePdf();
    fireEvent.change(screen.getByLabelText("Link to a lesson"), { target: { value: brokers } });
    submit();

    const done = await screen.findByText("Deck uploaded");
    expect(done.getAttribute("role")).toBe("status");
    expect(mocks.startDeckUpload).toHaveBeenCalledWith({
      classId,
      title: "Week 1 slides",
      lessonId: brokers,
      pdf: { name: "week-1.pdf", size: 300 },
      pptx: null,
    });
    expect(mocks.putFile).toHaveBeenCalledTimes(1);
    expect(mocks.putFile.mock.calls[0].slice(0, 2)).toEqual([pdfTarget, slides]);
    expect(mocks.finishDeckUpload).toHaveBeenCalledWith({ deckId, slideCount: 24 });
    expect(mocks.cancelDeckUpload).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(titleInput().value).toBe("");
    expect(screen.queryByText("week-1.pdf, 1 KB")).toBeNull();
  });

  it("sends both files in order when a PPTX is added", async () => {
    mocks.startDeckUpload.mockResolvedValue({ status: "ok", deckId, targets: { pdf: pdfTarget, pptx: pptxTarget } });
    renderForm();
    fill();
    choosePdf();
    choosePptx();
    submit();
    await screen.findByText("Deck uploaded");
    expect(mocks.startDeckUpload.mock.calls[0][0].pptx).toEqual({ name: "week-1.pptx", size: 100 });
    expect(mocks.putFile.mock.calls.map((call) => call.slice(0, 2))).toEqual([
      [pdfTarget, slides],
      [pptxTarget, original],
    ]);
  });

  it("shows real progress across both files and locks the controls", async () => {
    mocks.startDeckUpload.mockResolvedValue({ status: "ok", deckId, targets: { pdf: pdfTarget, pptx: pptxTarget } });
    const finishFile: (() => void)[] = [];
    mocks.putFile.mockImplementation(() => new Promise<void>((resolve) => finishFile.push(resolve)));
    renderForm();
    fill();
    choosePdf();
    choosePptx();
    submit();

    await screen.findByText("Uploading 0%");
    expect(titleInput().matches(":disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Upload deck" }).matches(":disabled")).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(false);

    const reportFirst = vi.mocked(putFile).mock.calls[0][2];
    reportFirst(168);
    await screen.findByText("Uploading 42%");
    expect((screen.getByRole("progressbar", { name: "Upload progress" }) as HTMLProgressElement).value).toBe(42);

    finishFile[0]();
    await screen.findByText("Uploading 75%");
    await waitFor(() => expect(mocks.putFile).toHaveBeenCalledTimes(2));
    vi.mocked(putFile).mock.calls[1][2](50);
    await screen.findByText("Uploading 87%");

    finishFile[1]();
    await screen.findByText("Deck uploaded");
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(titleInput().matches(":disabled")).toBe(false);
  });

  it("shows the server sentence when the reservation is refused", async () => {
    mocks.startDeckUpload.mockResolvedValue({ status: "error", message: "A class can have 40 decks at most." });
    renderForm();
    fill();
    choosePdf();
    submit();
    expect((await screen.findByRole("alert")).textContent).toBe("A class can have 40 decks at most.");
    expect(mocks.putFile).not.toHaveBeenCalled();
    expect(titleInput().value).toBe("Week 1 slides");
  });

  it("frees the reservation when the upload fails", async () => {
    mocks.putFile.mockRejectedValue(new Error("upload_failed"));
    renderForm();
    fill();
    choosePdf();
    submit();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "The upload failed. Check your connection and try again.",
    );
    expect(mocks.cancelDeckUpload).toHaveBeenCalledWith({ deckId });
    expect(mocks.finishDeckUpload).not.toHaveBeenCalled();
    expect(titleInput().value).toBe("Week 1 slides");
    expect(screen.getByText("week-1.pdf, 1 KB")).toBeTruthy();
  });

  it("aborts the request and frees the reservation on Cancel", async () => {
    mocks.putFile.mockImplementation(
      (_target: unknown, _file: unknown, _report: unknown, signal: AbortSignal) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("upload_aborted")));
        }),
    );
    renderForm();
    fill();
    choosePdf();
    submit();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await screen.findByText("Upload cancelled.");
    expect(vi.mocked(putFile).mock.calls[0][3].aborted).toBe(true);
    expect(mocks.cancelDeckUpload).toHaveBeenCalledWith({ deckId });
    expect(mocks.finishDeckUpload).not.toHaveBeenCalled();
  });

  it("shows why the finish step refused the file", async () => {
    mocks.finishDeckUpload.mockResolvedValue({ status: "error", message: "That file is not a PDF." });
    renderForm();
    fill();
    choosePdf();
    submit();
    expect((await screen.findByRole("alert")).textContent).toBe("That file is not a PDF.");
    expect(mocks.cancelDeckUpload).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("says so when the server does not answer", async () => {
    mocks.startDeckUpload.mockRejectedValue(new Error("network"));
    renderForm();
    fill();
    choosePdf();
    submit();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "The server did not answer. Check your connection and try again.",
    );
    expect(titleInput().matches(":disabled")).toBe(false);
  });

  it("takes the PowerPoint file away again", () => {
    renderForm();
    choosePptx();
    fireEvent.click(screen.getByRole("button", { name: "Remove the PowerPoint file" }));
    expect(screen.queryByText("week-1.pptx, 1 KB")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove the PowerPoint file" })).toBeNull();
  });

  it("disables the upload when storage is full", () => {
    renderForm(true);
    expect(screen.getByText("Storage is full.")).toBeTruthy();
    expect(titleInput().matches(":disabled")).toBe(true);
    expect(screen.getByLabelText(/Slides as PDF/).matches(":disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Upload deck" }).matches(":disabled")).toBe(true);
    fireEvent.submit(screen.getByRole("form", { name: "Upload a deck" }));
    expect(mocks.getDocument).not.toHaveBeenCalled();
  });
});
