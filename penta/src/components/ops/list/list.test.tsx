import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ClassOps } from "../ClassOps";
import { attemptOn, fixedNow, openOn, pastDue, quiz } from "./fixtures";

afterEach(cleanup);

const activities = [
  quiz("open", { title: "Message brokers" }),
  quiz("undated", { title: "Adapters", dueAt: null, timeLimitMin: null }),
  quiz("running", { title: "Queues" }),
  quiz("done", { title: "Topics", points: 5 }),
  quiz("closed", { title: "Gateways", dueAt: pastDue }),
  quiz("draft", { title: "Unpublished quiz", publishedAt: null }),
];
const attempts = [openOn("running"), attemptOn("done")];

function renderOps(shown = activities) {
  render(<ClassOps classCode="INTE 301" activities={shown} attempts={attempts} now={fixedNow} />);
  return within(screen.getByRole("region", { name: "Ops" }));
}

function chipOf(link: HTMLElement): [string | null, string | null] {
  const chip = link.querySelector("[data-status]");
  return [chip?.getAttribute("data-status") ?? null, chip?.textContent ?? null];
}

describe("ClassOps", () => {
  it("names the section and counts the published activities", () => {
    const section = renderOps();
    expect(section.getByRole("heading", { level: 2 }).textContent).toBe("Ops");
    expect(section.getByText("5 activities")).toBeTruthy();
    expect(section.queryByText("Unpublished quiz")).toBeNull();
  });

  it("links each card to its quiz with the class code and the detail line", () => {
    const links = renderOps().getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/ops/open",
      "/ops/undated",
      "/ops/running",
      "/ops/done",
      "/ops/closed",
    ]);
    expect(links[0].textContent).toContain("Quiz · INTE 301");
    expect(links[0].textContent).toContain("Message brokers");
    expect(links[0].textContent).toContain("12 points · 20 minutes");
    expect(links[1].textContent).toContain("12 points · no time limit");
    expect(links[0].querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(links[0].querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 24 24");
  });

  it("gives each state a chip with a word", () => {
    const links = renderOps().getAllByRole("link");
    expect(links.map(chipOf)).toEqual([
      ["due", "Due Nov 28, 11:59 PM"],
      ["due", "No due date"],
      ["submitted", "In progress"],
      ["graded", "Graded · 4 of 5"],
      ["due", "Closed"],
    ]);
  });

  it("never uses the gold chip", () => {
    renderOps();
    expect(document.querySelector('[data-status="late"]')).toBeNull();
    expect(document.querySelector('[data-status="live"]')).toBeNull();
  });

  it("words one activity", () => {
    expect(renderOps([activities[0]]).getByText("1 activity")).toBeTruthy();
  });

  it("shows the empty state with no published activity", () => {
    const section = renderOps([activities[5]]);
    expect(section.getByText("0 activities")).toBeTruthy();
    expect(
      section.getByText("No activities yet. Quizzes show up here when your teacher publishes one."),
    ).toBeTruthy();
    expect(section.queryByRole("link")).toBeNull();
  });

  it("renders a title with markup as text", () => {
    const section = renderOps([quiz("x", { title: "<img src=x onerror=alert(1)>" })]);
    expect(document.querySelector("img")).toBeNull();
    expect(section.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });
});
