import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ClassesError from "@/app/classes/error";
import GradesLoading from "@/app/grades/loading";
import ClassesNotFound from "@/app/classes/not-found";
import RootError from "@/app/error";
import LessonError from "@/app/classes/[id]/lessons/[lessonId]/error";
import RootNotFound from "@/app/not-found";
import { LoadingPage } from "./StatePage";

afterEach(cleanup);

describe("error pages", () => {
  it.each([
    ["root", RootError],
    ["section", ClassesError],
    ["lesson", LessonError],
  ])("the %s error page says what happened and offers Try again and a way back", (_name, Page) => {
    const reset = vi.fn();
    render(<Page error={new Error("database password: hunter2")} reset={reset} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "That did not work" })).toBeTruthy();
    expect(screen.queryByText(/hunter2/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Back to the hub" }).getAttribute("href")).toBe("/hub");
  });
});

describe("not-found pages", () => {
  it("inside a section it links back to the hub", () => {
    render(<ClassesNotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "Not found" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to the hub" }).getAttribute("href")).toBe("/hub");
  });

  it("at the root it links back to the landing page", () => {
    render(<RootNotFound />);
    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to PENTA" }).getAttribute("href")).toBe("/");
  });
});

describe("loading pages", () => {
  it("announce that the page is loading", () => {
    render(<GradesLoading />);
    expect(screen.getByRole("status").textContent).toContain("Loading");
    cleanup();
    render(<LoadingPage />);
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
