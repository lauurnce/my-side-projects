import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PresenterBar, type PresenterBarProps } from "./PresenterBar";
import { connectionSentence, followerSentence, formatManilaTime } from "./presenter-text";

const lastReadAt = Date.UTC(2026, 10, 27, 2, 42, 7);

function props(overrides: Partial<PresenterBarProps> = {}): PresenterBarProps {
  return {
    presenting: false,
    busy: false,
    ready: true,
    followers: 0,
    link: "live",
    unsent: false,
    lastReadAt,
    onPresent: vi.fn(),
    onEnd: vi.fn(),
    ...overrides,
  };
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

afterEach(cleanup);

describe("presenter text", () => {
  it("formats a time in Manila with hours, minutes and seconds", () => {
    expect(formatManilaTime(lastReadAt)).toBe("10:42:07 AM");
    expect(formatManilaTime(Date.UTC(2026, 10, 27, 13, 5, 9))).toBe("9:05:09 PM");
  });

  it.each([
    [null, "Count unavailable"],
    [0, "No students following yet"],
    [1, "1 student following"],
    [2, "2 students following"],
    [12, "12 students following"],
  ])("describes %s followers", (followers, sentence) => {
    expect(followerSentence(followers)).toBe(sentence);
  });

  it("says nothing about the connection while live", () => {
    expect(connectionSentence("live", lastReadAt)).toBeNull();
  });

  it("describes a reconnecting link", () => {
    expect(connectionSentence("catching_up", lastReadAt)).toBe(
      "Reconnecting. Students still follow, a few seconds behind.",
    );
  });

  it("describes a lost link with the last contact time", () => {
    expect(connectionSentence("out_of_touch", lastReadAt)).toBe(
      "No contact with the server since 10:42:07 AM. Students may be behind.",
    );
  });
});

describe("PresenterBar when not presenting", () => {
  it("shows the Present button and one line of help", () => {
    render(<PresenterBar {...props()} />);
    expect(button("Present").type).toBe("button");
    expect(button("Present").disabled).toBe(false);
    expect(screen.getByText("Students who join see the slide you are on.")).toBeTruthy();
  });

  it("shows no live chip, count, status region or End session button", () => {
    render(<PresenterBar {...props({ followers: 12, link: "out_of_touch", unsent: true })} />);
    expect(screen.queryByText("Live")).toBeNull();
    expect(screen.queryByText(/following/)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: "End session" })).toBeNull();
  });

  it("calls onPresent when Present is clicked", () => {
    const onPresent = vi.fn();
    const onEnd = vi.fn();
    render(<PresenterBar {...props({ onPresent, onEnd })} />);
    fireEvent.click(button("Present"));
    expect(onPresent).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it.each([
    ["busy", { busy: true }],
    ["the deck is not ready", { ready: false }],
  ])("disables Present while %s", (_label, overrides) => {
    const onPresent = vi.fn();
    render(<PresenterBar {...props({ ...overrides, onPresent })} />);
    expect(button("Present").disabled).toBe(true);
    fireEvent.click(button("Present"));
    expect(onPresent).not.toHaveBeenCalled();
  });
});

describe("PresenterBar when presenting", () => {
  it("shows the live chip with the word Live", () => {
    render(<PresenterBar {...props({ presenting: true })} />);
    expect(screen.getByText("Live").getAttribute("data-status")).toBe("live");
  });

  it("hides the Present button and the help line", () => {
    render(<PresenterBar {...props({ presenting: true })} />);
    expect(screen.queryByRole("button", { name: "Present" })).toBeNull();
    expect(screen.queryByText("Students who join see the slide you are on.")).toBeNull();
  });

  it.each([
    [0, "No students following yet"],
    [1, "1 student following"],
    [12, "12 students following"],
  ])("shows the count for %s followers", (followers, sentence) => {
    render(<PresenterBar {...props({ presenting: true, followers })} />);
    expect(screen.getByRole("status").textContent).toBe(sentence);
  });

  it("shows no number when the count is unknown", () => {
    const { container } = render(<PresenterBar {...props({ presenting: true, followers: null })} />);
    expect(screen.getByRole("status").textContent).toBe("Count unavailable");
    expect(container.textContent).not.toMatch(/\d/);
  });

  it("shows no connection line while live", () => {
    render(<PresenterBar {...props({ presenting: true, followers: 3 })} />);
    expect(screen.queryByText(/Reconnecting/)).toBeNull();
    expect(screen.queryByText(/No contact/)).toBeNull();
    expect(screen.queryByText(/not sent/)).toBeNull();
  });

  it("shows the reconnecting line while catching up", () => {
    render(<PresenterBar {...props({ presenting: true, link: "catching_up" })} />);
    expect(screen.getByText("Reconnecting. Students still follow, a few seconds behind.")).toBeTruthy();
  });

  it("shows the last contact time when out of touch", () => {
    render(<PresenterBar {...props({ presenting: true, link: "out_of_touch" })} />);
    expect(screen.getByText("No contact with the server since 10:42:07 AM. Students may be behind.")).toBeTruthy();
  });

  it("shows the unsent notice inside the status region", () => {
    render(<PresenterBar {...props({ presenting: true, unsent: true })} />);
    expect(screen.getByRole("status").contains(screen.getByText("Slide not sent, retrying"))).toBe(true);
  });

  it("keeps every changing text in one status region and the buttons out of it", () => {
    render(<PresenterBar {...props({ presenting: true, followers: 2, link: "catching_up", unsent: true })} />);
    const regions = screen.getAllByRole("status");
    expect(regions).toHaveLength(1);
    expect(regions[0].children).toHaveLength(3);
    expect(regions[0].contains(screen.getByText("2 students following"))).toBe(true);
    expect(regions[0].contains(screen.getByText(/Reconnecting/))).toBe(true);
    expect(regions[0].contains(button("End session"))).toBe(false);
    expect(regions[0].contains(screen.getByText("Live"))).toBe(false);
  });

  it("calls onEnd when End session is clicked", () => {
    const onPresent = vi.fn();
    const onEnd = vi.fn();
    render(<PresenterBar {...props({ presenting: true, onPresent, onEnd })} />);
    fireEvent.click(button("End session"));
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onPresent).not.toHaveBeenCalled();
  });

  it("disables End session while busy", () => {
    const onEnd = vi.fn();
    render(<PresenterBar {...props({ presenting: true, busy: true, onEnd })} />);
    expect(button("End session").disabled).toBe(true);
    fireEvent.click(button("End session"));
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("keeps End session enabled when the deck is not ready", () => {
    render(<PresenterBar {...props({ presenting: true, ready: false })} />);
    expect(button("End session").disabled).toBe(false);
  });
});
