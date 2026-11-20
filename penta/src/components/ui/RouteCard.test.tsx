import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RouteCard, type RouteCardProps } from "./RouteCard";

afterEach(cleanup);

const route: RouteCardProps = {
  href: "/routes/comp-018",
  code: "COMP 018",
  section: "BSIT 3-3",
  title: "Database Administration",
  lessonsDone: 7,
  lessonsTotal: 12,
  meters: 1740,
};

function fillWidth(overrides: Partial<RouteCardProps>) {
  const { container } = render(<RouteCard {...route} {...overrides} />);
  return container.querySelector<HTMLElement>("[data-fill]")?.style.width;
}

describe("RouteCard", () => {
  it("is one link named by its title", () => {
    render(<RouteCard {...route} />);
    const link = screen.getByRole("link", { name: /Database Administration/ });
    expect(link.getAttribute("href")).toBe("/routes/comp-018");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(link.style.clipPath).toBe("");
  });

  it("shows the code and the section with hidden brackets", () => {
    render(<RouteCard {...route} />);
    expect(screen.getByText("COMP 018")).toBeTruthy();
    const section = screen.getByText("BSIT 3-3");
    expect(section.textContent).toBe("[ BSIT 3-3 ]");
    expect(section.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  });

  it("shows the lesson count and the meters", () => {
    render(<RouteCard {...route} />);
    expect(screen.getByText("Lesson 7 / 12").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("1,740 m").getAttribute("aria-hidden")).toBe("true");
  });

  it("reads the lesson count and the meters in words", () => {
    render(<RouteCard {...route} />);
    expect(screen.getByText("Lesson 7 of 12").className).toBe("visually-hidden");
    expect(screen.getByText("1,740 meters").className).toBe("visually-hidden");
    const name = screen.getByRole("link").getAttribute("aria-label");
    expect(name).toBeNull();
  });

  it("draws a hidden bar at 58% for 7 of 12", () => {
    const { container } = render(<RouteCard {...route} />);
    const fill = container.querySelector<HTMLElement>("[data-fill]");
    expect(fill?.style.width).toBe("58%");
    expect(fill?.parentElement?.getAttribute("aria-hidden")).toBe("true");
  });

  it("clamps the bar for bad input", () => {
    expect(fillWidth({ lessonsDone: 0, lessonsTotal: 0 })).toBe("0%");
    cleanup();
    expect(fillWidth({ lessonsDone: 3, lessonsTotal: 0 })).toBe("0%");
    cleanup();
    expect(fillWidth({ lessonsDone: 15, lessonsTotal: 12 })).toBe("100%");
    cleanup();
    expect(fillWidth({ lessonsDone: -2, lessonsTotal: 12 })).toBe("0%");
    cleanup();
    expect(fillWidth({ lessonsDone: 12, lessonsTotal: 12 })).toBe("100%");
  });

  it("renders a static box with no link when there is no href", () => {
    const { container } = render(<RouteCard {...route} href={undefined} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.querySelector("a, button, [tabindex]")).toBeNull();
    expect(container.firstElementChild?.tagName).toBe("DIV");
    expect(screen.getByText("Database Administration")).toBeTruthy();
    expect(container.querySelector<HTMLElement>("[data-fill]")?.style.width).toBe("58%");
  });
});
