import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { Roster } from "./Roster";

afterEach(cleanup);

const classId = "3f2b8c1e-6a4d-4e5f-9b7a-1c2d3e4f5a6b";
const rows = [
  { studentId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", fullName: "Ana Reyes", joinedAt: "2026-11-26T16:00:00Z" },
  { studentId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", fullName: "Sam Student", joinedAt: "2026-11-20T01:00:00Z" },
];
const removeAction = async () => {};

describe("Roster", () => {
  it("shows the empty state and no table when there are no students", () => {
    render(<Roster classId={classId} rows={[]} removeAction={removeAction} />);
    expect(screen.getByText("No students yet. Share the join code.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("renders a captioned table with column headers", () => {
    render(<Roster classId={classId} rows={rows} removeAction={removeAction} />);
    const table = screen.getByRole("table", { name: "Students in this class" });
    expect(table.querySelector("caption")?.textContent).toBe("Students in this class");
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual(["Student", "Joined", "Action"]);
    expect(headers.every((header) => header.getAttribute("scope") === "col")).toBe(true);
  });

  it("puts each student in a row header with the joined date in Manila time", () => {
    render(<Roster classId={classId} rows={rows} removeAction={removeAction} />);
    const name = screen.getByRole("rowheader", { name: "Ana Reyes" });
    expect(name.getAttribute("scope")).toBe("row");
    const row = name.closest("tr")!;
    const time = row.querySelector("time")!;
    expect(time.textContent).toBe("Nov 27, 2026");
    expect(time.getAttribute("datetime")).toBe("2026-11-26T16:00:00Z");
  });

  it("names each remove button after the student and sends both ids", () => {
    render(<Roster classId={classId} rows={rows} removeAction={removeAction} />);
    const button = screen.getByRole("button", { name: "Remove Sam Student" }) as HTMLButtonElement;
    expect(button.type).toBe("submit");
    expect(button.textContent).toBe("Remove");
    const data = new FormData(button.form!);
    expect(data.get("classId")).toBe(classId);
    expect(data.get("studentId")).toBe(rows[1].studentId);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("scrolls inside its own focusable box", () => {
    render(<Roster classId={classId} rows={rows} removeAction={removeAction} />);
    const box = screen.getByRole("region", { name: "Class roster" });
    expect(box.tabIndex).toBe(0);
    expect(within(box).getByRole("table")).toBeTruthy();
  });

  it("renders a name with markup as text", () => {
    const tricky = [{ ...rows[0], fullName: "<img src=x onerror=alert(1)>" }];
    const { container } = render(<Roster classId={classId} rows={tricky} removeAction={removeAction} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("rowheader").textContent).toBe("<img src=x onerror=alert(1)>");
  });
});
