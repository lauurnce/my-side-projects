import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CreateClassForm } from "./CreateClassForm";

vi.mock("@/app/classes/teacher-actions", () => ({ createClass: async () => ({}) }));

afterEach(cleanup);

describe("CreateClassForm", () => {
  it("has the four labelled fields with their limits", () => {
    render(<CreateClassForm />);
    const code = screen.getByLabelText("Course code") as HTMLInputElement;
    const title = screen.getByLabelText("Title") as HTMLInputElement;
    const section = screen.getByLabelText("Section (optional)") as HTMLInputElement;
    const term = screen.getByLabelText("Term (optional)") as HTMLInputElement;
    expect([code.name, title.name, section.name, term.name]).toEqual(["code", "title", "section", "term"]);
    expect([code.maxLength, title.maxLength, section.maxLength, term.maxLength]).toEqual([20, 120, 40, 40]);
    expect([code.required, title.required, section.required, term.required]).toEqual([true, true, false, false]);
  });

  it("ties each example to its field as a description, not a placeholder", () => {
    render(<CreateClassForm />);
    const expected: [string, string][] = [
      ["Course code", "For example COMP 018"],
      ["Section (optional)", "For example BSIT 3-3"],
      ["Term (optional)", "For example 1st Sem AY 2026-27"],
    ];
    for (const [label, hint] of expected) {
      const input = screen.getByLabelText(label) as HTMLInputElement;
      const hintId = input.getAttribute("aria-describedby")!;
      expect(document.getElementById(hintId)?.textContent).toBe(hint);
      expect(input.placeholder).toBe("");
    }
  });

  it("has an enabled submit button", () => {
    render(<CreateClassForm />);
    const button = screen.getByRole("button", { name: "Create class" }) as HTMLButtonElement;
    expect(button.type).toBe("submit");
    expect(button.disabled).toBe(false);
  });
});
