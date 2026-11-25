import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/app/auth/actions", () => ({ signOut: vi.fn() }));

import { AppBar } from "./AppBar";

afterEach(cleanup);

const teacher = { id: "user-1", fullName: "Ana Reyes", role: "teacher" as const };

describe("AppBar", () => {
  it("renders one banner", () => {
    render(<AppBar user={teacher} />);
    expect(screen.getAllByRole("banner")).toHaveLength(1);
  });

  it("shows the name and the role", () => {
    render(<AppBar user={teacher} />);
    expect(screen.getByText("Ana Reyes")).toBeTruthy();
    expect(screen.getByText("teacher")).toBeTruthy();
  });

  it("shows the student role for a student", () => {
    render(<AppBar user={{ ...teacher, role: "student" }} />);
    expect(screen.getByText("student")).toBeTruthy();
  });

  it("renders a name with markup in it as text", () => {
    render(<AppBar user={{ ...teacher, fullName: "<img src=x onerror=alert(1)>" }} />);
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });

  it("starts with a skip link to the page", () => {
    render(<AppBar user={teacher} />);
    const first = screen.getAllByRole("link")[0];
    expect(first.textContent).toBe("Skip to the page");
    expect(first.getAttribute("href")).toBe("#main");
  });

  it("links the brand to the hub and has a link to the classes", () => {
    render(<AppBar user={teacher} />);
    expect(screen.getByRole("link", { name: "Penta, hub" }).getAttribute("href")).toBe("/hub");
    expect(screen.getByRole("link", { name: "Classes" }).getAttribute("href")).toBe("/classes");
  });

  it("links a student to the grades, next to the classes", () => {
    render(<AppBar user={{ ...teacher, role: "student" }} />);
    const grades = screen.getByRole("link", { name: "Grades" });
    expect(grades.getAttribute("href")).toBe("/grades");
    expect(screen.getByRole("link", { name: "Classes" }).nextElementSibling).toBe(grades);
  });

  it("shows a teacher no grades link", () => {
    render(<AppBar user={teacher} />);
    expect(screen.queryByRole("link", { name: "Grades" })).toBeNull();
  });

  it("signs out with a submit button inside a form, not a link", () => {
    render(<AppBar user={teacher} />);
    const button = screen.getByRole("button", { name: "Sign out" });
    expect(button.getAttribute("type")).toBe("submit");
    expect(button.closest("form")).not.toBeNull();
    expect(screen.queryByRole("link", { name: "Sign out" })).toBeNull();
  });

  it("has no Routes, Decks or Ops navigation", () => {
    render(<AppBar user={teacher} />);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByText(/^(routes|decks|ops)$/i)).toBeNull();
  });
});
