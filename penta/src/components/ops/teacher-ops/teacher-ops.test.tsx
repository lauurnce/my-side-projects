import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NewQuizForm } from "./NewQuizForm";
import { OpsList, quizCountLabel, type OpsRow } from "./OpsList";

afterEach(cleanup);

const classId = "3f2b8c1e-6a4d-4e5f-9b7a-1c2d3e4f5a6b";

const rows: OpsRow[] = [
  { id: "a1", title: "Quiz 1", published: true, points: "12 points", due: "Due Nov 30, 2026, 11:59 PM, Manila time" },
  { id: "b2", title: "Quiz 2", published: false, points: "0 points", due: "No due date" },
];

describe("OpsList", () => {
  it("counts quizzes", () => {
    expect([quizCountLabel(0), quizCountLabel(1), quizCountLabel(2)]).toEqual(["0 quizzes", "1 quiz", "2 quizzes"]);
  });

  it("has an empty state", () => {
    render(<OpsList rows={[]} />);
    expect(screen.getByText("No quizzes yet. Create the first one.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("lists each quiz with its state, points, due date and links", () => {
    render(<OpsList rows={rows} />);
    const [first, second] = screen.getAllByRole("listitem");
    expect(within(first).getByRole("link", { name: "Quiz 1" }).getAttribute("href")).toBe("/ops/a1");
    expect(within(first).getByRole("link", { name: "Results of Quiz 1" }).getAttribute("href")).toBe(
      "/ops/a1/results",
    );
    expect(first.querySelector("[data-status]")!.textContent).toBe("Published");
    expect(within(first).getByText("12 points")).toBeTruthy();
    expect(within(first).getByText("Due Nov 30, 2026, 11:59 PM, Manila time")).toBeTruthy();
    expect(second.querySelector("[data-status]")!.textContent).toBe("Draft");
    expect(within(second).getByText("No due date")).toBeTruthy();
    expect(within(second).getByRole("link", { name: "Results of Quiz 2" }).textContent).toBe("Results");
  });

  it("renders a title as text", () => {
    const { container } = render(<OpsList rows={[{ ...rows[0], title: "<img src=x>" }]} />);
    expect(screen.getByRole("link", { name: "<img src=x>" })).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("NewQuizForm", () => {
  it("sends the class and the title to the create action and shows a refusal", async () => {
    const action = vi.fn(async () => ({ tone: "alert" as const, message: "Enter a quiz title" }));
    const { container } = render(<NewQuizForm classId={classId} action={action} />);
    const title = screen.getByLabelText("Quiz title") as HTMLInputElement;
    expect([title.name, title.required, title.maxLength]).toEqual(["title", true, 160]);
    fireEvent.change(title, { target: { value: "Quiz 3" } });
    const button = screen.getByRole("button", { name: "New quiz" }) as HTMLButtonElement;
    expect(button.type).toBe("submit");
    await act(async () => {
      fireEvent.submit(container.querySelector("form")!);
    });
    const sent = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(Object.fromEntries(sent)).toEqual({ intent: "createQuiz", classId, title: "Quiz 3" });
    expect(screen.getByRole("alert").textContent).toBe("Enter a quiz title");
  });
});
