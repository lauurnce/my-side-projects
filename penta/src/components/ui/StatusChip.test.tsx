import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StatusChip, type Status } from "./StatusChip";

afterEach(cleanup);

const words: Record<Status, string> = {
  due: "Due Fri 23:59",
  late: "Late · 2 days",
  submitted: "Submitted",
  graded: "Graded 9/10",
  live: "Live now",
};

const statuses = Object.keys(words) as Status[];

describe("StatusChip", () => {
  it.each(statuses)("renders the %s status with its word", (status) => {
    render(<StatusChip status={status}>{words[status]}</StatusChip>);
    const chip = screen.getByText(words[status]);
    expect(chip.dataset.status).toBe(status);
    expect(chip.className).toContain(status);
    expect(chip.textContent).toBe(words[status]);
  });

  it("renders a hidden dot by default", () => {
    render(<StatusChip status="live">Live now</StatusChip>);
    const dot = screen.getByText("Live now").querySelector("[data-dot]");
    expect(dot).not.toBeNull();
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders no dot when dot is false", () => {
    render(
      <StatusChip status="due" dot={false}>
        Due Fri 23:59
      </StatusChip>,
    );
    const chip = screen.getByText("Due Fri 23:59");
    expect(chip.querySelector("[data-dot]")).toBeNull();
    expect(chip.children.length).toBe(0);
  });
});
