import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Activity, OpenPaper, PaperQuestion } from "@/lib/quiz";
import { PaperForm, type PaperFormProps } from "./PaperForm";

const { refresh, rpc, router } = vi.hoisted(() => {
  const refresh = vi.fn();
  return { refresh, rpc: vi.fn(), router: { refresh } };
});

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));
vi.mock("@/app/ops/attempt-actions", () => ({ submitQuiz: async () => {}, startQuiz: async () => ({}) }));

const activityId = "7b0f6a52-1c1d-4f6e-9d55-0d6d3a1f2c11";
const attemptId = "5c6d7e8f-52a7-4b6c-8a44-6f0b0f0f9d44";
const mcqId = "0f3f8e0a-52a7-4b6c-8a44-6f0b0f0f9d22";
const tfId = "1a2b3c4d-52a7-4b6c-8a44-6f0b0f0f9d33";
const identId = "2b3c4d5e-52a7-4b6c-8a44-6f0b0f0f9d55";
const serverNow = "2026-11-27T04:00:00.000Z";

const questions: PaperQuestion[] = [
  { id: mcqId, kind: "mcq", prompt: "Which part routes messages?", options: ["Queue", "Broker", "Worker"], points: 2, position: 1 },
  { id: tfId, kind: "tf", prompt: "A queue keeps order.", options: null, points: 1, position: 2 },
  { id: identId, kind: "ident", prompt: "Name the pattern.\nOne word.", options: null, points: 1, position: 3 },
];

const submit = vi.fn(async () => {});

function paperForm(overrides: Partial<PaperFormProps> = {}) {
  return (
    <PaperForm
      action={submit}
      activityId={activityId}
      attemptId={attemptId}
      questions={questions}
      answers={{}}
      expiresAt={null}
      now={serverNow}
      {...overrides}
    />
  );
}

function saved(extra: Record<string, unknown> = {}) {
  return { data: { status: "saved", expires_at: null, now: serverNow, ...extra }, error: null };
}

function question(number: number) {
  return screen.getByRole("group", { name: new RegExp(`^Question ${number} `) });
}

function saveLine(container: HTMLElement) {
  return container.querySelector("[data-save-status]")!;
}

function timerNotice(container: HTMLElement) {
  return container.querySelector("[data-timer-notice]")!;
}

async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  rpc.mockReset();
  rpc.mockResolvedValue(saved());
  refresh.mockReset();
  submit.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("PaperForm fields", () => {
  it("renders each kind in a fieldset with the frozen names", () => {
    const { container } = render(paperForm());

    expect(question(1).tagName).toBe("FIELDSET");
    expect(question(1).querySelector("legend")?.textContent).toBe("Question 1 (2 points)");
    expect(question(2).querySelector("legend")?.textContent).toBe("Question 2 (1 point)");
    expect(within(question(1)).getByText("Which part routes messages?")).toBeTruthy();

    const options = within(question(1)).getAllByRole("radio") as HTMLInputElement[];
    expect(options.map((option) => [option.name, option.value])).toEqual([
      [`answer.${mcqId}`, "0"],
      [`answer.${mcqId}`, "1"],
      [`answer.${mcqId}`, "2"],
    ]);
    expect(within(question(1)).getByLabelText("Broker")).toBe(options[1]);

    const truth = within(question(2)).getAllByRole("radio") as HTMLInputElement[];
    expect(truth.map((option) => [option.name, option.value])).toEqual([
      [`answer.${tfId}`, "true"],
      [`answer.${tfId}`, "false"],
    ]);
    expect(within(question(2)).getByLabelText("True")).toBe(truth[0]);

    const text = within(question(3)).getByLabelText("Your answer") as HTMLInputElement;
    expect(text.name).toBe(`answer.${identId}`);
    expect(text.maxLength).toBe(200);
    expect(text.getAttribute("autocomplete")).toBe("off");
    expect(text.getAttribute("autocapitalize")).toBe("none");
    expect(text.getAttribute("spellcheck")).toBe("false");

    const hidden = (name: string) => container.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`)?.value;
    expect(hidden("activityId")).toBe(activityId);
    expect(hidden("attemptId")).toBe(attemptId);
    expect(hidden(`kind.${mcqId}`)).toBe("mcq");
    expect(hidden(`kind.${tfId}`)).toBe("tf");
    expect(hidden(`kind.${identId}`)).toBe("ident");
    expect(screen.getByRole("button", { name: "Submit quiz" }).getAttribute("type")).toBe("submit");
  });

  it("preselects the saved answers", () => {
    render(paperForm({ answers: { [mcqId]: 1, [tfId]: false, [identId]: "Broker" } }));

    const options = within(question(1)).getAllByRole("radio") as HTMLInputElement[];
    expect(options.map((option) => option.checked)).toEqual([false, true, false]);
    expect((within(question(2)).getByLabelText("False") as HTMLInputElement).checked).toBe(true);
    expect((within(question(2)).getByLabelText("True") as HTMLInputElement).checked).toBe(false);
    expect((within(question(3)).getByLabelText("Your answer") as HTMLInputElement).value).toBe("Broker");
  });

  it("leaves every field empty with no saved answers", () => {
    render(paperForm());

    expect((screen.getAllByRole("radio") as HTMLInputElement[]).some((option) => option.checked)).toBe(false);
    expect((screen.getByLabelText("Your answer") as HTMLInputElement).value).toBe("");
  });

  it("keeps the same field and its text when the server sends new answers", () => {
    const { rerender } = render(paperForm({ answers: { [identId]: "Bro" } }));
    const text = screen.getByLabelText("Your answer") as HTMLInputElement;
    fireEvent.change(text, { target: { value: "Broker" } });

    rerender(paperForm({ answers: { [identId]: "Bro", [mcqId]: 2 }, now: "2026-11-27T04:01:00.000Z" }));

    expect(screen.getByLabelText("Your answer")).toBe(text);
    expect(text.value).toBe("Broker");
  });

  it("does not submit when Enter is pressed in a text answer", () => {
    render(paperForm());

    const allowed = fireEvent.keyDown(screen.getByLabelText("Your answer"), { key: "Enter" });

    expect(allowed).toBe(false);
  });
});

describe("PaperForm autosave", () => {
  it("saves a choice at once with the real type", async () => {
    const { container } = render(paperForm());

    fireEvent.click(within(question(1)).getByLabelText("Worker"));
    expect(rpc).toHaveBeenCalledWith("save_answer", { target_attempt: attemptId, target_question: mcqId, answer: 2 });
    expect(saveLine(container).textContent).toBe("Saving");

    await advance(0);
    expect(saveLine(container).textContent).toBe("Saved");

    fireEvent.click(within(question(2)).getByLabelText("False"));
    expect(rpc).toHaveBeenLastCalledWith("save_answer", { target_attempt: attemptId, target_question: tfId, answer: false });
  });

  it("saves text after the pause", async () => {
    render(paperForm());
    const text = screen.getByLabelText("Your answer");

    fireEvent.change(text, { target: { value: "Bro" } });
    fireEvent.change(text, { target: { value: "Broker" } });
    await advance(599);
    expect(rpc).not.toHaveBeenCalled();

    await advance(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("save_answer", { target_attempt: attemptId, target_question: identId, answer: "Broker" });
  });

  it("saves text on blur and clears an emptied answer", async () => {
    render(paperForm({ answers: { [identId]: "Broker" } }));
    const text = screen.getByLabelText("Your answer");

    fireEvent.change(text, { target: { value: "" } });
    fireEvent.blur(text);

    expect(rpc).toHaveBeenCalledWith("save_answer", { target_attempt: attemptId, target_question: identId, answer: null });
  });

  it("says so when a save fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
    const { container } = render(paperForm());

    fireEvent.click(within(question(1)).getByLabelText("Queue"));
    await advance(0);

    expect(saveLine(container).textContent).toBe("Not saved yet. Your answers are sent when you submit.");
    expect(saveLine(container).getAttribute("aria-live")).toBe("polite");
    expect(saveLine(container).closest("fieldset")).toBeNull();
  });

  it.each(["late", "submitted"])("reloads the page on a %s reply", async (status) => {
    rpc.mockResolvedValue(saved({ status }));
    render(paperForm());

    fireEvent.click(within(question(1)).getByLabelText("Queue"));
    await advance(0);

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("PaperForm timer", () => {
  it("shows no timer and says so when there is no deadline", async () => {
    render(paperForm());
    await advance(1000);

    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.getByText("No time limit. Submit when you are done.")).toBeTruthy();
  });

  it("renders the countdown only after mount, from the server clock", async () => {
    const markup = renderToStaticMarkup(paperForm({ expiresAt: "2026-11-27T04:20:00.000Z" }));
    expect(markup).not.toContain('role="timer"');
    expect(markup).not.toContain("No time limit");

    render(paperForm({ expiresAt: "2026-11-27T04:20:00.000Z" }));
    await advance(0);

    const timer = screen.getByRole("timer");
    expect(timer.getAttribute("aria-live")).toBe("off");
    expect(timer.textContent).toBe("Time left 20:00");

    await advance(61_000);
    expect(screen.getByRole("timer").textContent).toBe("Time left 18:59");
  });

  it("speaks only at the notice minutes", async () => {
    const { container } = render(paperForm({ expiresAt: "2026-11-27T04:11:00.000Z" }));
    await advance(0);
    expect(timerNotice(container).textContent).toBe("");
    expect(timerNotice(container).getAttribute("aria-live")).toBe("polite");

    await advance(60_000);
    expect(timerNotice(container).textContent).toBe("10 minutes left.");

    await advance(4 * 60_000);
    expect(timerNotice(container).textContent).toBe("10 minutes left.");

    await advance(60_000);
    expect(timerNotice(container).textContent).toBe("5 minutes left.");

    await advance(4 * 60_000);
    expect(timerNotice(container).textContent).toBe("1 minute left.");
  });

  it("locks the questions and submits once at zero", async () => {
    const requestSubmit = vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(() => {});
    const { container } = render(paperForm({ expiresAt: "2026-11-27T04:00:30.000Z" }));

    await advance(29_000);
    expect(requestSubmit).not.toHaveBeenCalled();

    await advance(5000);
    expect(requestSubmit).toHaveBeenCalledTimes(1);
    expect(timerNotice(container).textContent).toBe("Time is up. Submitting your answers.");
    expect(question(1).parentElement?.hasAttribute("inert")).toBe(true);
    expect(screen.getByRole("timer").textContent).toBe("Time left 00:00");
  });

  it("uses a save reply to correct the clock and the deadline", async () => {
    rpc.mockResolvedValue(saved({ expires_at: "2026-11-27T04:10:00.000Z", now: "2026-11-27T04:02:00.000Z" }));
    render(paperForm({ expiresAt: "2026-11-27T04:20:00.000Z" }));
    await advance(0);

    fireEvent.click(within(question(1)).getByLabelText("Queue"));
    await advance(250);

    expect(screen.getByRole("timer").textContent).toBe("Time left 08:00");
  });

  it("reloads when the page becomes visible or is restored", () => {
    render(paperForm());

    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledTimes(1);

    const restored = new Event("pageshow");
    Object.defineProperty(restored, "persisted", { value: true });
    window.dispatchEvent(restored);
    expect(refresh).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new Event("pageshow"));
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe("QuizPaper", () => {
  const activity: Activity = {
    id: activityId,
    classId: "9d8c7b6a-52a7-4b6c-8a44-6f0b0f0f9d66",
    lessonId: null,
    type: "quiz",
    title: "Integration quiz",
    instructionsMd: "",
    points: 4,
    dueAt: null,
    publishedAt: "2026-11-26T00:00:00.000Z",
    requiresDeckId: null,
    attemptLimit: 2,
    timeLimitMin: null,
    showAnswers: "never",
  };

  function openPaper(expiresAt: string | null): OpenPaper {
    return { status: "open", activityId, attemptNo: 2, expiresAt, now: serverNow, questions, answers: {} };
  }

  it("tells a reader without scripts how answers are sent and when the attempt closes", async () => {
    const { QuizPaper } = await import("../QuizPaper");
    const markup = renderToStaticMarkup(
      <QuizPaper activity={activity} attemptId={attemptId} paper={openPaper("2026-11-27T04:20:00.000Z")} />,
    );
    const note = markup.slice(markup.indexOf("<noscript>"), markup.indexOf("</noscript>"));

    expect(note).toContain("Your answers are sent only when you press Submit quiz.");
    expect(note).toContain("This attempt closes at Nov 27, 2026, 12:20 PM, Manila time.");
    expect(markup.match(/<h1/g)).toHaveLength(1);
    expect(markup).toContain("Integration quiz");
  });

  it("leaves out the closing time when there is no deadline", async () => {
    const { QuizPaper } = await import("../QuizPaper");
    const markup = renderToStaticMarkup(<QuizPaper activity={activity} attemptId={attemptId} paper={openPaper(null)} />);
    const note = markup.slice(markup.indexOf("<noscript>"), markup.indexOf("</noscript>"));

    expect(note).toContain("Your answers are sent only when you press Submit quiz.");
    expect(note).not.toContain("This attempt closes");
  });
});
