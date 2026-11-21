import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RemovalNotice } from "./RemovalNotice";

const search = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search.value) }));

afterEach(cleanup);

describe("RemovalNotice", () => {
  it("renders nothing without the search param", () => {
    search.value = "";
    const { container } = render(<RemovalNotice />);
    expect(container.textContent).toBe("");
  });

  it("shows a status line after a removal", () => {
    search.value = "removed=yes";
    render(<RemovalNotice />);
    expect(screen.getByRole("status").textContent).toBe("Student removed. The join code changed.");
  });

  it("shows an alert when the removal failed", () => {
    search.value = "removed=no";
    render(<RemovalNotice />);
    expect(screen.getByRole("alert").textContent).toBe("Could not remove the student");
  });

  it("ignores any other value", () => {
    search.value = "removed=%3Cb%3Ehi";
    const { container } = render(<RemovalNotice />);
    expect(container.textContent).toBe("");
  });
});
