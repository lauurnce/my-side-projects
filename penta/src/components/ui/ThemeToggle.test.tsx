import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThemeToggle } from "./ThemeToggle";

const globalStyles = document.createElement("style");
globalStyles.textContent = readFileSync("src/styles/globals.css", "utf8");

beforeEach(() => {
  document.head.append(globalStyles);
  document.cookie = "penta-theme=; Max-Age=0; Path=/";
});

afterEach(() => {
  cleanup();
  globalStyles.remove();
  delete document.documentElement.dataset.theme;
});

describe("ThemeToggle", () => {
  it("renders one button with no pressed state", () => {
    document.documentElement.dataset.theme = "light";
    render(<ThemeToggle />);
    const button = screen.getByRole("button");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.hasAttribute("aria-pressed")).toBe(false);
  });

  it("offers the dark theme while the page is light", () => {
    document.documentElement.dataset.theme = "light";
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeTruthy();
  });

  it("offers the dark theme when no theme is set", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeTruthy();
  });

  it("offers the light theme while the page is dark", () => {
    document.documentElement.dataset.theme = "dark";
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeTruthy();
  });

  it("hides both icons from assistive technology", () => {
    const { container } = render(<ThemeToggle />);
    const icons = container.querySelectorAll("svg");
    expect(icons).toHaveLength(2);
    icons.forEach((icon) => expect(icon.getAttribute("aria-hidden")).toBe("true"));
  });

  it("flips data-theme and writes the cookie on click", () => {
    document.documentElement.dataset.theme = "light";
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.cookie).toContain("penta-theme=dark");
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.cookie).toContain("penta-theme=light");
  });
});
