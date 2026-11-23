import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { uploadSettingsValues, type GradeState, type SaveUploadSettingsState } from "@/app/ops/grading-schema";
import type { Activity } from "@/lib/quiz";
import type { GradeLogEntry, Submission } from "@/lib/submissions";
import { GradeForm } from "./GradeForm";
import {
  buildRows,
  gradeRecord,
  gradingNotes,
  historySentence,
  isStorageAlmostFull,
  stateChip,
  storageLine,
  summaryCounts,
  summaryLine,
  toSubmissionStorage,
} from "./helpers";
import { StoragePanel } from "./StoragePanel";
import { SubmissionList } from "./SubmissionList";
import { UploadActions } from "./UploadActions";
import { UploadSettingsForm } from "./UploadSettingsForm";

afterEach(cleanup);

const megabyte = 1024 * 1024;
const activityId = "11111111-1111-4111-8111-111111111111";
const teacher = { id: "99999999-9999-4999-8999-999999999999", fullName: "Maria Santos" };
const ana = { studentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", fullName: "Ana Reyes" };
const ben = { studentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", fullName: "Ben Cruz" };
const carla = { studentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", fullName: "Carla Diaz" };
const goneStudentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4";
const beforeDue = Date.parse("2026-11-28T00:00:00.000Z");
const afterDue = Date.parse("2026-12-02T00:00:00.000Z");

const activity: Activity = {
  id: activityId,
  classId: "3f2b8c1e-6a4d-4e5f-9b7a-1c2d3e4f5a6b",
  lessonId: null,
  type: "upload",
  title: "Essay 1",
  instructionsMd: "Hand in **one** file.",
  points: 20,
  dueAt: "2026-11-30T15:59:00.000Z",
  publishedAt: "2026-11-20T01:00:00.000Z",
  requiresDeckId: null,
  attemptLimit: 1,
  timeLimitMin: null,
  showAnswers: "never",
};

function submission(studentId: string, changes: Partial<Submission> = {}): Submission {
  return {
    id: `5${studentId.slice(1)}`,
    activityId,
    studentId,
    uploadId: `7${studentId.slice(1)}`,
    hasFile: true,
    fileName: "essay.pdf",
    fileKind: "PDF",
    sizeBytes: 2 * megabyte,
    submittedAt: "2026-11-29T02:00:00.000Z",
    isLate: false,
    score: null,
    feedback: null,
    gradedAt: null,
    gradedBy: null,
    filesRemovedAt: null,
    ...changes,
  };
}

const anaGraded = submission(ana.studentId, {
  score: 17,
  feedback: "Clear argument.",
  gradedAt: "2026-11-28T07:10:00.000Z",
  gradedBy: teacher.id,
});
const benLate = submission(ben.studentId, {
  fileName: "ben-final.docx",
  fileKind: "DOCX",
  submittedAt: "2026-11-30T18:59:00.000Z",
  isLate: true,
});
const goneGraded = submission(goneStudentId, {
  hasFile: false,
  score: 12,
  gradedAt: "2026-11-27T03:00:00.000Z",
  gradedBy: "88888888-8888-4888-8888-888888888888",
  filesRemovedAt: "2026-11-28T03:00:00.000Z",
});

const anaLog: GradeLogEntry[] = [
  {
    id: "l1",
    submissionId: anaGraded.id,
    oldScore: null,
    newScore: 18,
    gradedBy: "88888888-8888-4888-8888-888888888888",
    gradedAt: "2026-11-27T05:00:00.000Z",
  },
  {
    id: "l2",
    submissionId: anaGraded.id,
    oldScore: 18,
    newScore: 17,
    gradedBy: teacher.id,
    gradedAt: "2026-11-28T07:10:00.000Z",
  },
];

const roster = [carla, ben, ana];
const submissions = [anaGraded, benLate, goneGraded];

function rowsAt(now: number) {
  return buildRows(activity, roster, submissions, anaLog, teacher, now);
}

const noGrade = vi.fn(async (): Promise<GradeState> => ({}));

describe("row model", () => {
  it("lists enrolled students by name, then students who are no longer enrolled", () => {
    const rows = rowsAt(beforeDue);
    expect(rows.map((row) => [row.name, row.state])).toEqual([
      ["Ana Reyes", "graded"],
      ["Ben Cruz", "handed_in"],
      ["Carla Diaz", "not_handed_in"],
      ["Removed student", "graded"],
    ]);
    expect(rows[3].studentId).toBe(goneStudentId);
  });

  it("marks a student with nothing handed in as missing once past due", () => {
    expect(rowsAt(afterDue)[2].state).toBe("missing");
    expect([stateChip("missing"), stateChip("not_handed_in")]).toEqual([
      { status: "due", word: "Missing" },
      { status: "due", word: "Not handed in" },
    ]);
    expect([stateChip("handed_in").word, stateChip("graded").word]).toEqual(["Submitted", "Graded"]);
  });

  it("describes the file, the late time and the link", () => {
    const [anaRow, benRow, carlaRow, goneRow] = rowsAt(beforeDue);
    expect(anaRow.file).toEqual({
      name: "essay.pdf",
      detail: "PDF · 2 MB",
      handedIn: "Handed in Nov 29, 2026, 10:00 AM, Manila time",
      href: `/ops/${activityId}/submission/${anaGraded.id}/file`,
    });
    expect([anaRow.lateText, benRow.lateText]).toEqual([null, "Late by 3 hours"]);
    expect([carlaRow.file, carlaRow.submission, carlaRow.record]).toEqual([null, null, null]);
    expect(goneRow.file?.href).toBeNull();
  });

  it("falls back to a plain late word when the due date is gone", () => {
    const rows = buildRows({ ...activity, dueAt: null }, [ben], [benLate], [], teacher, beforeDue);
    expect(rows[0].lateText).toBe("Late");
  });

  it("counts for the summary line", () => {
    const counts = summaryCounts(rowsAt(beforeDue));
    expect(counts).toEqual({ handedIn: 3, graded: 2, late: 1, notHandedIn: 1 });
    expect(summaryLine(counts)).toBe("3 handed in · 2 graded · 1 late · 1 not handed in");
    expect(summaryLine({ handedIn: 12, graded: 9, late: 3, notHandedIn: 28 })).toBe(
      "12 handed in · 9 graded · 3 late · 28 not handed in",
    );
  });
});

describe("grading record", () => {
  it("names the teacher and the Manila time", () => {
    expect(gradeRecord(anaGraded, [anaLog[1]], teacher)).toEqual({
      headline: "Graded by Maria Santos, Nov 28, 2026, 3:10 PM, Manila time",
      history: [],
    });
  });

  it("lists the history when the grade changed", () => {
    expect(gradeRecord(anaGraded, anaLog, teacher)?.history).toEqual([
      "First score 18 by Another teacher, Nov 27, 2026, 1:00 PM, Manila time",
      "Changed from 18 to 17 by Maria Santos, Nov 28, 2026, 3:10 PM, Manila time",
    ]);
    expect(historySentence(anaLog[1], { id: "x", fullName: "Someone" })).toBe(
      "Changed from 18 to 17 by Another teacher, Nov 28, 2026, 3:10 PM, Manila time",
    );
  });

  it("has no record before grading and never names another teacher", () => {
    expect(gradeRecord(benLate, [], teacher)).toBeNull();
    expect(gradeRecord(goneGraded, [], teacher)?.headline).toBe(
      "Graded by Another teacher, Nov 27, 2026, 11:00 AM, Manila time",
    );
  });
});

describe("storage helpers", () => {
  const reply = { submission_bytes: 120 * megabyte, total_bytes: 512 * megabyte, block_bytes: 900 * megabyte };

  it("reads the rpc reply", () => {
    expect(toSubmissionStorage(reply)).toEqual({
      submissionBytes: 120 * megabyte,
      totalBytes: 512 * megabyte,
      blockBytes: 900 * megabyte,
    });
    expect(toSubmissionStorage({ submission_bytes: 1, total_bytes: 2 })?.blockBytes).toBe(900 * megabyte);
    expect([toSubmissionStorage(null), toSubmissionStorage({ used_bytes: 4 })]).toEqual([null, null]);
  });

  it("writes the storage line", () => {
    expect(storageLine(toSubmissionStorage(reply)!)).toBe(
      "Submissions use 120 MB. Total storage: 512 MB of 900 MB.",
    );
    expect(storageLine({ submissionBytes: 0, totalBytes: 0, blockBytes: 900 * megabyte })).toBe(
      "Submissions use 0 MB. Total storage: 0 MB of 900 MB.",
    );
  });

  it("warns from 90 percent", () => {
    const at = (totalBytes: number) => isStorageAlmostFull({ submissionBytes: 0, totalBytes, blockBytes: 900 * megabyte });
    expect([at(809 * megabyte), at(810 * megabyte), at(900 * megabyte)]).toEqual([false, true, true]);
  });
});

describe("SubmissionList", () => {
  function renderList(now = beforeDue) {
    return render(<SubmissionList rows={rowsAt(now)} points={20} gradeAction={noGrade} />);
  }

  it("shows the summary, the scan warning and one row per student", () => {
    renderList();
    expect(screen.getByText("3 handed in · 2 graded · 1 late · 1 not handed in")).toBeTruthy();
    expect(screen.getByText(gradingNotes.notScanned)).toBeTruthy();
    const names = screen.getAllByRole("listitem").map((item) => item.querySelector("[dir='auto']")?.textContent);
    expect(names.slice(0, 4)).toContain("Ana Reyes");
    expect(screen.getAllByText("Removed student")).toHaveLength(1);
  });

  function rowOf(name: string): HTMLElement {
    return screen.getByText(name).closest("li")!;
  }

  function chips(row: HTMLElement): [string | null, string | null][] {
    return [...row.querySelectorAll("[data-status]")].map((chip) => [
      chip.getAttribute("data-status"),
      chip.textContent,
    ]);
  }

  it("shows a graded row with its file, link, record and history", () => {
    renderList();
    const row = rowOf("Ana Reyes");
    expect(chips(row)).toEqual([["graded", "Graded"]]);
    expect(row.querySelector("bdi")!.textContent).toBe("essay.pdf");
    expect(within(row).getByText("PDF · 2 MB")).toBeTruthy();
    expect(within(row).getByText("Handed in Nov 29, 2026, 10:00 AM, Manila time")).toBeTruthy();
    expect(within(row).getByRole("link", { name: "Open file" }).getAttribute("href")).toBe(
      `/ops/${activityId}/submission/${anaGraded.id}/file`,
    );
    expect(within(row).getByText("Graded by Maria Santos, Nov 28, 2026, 3:10 PM, Manila time")).toBeTruthy();
    expect(within(row).getByText(/^Changed from 18 to 17 by Maria Santos/)).toBeTruthy();
    expect((within(row).getByLabelText("Score for Ana Reyes") as HTMLInputElement).value).toBe("17");
    expect((within(row).getByLabelText("Feedback for Ana Reyes") as HTMLTextAreaElement).value).toBe(
      "Clear argument.",
    );
  });

  it("shows a late submitted row with the gold late chip and an empty score", () => {
    renderList();
    const row = rowOf("Ben Cruz");
    expect(chips(row)).toEqual([
      ["submitted", "Submitted"],
      ["late", "Late by 3 hours"],
    ]);
    expect(within(row).getByText("DOCX · 2 MB")).toBeTruthy();
    expect((within(row).getByLabelText("Score for Ben Cruz") as HTMLInputElement).value).toBe("");
    expect(within(row).queryByText(/^Graded by/)).toBeNull();
  });

  it("shows a row with nothing handed in without a form, and Missing once past due", () => {
    const view = renderList();
    const row = rowOf("Carla Diaz");
    expect(chips(row)).toEqual([["due", "Not handed in"]]);
    expect(row.querySelector("form")).toBeNull();
    expect(within(row).queryByRole("link")).toBeNull();
    view.unmount();
    renderList(afterDue);
    expect(chips(rowOf("Carla Diaz"))).toEqual([["due", "Missing"]]);
  });

  it("shows a removed student whose file was removed, still gradable", () => {
    renderList();
    const row = rowOf("Removed student");
    expect(within(row).getByText("File removed after grading")).toBeTruthy();
    expect(within(row).queryByRole("link", { name: "Open file" })).toBeNull();
    expect(within(row).getByLabelText("Score for Removed student")).toBeTruthy();
  });

  it("renders names, file names and history as text", () => {
    const hostile = submission(ana.studentId, { fileName: "<img src=x>.pdf" });
    const rows = buildRows(activity, [{ ...ana, fullName: "<b>Ana</b>" }], [hostile], [], teacher, beforeDue);
    const { container } = render(<SubmissionList rows={rows} points={20} gradeAction={noGrade} />);
    expect(screen.getByText("<b>Ana</b>")).toBeTruthy();
    expect(container.querySelector("bdi")!.textContent).toBe("<img src=x>.pdf");
    expect(container.querySelector("img, b")).toBeNull();
    expect(container.querySelector("a")!.getAttribute("href")).not.toContain("img");
  });

  it("has an empty state and a failure state", () => {
    const view = render(<SubmissionList rows={[]} points={20} gradeAction={noGrade} />);
    expect(screen.getByText(gradingNotes.noStudents)).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    view.unmount();
    render(<SubmissionList rows={null} points={20} gradeAction={noGrade} />);
    expect(screen.getByRole("alert").textContent).toBe("Could not load the roster");
  });
});

describe("GradeForm", () => {
  function renderForm(action = noGrade, uploadId = anaGraded.uploadId) {
    return render(
      <GradeForm
        submissionId={anaGraded.id}
        uploadId={uploadId}
        studentName="Ana Reyes"
        points={20}
        score={null}
        feedback={null}
        action={action}
      />,
    );
  }

  async function submit(container: HTMLElement) {
    await act(async () => {
      fireEvent.submit(container.querySelector("form")!);
    });
  }

  it("keeps the visible labels and names each field after the student", () => {
    const { container } = renderForm();
    const score = screen.getByLabelText("Score for Ana Reyes") as HTMLInputElement;
    const feedback = screen.getByLabelText("Feedback for Ana Reyes") as HTMLTextAreaElement;
    expect([score.name, score.type, score.min, score.max, score.step, score.required]).toEqual([
      "score",
      "number",
      "0",
      "20",
      "1",
      true,
    ]);
    expect([feedback.name, feedback.tagName, feedback.maxLength]).toEqual(["feedback", "TEXTAREA", 5000]);
    const visible = [...container.querySelectorAll("label")].map((label) => label.firstChild?.textContent);
    expect(visible).toEqual(["Score", "Feedback"]);
    expect(screen.getByText("of 20").id).toBe(score.getAttribute("aria-describedby"));
    expect((screen.getByRole("button", { name: "Save grade" }) as HTMLButtonElement).type).toBe("submit");
  });

  it("sends the submission, the upload the page rendered, the score and the feedback", async () => {
    const action = vi.fn(async (): Promise<GradeState> => ({ tone: "status", message: "Grade saved" }));
    const { container } = renderForm(action);
    const hidden = container.querySelector("input[name='expectedUpload']") as HTMLInputElement;
    expect([hidden.type, hidden.value]).toEqual(["hidden", anaGraded.uploadId]);
    fireEvent.change(screen.getByLabelText("Score for Ana Reyes"), { target: { value: "18" } });
    fireEvent.change(screen.getByLabelText("Feedback for Ana Reyes"), { target: { value: "Good work." } });
    await submit(container);
    const sent = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(Object.fromEntries(sent)).toEqual({
      submissionId: anaGraded.id,
      expectedUpload: anaGraded.uploadId,
      score: "18",
      feedback: "Good work.",
    });
    expect(screen.getByRole("status").textContent).toBe("Grade saved");
  });

  it("keeps the upload it first showed when the student replaces the file under it", () => {
    const view = renderForm();
    view.rerender(
      <GradeForm
        submissionId={anaGraded.id}
        uploadId="77777777-7777-4777-8777-777777777777"
        studentName="Ana Reyes"
        points={20}
        score={null}
        feedback={null}
        action={noGrade}
      />,
    );
    const hidden = view.container.querySelector("input[name='expectedUpload']") as HTMLInputElement;
    expect(hidden.value).toBe(anaGraded.uploadId);
    expect(screen.getByRole("status").textContent).toMatch(/^The student replaced the file/);
  });

  it("shows a refusal, marks the field and keeps what was typed", async () => {
    const action = vi.fn(
      async (): Promise<GradeState> => ({
        tone: "alert",
        message: "Enter a whole number from 0 to 20.",
        field: "score",
        values: { score: "21", feedback: "Typed text" },
      }),
    );
    const { container } = renderForm(action);
    await submit(container);
    const alert = screen.getByRole("alert");
    const score = screen.getByLabelText("Score for Ana Reyes") as HTMLInputElement;
    expect(alert.textContent).toBe("Enter a whole number from 0 to 20.");
    expect(score.getAttribute("aria-invalid")).toBe("true");
    expect(score.getAttribute("aria-describedby")).toContain(alert.id);
    expect([score.value, (screen.getByLabelText("Feedback for Ana Reyes") as HTMLTextAreaElement).value]).toEqual([
      "21",
      "Typed text",
    ]);
  });
});

describe("UploadSettingsForm", () => {
  const lessons = [
    {
      moduleId: "m1",
      moduleTitle: "Module 1",
      lessons: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", label: "Queues", published: true }],
    },
  ];

  function renderSettings(pointsLocked = false, action = vi.fn(async (): Promise<SaveUploadSettingsState> => ({}))) {
    return render(
      <UploadSettingsForm
        activityId={activityId}
        values={uploadSettingsValues(activity)}
        lessons={lessons}
        pointsLocked={pointsLocked}
        action={action}
      />,
    );
  }

  it("is prefilled, with the due date shown as the Manila minute", () => {
    renderSettings();
    const title = screen.getByLabelText("Activity title") as HTMLInputElement;
    const points = screen.getByLabelText("Points") as HTMLInputElement;
    const due = screen.getByLabelText("Due date") as HTMLInputElement;
    const lesson = screen.getByLabelText("Linked lesson") as HTMLSelectElement;
    const instructions = screen.getByLabelText("Instructions") as HTMLTextAreaElement;
    expect([title.name, title.value, title.maxLength, title.required]).toEqual(["title", "Essay 1", 160, true]);
    expect([points.name, points.type, points.value, points.min, points.max, points.readOnly]).toEqual([
      "points",
      "number",
      "20",
      "1",
      "1000",
      false,
    ]);
    expect([due.name, due.type, due.value]).toEqual(["dueAt", "datetime-local", "2026-11-30T23:59"]);
    expect(screen.getByText(gradingNotes.dueDate).id).toBe(due.getAttribute("aria-describedby"));
    expect([lesson.name, lesson.value]).toEqual(["lessonId", ""]);
    expect(within(lesson).getByRole("option", { name: "Queues" })).toBeTruthy();
    expect([instructions.name, instructions.value]).toEqual(["instructions", "Hand in **one** file."]);
  });

  it("makes points read-only with a note once work is graded", () => {
    renderSettings(true);
    const points = screen.getByLabelText("Points") as HTMLInputElement;
    expect([points.readOnly, points.value]).toEqual([true, "20"]);
    expect(screen.getByText("Points cannot change after work has been graded.").id).toBe(
      points.getAttribute("aria-describedby"),
    );
  });

  it("shows field errors and keeps typed values", async () => {
    const action = vi.fn(
      async (): Promise<SaveUploadSettingsState> => ({
        tone: "alert",
        message: "Check the marked fields, then save again.",
        fieldErrors: { dueAt: "Enter a real date and time", points: "Enter points from 1 to 1,000." },
        values: { title: "Essay 2", instructions: "", points: "0", dueAt: "", lessonId: "" },
      }),
    );
    renderSettings(false, action);
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Save settings" }).closest("form")!);
    });
    const sent = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(sent.get("activityId")).toBe(activityId);
    expect(screen.getByRole("alert").textContent).toBe("Check the marked fields, then save again.");
    expect(screen.getByText("Error: Enter a real date and time")).toBeTruthy();
    expect(screen.getByText("Error: Enter points from 1 to 1,000.")).toBeTruthy();
    expect((screen.getByLabelText("Activity title") as HTMLInputElement).value).toBe("Essay 2");
  });
});

describe("UploadActions", () => {
  const action = vi.fn(async () => ({ tone: "status" as const, message: "Activity published." }));

  it("publishes a draft and keeps delete inside a closed details", async () => {
    const { container } = render(
      <UploadActions activityId={activityId} published={false} hasWork={false} action={action} />,
    );
    expect(screen.queryByRole("button", { name: "Unpublish" })).toBeNull();
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(within(details).getByText("Delete activity").closest("form")).toBeTruthy();
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Publish activity" }).closest("form")!);
    });
    const sent = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(Object.fromEntries(sent)).toEqual({ intent: "setUploadPublished", activityId, published: "true" });
    expect(screen.getByRole("status").textContent).toBe("Activity published.");
  });

  it("offers unpublish only while nothing is handed in", () => {
    const view = render(<UploadActions activityId={activityId} published hasWork={false} action={action} />);
    expect(screen.getByRole("button", { name: "Unpublish" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Publish activity" })).toBeNull();
    view.unmount();
    const { container } = render(<UploadActions activityId={activityId} published hasWork action={action} />);
    expect(screen.queryByRole("button", { name: "Unpublish" })).toBeNull();
    expect(container.querySelector("details")).toBeNull();
    expect(screen.getByText(gradingNotes.hasWork)).toBeTruthy();
  });
});

describe("StoragePanel", () => {
  const storage = { submissionBytes: 120 * megabyte, totalBytes: 512 * megabyte, blockBytes: 900 * megabyte };

  it("shows the storage line and sends the remove action", async () => {
    const action = vi.fn(async () => ({ tone: "status" as const, message: "No graded files to remove." }));
    render(<StoragePanel activityId={activityId} storage={storage} action={action} />);
    expect(screen.getByText("Submissions use 120 MB. Total storage: 512 MB of 900 MB.")).toBeTruthy();
    expect(screen.queryByText(gradingNotes.storageAlmostFull)).toBeNull();
    expect(screen.getByText("Scores and feedback stay. The files cannot be brought back.")).toBeTruthy();
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Remove files of graded work" }).closest("form")!);
    });
    const sent = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(Object.fromEntries(sent)).toEqual({ intent: "removeGradedFiles", activityId });
    expect(screen.getByRole("status").textContent).toBe("No graded files to remove.");
  });

  it("warns at 90 percent and says when usage is unknown", () => {
    const view = render(
      <StoragePanel activityId={activityId} storage={{ ...storage, totalBytes: 810 * megabyte }} action={vi.fn()} />,
    );
    expect(screen.getByRole("status").textContent).toBe(
      "Storage is almost full. Remove the files of graded work you no longer need.",
    );
    view.unmount();
    render(<StoragePanel activityId={activityId} storage={null} action={vi.fn()} />);
    expect(screen.getByText(gradingNotes.storageUnknown)).toBeTruthy();
  });
});
