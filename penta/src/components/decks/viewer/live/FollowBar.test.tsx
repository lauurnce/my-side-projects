import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FollowBar, type FollowBarProps } from "./FollowBar";

afterEach(cleanup);

const followLabel = "Live · you follow the teacher";
const followLine = "Your screen moves when the teacher moves. Browse freely any time, then jump back.";
const reconnecting = "Reconnecting. You may be a few seconds behind.";
const lastReadAt = Date.UTC(2026, 10, 27, 2, 42, 7);
const outOfTouch = "No contact with the server since 10:42:07 AM. This slide may be out of date.";

function show(overrides: Partial<FollowBarProps> = {}) {
  const props: FollowBarProps = {
    running: true,
    following: false,
    joined: false,
    link: "live",
    lastReadAt,
    liveSlide: 7,
    onJoin: vi.fn(),
    onBrowse: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<FollowBar {...props} />) };
}

function buttonNames(): string[] {
  return screen.getAllByRole("button").map((button) => button.textContent ?? "");
}

function statusText(): string {
  return screen.getByRole("status").textContent ?? "";
}

describe("FollowBar", () => {
  it("renders nothing when no session is running", () => {
    const { container } = show({ running: false, following: true, joined: true, link: "out_of_touch" });
    expect(container.innerHTML).toBe("");
  });

  it("invites a student who never joined", () => {
    const { props } = show();
    expect(screen.getByText("Live").dataset.status).toBe("live");
    expect(statusText()).toBe("Your teacher is presenting this deck. Slide 7 now.");
    expect(buttonNames()).toEqual(["Join live"]);
    expect(screen.queryByText(followLabel)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Join live" }));
    expect(props.onJoin).toHaveBeenCalledTimes(1);
    expect(props.onBrowse).not.toHaveBeenCalled();
  });

  it("names the slide the teacher is on", () => {
    show({ liveSlide: 12 });
    expect(statusText()).toBe("Your teacher is presenting this deck. Slide 12 now.");
  });

  it("shows the follow copy and the way out while following", () => {
    const { props } = show({ following: true, joined: true });
    expect(screen.getByText("Live").dataset.status).toBe("live");
    expect(screen.getByText(followLabel)).toBeTruthy();
    expect(statusText()).toBe(followLine);
    expect(buttonNames()).toEqual(["Browse freely"]);
    fireEvent.click(screen.getByRole("button", { name: "Browse freely" }));
    expect(props.onBrowse).toHaveBeenCalledTimes(1);
    expect(props.onJoin).not.toHaveBeenCalled();
  });

  it("offers a jump back to a student who browsed away", () => {
    const { props } = show({ joined: true });
    expect(screen.getByText("Live").dataset.status).toBe("live");
    expect(statusText()).toBe("You are browsing on your own. The teacher is on slide 7.");
    expect(buttonNames()).toEqual(["Jump back"]);
    expect(screen.queryByText(followLabel)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Jump back" }));
    expect(props.onJoin).toHaveBeenCalledTimes(1);
    expect(props.onBrowse).not.toHaveBeenCalled();
  });

  it("marks join and jump back as the primary action and browse as the quiet one", () => {
    const first = show();
    expect(screen.getByRole("button", { name: "Join live" }).className).toContain("primary");
    first.unmount();
    const second = show({ joined: true });
    expect(screen.getByRole("button", { name: "Jump back" }).className).toContain("primary");
    second.unmount();
    show({ following: true, joined: true });
    expect(screen.getByRole("button", { name: "Browse freely" }).className).not.toContain("primary");
  });

  it("uses real buttons that do not submit a form", () => {
    show();
    const button = screen.getByRole("button", { name: "Join live" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
  });

  it("says nothing about the connection while the link is live", () => {
    show({ following: true, joined: true, link: "live" });
    expect(screen.queryByText(reconnecting)).toBeNull();
    expect(statusText()).not.toContain("No contact");
  });

  it("says it is reconnecting while following and catching up", () => {
    show({ following: true, joined: true, link: "catching_up" });
    expect(screen.getByText(reconnecting)).toBeTruthy();
    expect(statusText()).toContain(followLine);
    expect(statusText()).toContain(reconnecting);
  });

  it("gives the last contact time in Manila next to the Live chip when out of touch", () => {
    show({ following: true, joined: true, link: "out_of_touch" });
    expect(screen.getByText("Live").dataset.status).toBe("live");
    expect(screen.getByText(outOfTouch)).toBeTruthy();
    expect(statusText()).toContain(outOfTouch);
    expect(buttonNames()).toEqual(["Browse freely"]);
  });

  it.each(["catching_up", "out_of_touch"] as const)(
    "keeps the %s sentence back from a student who never joined",
    (link) => {
      show({ link });
      expect(statusText()).toBe("Your teacher is presenting this deck. Slide 7 now.");
    },
  );

  it.each(["catching_up", "out_of_touch"] as const)(
    "keeps the %s sentence back from a student who is browsing",
    (link) => {
      show({ joined: true, link });
      expect(statusText()).toBe("You are browsing on your own. The teacher is on slide 7.");
    },
  );

  it("keeps one status region across every state", () => {
    const { rerender, props } = show();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    rerender(<FollowBar {...props} following joined />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    rerender(<FollowBar {...props} following joined link="out_of_touch" />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    rerender(<FollowBar {...props} joined />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("disappears when the session ends", () => {
    const { rerender, props, container } = show({ following: true, joined: true });
    rerender(<FollowBar {...props} running={false} following={false} joined={false} />);
    expect(container.innerHTML).toBe("");
  });
});
