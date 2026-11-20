import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { OpsCard } from "./OpsCard";
import { StatusChip } from "./StatusChip";

afterEach(cleanup);

function renderCard() {
  return render(
    <OpsCard
      href="/ops/quiz/message-brokers"
      icon={
        <svg data-testid="icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="3" width="14" height="18" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      }
      kind="Quiz · INTE 301"
      title="Message brokers"
      detail="20 items · auto-graded · 2 attempts"
      status={
        <StatusChip status="due" dot={false}>
          Due Fri 23:59
        </StatusChip>
      }
    />,
  );
}

describe("OpsCard", () => {
  it("is one link named by its title", () => {
    renderCard();
    const link = screen.getByRole("link", { name: /Message brokers/ });
    expect(link.getAttribute("href")).toBe("/ops/quiz/message-brokers");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(link.style.clipPath).toBe("");
  });

  it("shows the kind, the title and the detail", () => {
    renderCard();
    expect(screen.getByText("Quiz · INTE 301")).toBeTruthy();
    expect(screen.getByText("Message brokers")).toBeTruthy();
    expect(screen.getByText("20 items · auto-graded · 2 attempts")).toBeTruthy();
  });

  it("renders the icon and the status node inside the link", () => {
    renderCard();
    const link = screen.getByRole("link");
    expect(link.contains(screen.getByTestId("icon"))).toBe(true);
    const chip = screen.getByText("Due Fri 23:59");
    expect(link.contains(chip)).toBe(true);
    expect(chip.dataset.status).toBe("due");
  });
});
