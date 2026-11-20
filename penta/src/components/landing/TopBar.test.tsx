import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TopBar } from "./TopBar";

afterEach(cleanup);

describe("TopBar", () => {
  it("renders one banner", () => {
    render(<TopBar />);
    expect(screen.getAllByRole("banner")).toHaveLength(1);
  });

  it("names the brand link and points it home", () => {
    render(<TopBar />);
    expect(screen.getByRole("link", { name: "Penta, home" }).getAttribute("href")).toBe("/");
  });

  it("links Log in to the login page", () => {
    render(<TopBar />);
    expect(screen.getByRole("link", { name: "Log in" }).getAttribute("href")).toBe("/login");
  });

  it("shows the three labels and the theme toggle", () => {
    render(<TopBar />);
    expect(screen.getByText("AY 2026–27 · 1st sem")).toBeTruthy();
    expect(screen.getByText("BSIT · PUP")).toBeTruthy();
    expect(screen.getByText("INTE 301 · SIA")).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
