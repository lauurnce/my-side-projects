import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ViewSwitch, type ViewOption } from "./ViewSwitch";

afterEach(cleanup);

const options: readonly [ViewOption, ViewOption] = [
  { value: "public", label: "Public" },
  { value: "hub", label: "Student hub" },
];

describe("ViewSwitch", () => {
  it("renders a labelled group with two buttons", () => {
    render(<ViewSwitch label="View" options={options} value="public" onChange={() => {}} />);
    const group = screen.getByRole("group", { name: "View" });
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    buttons.forEach((button) => {
      expect(group.contains(button)).toBe(true);
      expect(button.getAttribute("type")).toBe("button");
    });
  });

  it("presses the first option when its value is selected", () => {
    render(<ViewSwitch label="View" options={options} value="public" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Public", pressed: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Student hub", pressed: false })).toBeTruthy();
  });

  it("presses the second option when its value is selected", () => {
    render(<ViewSwitch label="View" options={options} value="hub" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Public", pressed: false })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Student hub", pressed: true })).toBeTruthy();
  });

  it("calls onChange with the value of the clicked option", () => {
    const onChange = vi.fn();
    render(<ViewSwitch label="View" options={options} value="public" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Student hub" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("hub");
    fireEvent.click(screen.getByRole("button", { name: "Public" }));
    expect(onChange).toHaveBeenLastCalledWith("public");
  });
});
