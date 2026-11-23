import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { megabyte } from "@/lib/config";
import type { Activity } from "@/lib/quiz";
import type { Submission } from "@/lib/submissions";
import { HandInForm, type HandInFormProps } from "./HandInForm";
import { HandInView } from "./HandInView";
import { chosenProblem, fileFacts, lateWarning, progressLabel, scoreText, submitLabel, uploadPercent } from "./helpers";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  startHandIn: vi.fn(),
  finishHandIn: vi.fn(),
  cancelHandIn: vi.fn(),
  putFile: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

vi.mock("@/app/ops/handin-actions", () => ({
  startHandIn: mocks.startHandIn,
  finishHandIn: mocks.finishHandIn,
  cancelHandIn: mocks.cancelHandIn,
}));

vi.mock("@/components/decks/teacher/put-file", () => ({ uploadAborted: "upload_aborted", putFile: mocks.putFile }));

const activityId = "7b0f6a52-1c1d-4f6e-9d55-0d6d3a1f2c11";
const classId = "9d8c7b6a-52a7-4b6c-8a44-6f0b0f0f9d66";
const submissionId = "5a6b7c8d-1111-4222-8333-444455556666";
const uploadId = "0d6d3a1f-2c11-4f6e-9d55-7b0f6a521c1d";
const dueAt = "2026-11-27T04:00:00.000Z";
const beforeDue = Date.parse("2026-11-27T03:00:00.000Z");
const afterDue = Date.parse("2026-11-27T05:00:00.000Z");
const target = { url: "https://storage.test/upload/essay", contentType: "application/pdf" };

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: activityId,
    classId,
    lessonId: null,
    type: "upload",
    title: "Integration essay",
    instructionsMd: "",
    points: 20,
    dueAt,
    publishedAt: "2026-11-26T00:00:00.000Z",
    requiresDeckId: null,
    attemptLimit: 1,
    timeLimitMin: null,
    showAnswers: "never",
    ...overrides,
  };
}

function submission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: submissionId,
    activityId,
    studentId: "s1",
    uploadId,
    hasFile: true,
    fileName: "essay-final.pdf",
    fileKind: "PDF",
    sizeBytes: 1.2 * megabyte,
    submittedAt: "2026-11-27T02:00:00.000Z",
    isLate: false,
    score: null,
    feedback: null,
    gradedAt: null,
    gradedBy: null,
    filesRemovedAt: null,
    ...overrides,
  };
}

function fileOf(name: string, size: number): File {
  const file = new File(["%PDF-1.7"], name);
  Object.defineProperty(file, "size", { value: size });
  return file;
}

const essay = fileOf("essay.pdf", 2 * megabyte);

function renderForm(overrides: Partial<HandInFormProps> = {}) {
  return render(<HandInForm activityId={activityId} dueAt={dueAt} current={null} now={beforeDue} {...overrides} />);
}

function choose(file: File = essay) {
  fireEvent.change(screen.getByLabelText(/Your file/), { target: { files: [file] } });
}

function press(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

function chip(container: HTMLElement, status: string) {
  return container.querySelector(`[data-status="${status}"]`);
}

beforeEach(() => {
  mocks.startHandIn.mockResolvedValue({ status: "ok", uploadId, target });
  mocks.finishHandIn.mockResolvedValue({ status: "ok" });
  mocks.cancelHandIn.mockResolvedValue({ status: "ok" });
  mocks.putFile.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("hand-in overview", () => {
  it("shows the header and the facts", () => {
    render(<HandInView activity={activity()} submission={null} now={beforeDue} />);

    expect(screen.getAllByRole("heading", { level: 1 }).map((heading) => heading.textContent)).toEqual(["Integration essay"]);
    expect(screen.getByRole("link", { name: "Back to class" }).getAttribute("href")).toBe(`/classes/${classId}`);
    expect(screen.getByText("Layer 03 · Ops")).toBeTruthy();
    expect(screen.getByText("Upload")).toBeTruthy();
    expect(screen.getByText("Points: 20")).toBeTruthy();
    expect(screen.getByText("Due: Nov 27, 2026, 12:00 PM, Manila time")).toBeTruthy();
    expect(screen.getByText("One file, PDF or DOCX, 25 MB or less.")).toBeTruthy();
  });

  it("says when there is no due date and renders the instructions", () => {
    render(
      <HandInView activity={activity({ dueAt: null, instructionsMd: "Write **two** pages." })} submission={null} now={afterDue} />,
    );

    expect(screen.getByText("No due date")).toBeTruthy();
    expect(screen.getByText("two").tagName).toBe("STRONG");
    expect(screen.queryByText("Missing")).toBeNull();
  });

  it("shows the due chip and the hand in button before anything is handed in", () => {
    const { container } = render(<HandInView activity={activity()} submission={null} now={beforeDue} />);

    expect(chip(container, "due")?.textContent).toBe("Due");
    expect(screen.getByText("Not handed in yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hand in" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open file" })).toBeNull();
    expect(screen.queryByText("The due time has passed. Your file will be marked late.")).toBeNull();
  });

  it("shows missing past the due time and still accepts a file", () => {
    const { container } = render(<HandInView activity={activity()} submission={null} now={afterDue} />);

    expect(screen.getByText("Missing")).toBeTruthy();
    expect(chip(container, "due")).toBeNull();
    expect(chip(container, "late")).toBeNull();
    expect(screen.getByRole("button", { name: "Hand in" })).toBeTruthy();
    expect(screen.getByText("The due time has passed. Your file will be marked late.")).toBeTruthy();
  });

  it("shows the handed in file with a link to open it", () => {
    const { container } = render(<HandInView activity={activity()} submission={submission()} now={beforeDue} />);

    expect(chip(container, "submitted")?.textContent).toBe("Submitted");
    expect(chip(container, "late")).toBeNull();
    expect(screen.getByText("essay-final.pdf").tagName).toBe("BDI");
    expect(screen.getByText("PDF · 1.2 MB")).toBeTruthy();
    expect(screen.getByText("Handed in Nov 27, 2026, 10:00 AM, Manila time")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open file" }).getAttribute("href")).toBe(
      `/ops/${activityId}/submission/${submissionId}/file`,
    );
    expect(screen.getByRole("button", { name: "Replace file" })).toBeTruthy();
    expect(screen.getByText("The new file replaces the old one. Your teacher sees only the latest.")).toBeTruthy();
  });

  it("shows the late chip with how late the file was", () => {
    const late = submission({ isLate: true, submittedAt: "2026-11-29T05:00:00.000Z" });
    const { container } = render(<HandInView activity={activity()} submission={late} now={afterDue} />);

    expect(chip(container, "late")?.textContent).toBe("Late by 2 days");
    expect(chip(container, "submitted")).toBeNull();
    expect(screen.getByRole("button", { name: "Replace file" })).toBeTruthy();
  });

  it("shows the grade with the feedback as plain text and no form", () => {
    const feedback = "Good start.\n**Fix** the <b>second</b> part.";
    const graded = submission({ score: 18, feedback, gradedAt: "2026-11-28T01:30:00.000Z", gradedBy: "t1" });
    const { container } = render(<HandInView activity={activity()} submission={graded} now={afterDue} />);

    expect(chip(container, "graded")?.textContent).toBe("Graded");
    expect(screen.getAllByText("18 of 20").length).toBeGreaterThan(0);
    const shown = screen.getByText((_, element) => element?.tagName === "P" && element.textContent === feedback);
    expect(shown.querySelector("b, strong")).toBeNull();
    expect(screen.getByText("Graded Nov 28, 2026, 9:30 AM, Manila time")).toBeTruthy();
    expect(screen.getByText("This work is graded, so the file cannot be replaced.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open file" })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByLabelText(/Your file/)).toBeNull();
  });

  it("explains a removed file and keeps the score", () => {
    const removed = submission({
      hasFile: false,
      score: 20,
      gradedAt: "2026-11-28T01:30:00.000Z",
      filesRemovedAt: "2026-11-30T01:30:00.000Z",
    });
    render(<HandInView activity={activity()} submission={removed} now={afterDue} />);

    expect(
      screen.getByText("Your teacher removed the stored file after grading. Your score and feedback are kept."),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open file" })).toBeNull();
    expect(screen.getAllByText("20 of 20").length).toBeGreaterThan(0);
  });

  it("never renders a storage path", () => {
    const { container } = render(<HandInView activity={activity()} submission={submission()} now={beforeDue} />);
    expect(container.innerHTML).not.toContain(`${classId}/${activityId}`);
  });

  it("tells a browser without scripts that JavaScript is needed", () => {
    const markup = renderToStaticMarkup(<HandInForm activityId={activityId} dueAt={null} current={null} now={beforeDue} />);
    expect(markup).toMatch(/<noscript>.*Handing in a file needs JavaScript\..*<\/noscript>/);
  });
});

describe("hand-in form", () => {
  it("names the button by what it does", () => {
    renderForm();
    expect(screen.getByRole("button", { name: "Hand in" })).toBeTruthy();
    expect(screen.queryByText("The new file replaces the old one. Your teacher sees only the latest.")).toBeNull();
    cleanup();

    renderForm({ current: { isLate: false } });
    expect(screen.getByRole("button", { name: "Replace file" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Hand in" })).toBeNull();
  });

  it("shows the hint and the chosen file name and size as text", () => {
    renderForm();
    expect(screen.getByText("PDF or DOCX, 25 MB or less.")).toBeTruthy();
    expect(screen.getByLabelText(/Your file/).getAttribute("accept")).toBe(".pdf,.docx");

    choose();
    expect(screen.getByText("essay.pdf").tagName).toBe("BDI");
    expect(screen.getByText(/Chosen file:/).textContent).toBe("Chosen file: essay.pdf, 2 MB");
  });

  it.each([
    ["notes.txt", 100, "Error: Choose a file that ends in .pdf or .docx."],
    ["essay.pdf", 0, "Error: That file is empty."],
    ["essay.docx", 25 * megabyte + 1, "Error: That file is larger than 25 MB."],
  ])("refuses %s of %d bytes before sending", (name, size, message) => {
    renderForm();
    choose(fileOf(name, size));

    expect(screen.getByText(message)).toBeTruthy();
    press("Hand in");
    expect(mocks.startHandIn).not.toHaveBeenCalled();
  });

  it("asks for a file when none is chosen", () => {
    renderForm();
    press("Hand in");

    expect(screen.getByText("Error: Choose a file first.")).toBeTruthy();
    expect(mocks.startHandIn).not.toHaveBeenCalled();
  });

  it("starts, uploads, finishes and reports the hand-in", async () => {
    renderForm();
    choose();
    press("Hand in");

    await waitFor(() => expect(screen.getByText("Handed in")).toBeTruthy());
    expect(screen.getByText("Handed in").getAttribute("role")).toBe("status");
    expect(mocks.startHandIn).toHaveBeenCalledWith({ activityId, file: { name: "essay.pdf", size: 2 * megabyte } });
    expect(mocks.putFile.mock.calls[0][0]).toEqual(target);
    expect(mocks.putFile.mock.calls[0][1]).toBe(essay);
    expect(mocks.finishHandIn).toHaveBeenCalledWith({ uploadId });
    expect(mocks.cancelHandIn).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalled();
    expect(screen.queryByText(/Chosen file:/)).toBeNull();
  });

  it("says file replaced after a replacement", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: beforeDue });
    renderForm({ current: { isLate: false } });
    choose();
    press("Replace file");

    await waitFor(() => expect(screen.getByText("File replaced").getAttribute("role")).toBe("status"));
  });

  it("shows real progress, a cancel button and locked controls while uploading", async () => {
    let report: (loaded: number) => void = () => undefined;
    let release: () => void = () => undefined;
    mocks.putFile.mockImplementation(
      (_target: unknown, _file: File, onProgress: (loaded: number) => void) =>
        new Promise<void>((resolve) => {
          report = onProgress;
          release = resolve;
        }),
    );
    renderForm();
    choose();
    press("Hand in");

    await waitFor(() => expect(screen.getByText("Uploading 0%")).toBeTruthy());
    report(0.42 * 2 * megabyte);
    await waitFor(() => expect(screen.getByText("Uploading 42%")).toBeTruthy());
    expect((screen.getByLabelText("Upload progress") as HTMLProgressElement).value).toBe(42);
    expect((screen.getByRole("button", { name: "Hand in" }) as HTMLButtonElement).closest("fieldset")?.disabled).toBe(true);
    expect((screen.getByLabelText(/Your file/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();

    release();
    await waitFor(() => expect(screen.getByText("Handed in")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("cancels the reservation when the student cancels", async () => {
    mocks.putFile.mockImplementation(
      (_target: unknown, _file: File, _onProgress: unknown, signal: AbortSignal) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("upload_aborted")));
        }),
    );
    renderForm();
    choose();
    press("Hand in");

    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy());
    press("Cancel");

    await waitFor(() => expect(screen.getByText("Upload cancelled.")).toBeTruthy());
    expect(mocks.cancelHandIn).toHaveBeenCalledWith({ uploadId });
    expect(mocks.finishHandIn).not.toHaveBeenCalled();
  });

  it("cancels the reservation when the upload fails", async () => {
    mocks.putFile.mockRejectedValue(new Error("upload_failed"));
    renderForm();
    choose();
    press("Hand in");

    const message = "The upload failed. Check your connection and try again.";
    await waitFor(() => expect(screen.getByText(message).getAttribute("role")).toBe("alert"));
    expect(mocks.cancelHandIn).toHaveBeenCalledWith({ uploadId });
    expect(mocks.finishHandIn).not.toHaveBeenCalled();
    expect(screen.getByText(/Chosen file:/)).toBeTruthy();
  });

  it("shows the sentence the server gives when the start is refused", async () => {
    const message = "Storage is full, so new files cannot be accepted right now. Tell your teacher.";
    mocks.startHandIn.mockResolvedValue({ status: "error", message });
    renderForm();
    choose();
    press("Hand in");

    await waitFor(() => expect(screen.getByText(message).getAttribute("role")).toBe("alert"));
    expect(mocks.putFile).not.toHaveBeenCalled();
  });

  it("shows the sentence the server gives when the check fails", async () => {
    const message = "That file is not a PDF. Export it again and retry.";
    mocks.finishHandIn.mockResolvedValue({ status: "error", message });
    renderForm();
    choose();
    press("Hand in");

    await waitFor(() => expect(screen.getByText(message).getAttribute("role")).toBe("alert"));
    expect(screen.queryByText("Handed in")).toBeNull();
  });

  it("reports a server that does not answer", async () => {
    mocks.startHandIn.mockRejectedValue(new Error("network"));
    renderForm();
    choose();
    press("Hand in");

    await waitFor(() =>
      expect(screen.getByText("The server did not answer. Check your connection and try again.")).toBeTruthy(),
    );
  });
});

describe("late warnings", () => {
  const onTimeWarning = "Your file was handed in on time. Replacing it now will mark it late.";

  it("warns that a first file past the due time will be late", () => {
    renderForm({ now: afterDue });
    expect(screen.getByText("The due time has passed. Your file will be marked late.")).toBeTruthy();
  });

  it("needs a second press to replace an on-time file after the due time", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: afterDue });
    renderForm({ current: { isLate: false }, now: afterDue });
    choose();
    press("Replace file");

    expect(screen.getByRole("alert").textContent).toContain(onTimeWarning);
    expect(mocks.startHandIn).not.toHaveBeenCalled();

    press("Replace file");
    await waitFor(() => expect(mocks.startHandIn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("File replaced")).toBeTruthy());
    expect(screen.queryByText(onTimeWarning)).toBeNull();
  });

  it("lets the student keep the current file", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: afterDue });
    renderForm({ current: { isLate: false }, now: afterDue });
    choose();
    press("Replace file");
    press("Keep the current file");

    expect(screen.queryByText(onTimeWarning)).toBeNull();
    expect(mocks.startHandIn).not.toHaveBeenCalled();
  });

  it("warns when the due time passes while the page is open", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: afterDue });
    renderForm({ current: { isLate: false }, now: beforeDue });
    choose();
    press("Replace file");

    expect(screen.getByText(onTimeWarning)).toBeTruthy();
    expect(mocks.startHandIn).not.toHaveBeenCalled();
  });

  it("does not warn before the due time or when the file is already late", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: beforeDue });
    renderForm({ current: { isLate: false }, now: beforeDue });
    choose();
    press("Replace file");
    await waitFor(() => expect(mocks.startHandIn).toHaveBeenCalledTimes(1));
    cleanup();

    vi.setSystemTime(afterDue);
    renderForm({ current: { isLate: true }, now: afterDue });
    choose();
    press("Replace file");
    await waitFor(() => expect(mocks.startHandIn).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(onTimeWarning)).toBeNull();
  });
});

describe("hand-in helpers", () => {
  it("decides the late warning", () => {
    const due = Date.parse(dueAt);
    expect(lateWarning(null, null, afterDue)).toBe("none");
    expect(lateWarning(dueAt, null, due - 1)).toBe("none");
    expect(lateWarning(dueAt, null, due)).toBe("new_late");
    expect(lateWarning(dueAt, { isLate: false }, due - 1)).toBe("none");
    expect(lateWarning(dueAt, { isLate: false }, due)).toBe("replace_late");
    expect(lateWarning(dueAt, { isLate: true }, afterDue)).toBe("none");
  });

  it("gives the pre-check sentences", () => {
    expect(chosenProblem({ name: "essay.pdf", size: 10 })).toBeNull();
    expect(chosenProblem({ name: "essay.DOCX", size: 25 * megabyte })).toBeNull();
    expect(chosenProblem({ name: "essay.doc", size: 10 })).toBe("Choose a file that ends in .pdf or .docx.");
    expect(chosenProblem({ name: "essay.pdf", size: 0 })).toBe("That file is empty.");
    expect(chosenProblem({ name: "essay.pdf", size: 25 * megabyte + 1 })).toBe("That file is larger than 25 MB.");
  });

  it("rounds progress down and keeps it in range", () => {
    expect(uploadPercent(0, 200)).toBe(0);
    expect(uploadPercent(85, 200)).toBe(42);
    expect(uploadPercent(199, 200)).toBe(99);
    expect(uploadPercent(500, 200)).toBe(100);
    expect(uploadPercent(-5, 200)).toBe(0);
    expect(uploadPercent(5, 0)).toBe(0);
    expect(progressLabel(42)).toBe("Uploading 42%");
  });

  it("labels the button, the file and the score", () => {
    expect(submitLabel(false)).toBe("Hand in");
    expect(submitLabel(true)).toBe("Replace file");
    expect(fileFacts({ fileKind: "DOCX", sizeBytes: 300 * 1024 })).toBe("DOCX · 300 KB");
    expect(scoreText(18, 20)).toBe("18 of 20");
  });
});
