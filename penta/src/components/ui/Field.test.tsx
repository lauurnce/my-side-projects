import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Field } from "./Field";

afterEach(cleanup);

describe("Field", () => {
  it("ties the label to the input", () => {
    render(<Field label="School email" />);
    expect(screen.getByLabelText("School email").tagName).toBe("INPUT");
    expect(screen.getByRole("textbox", { name: "School email" })).toBeTruthy();
  });

  it("passes through type, placeholder, name and handlers", () => {
    const onChange = vi.fn();
    render(
      <Field
        label="School email"
        type="email"
        name="email"
        placeholder="you@iskolarngbayan.pup.edu.ph"
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText("School email") as HTMLInputElement;
    expect(input.type).toBe("email");
    expect(input.name).toBe("email");
    expect(input.placeholder).toBe("you@iskolarngbayan.pup.edu.ph");
    fireEvent.change(input, { target: { value: "juan@iskolarngbayan.pup.edu.ph" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("has no error wiring without an error", () => {
    render(<Field label="School email" />);
    const input = screen.getByLabelText("School email");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.hasAttribute("aria-describedby")).toBe(false);
    expect(screen.queryByText(/^Error:/)).toBeNull();
  });

  it("wires the error to the input", () => {
    render(<Field label="School email" error="Use your school email" />);
    const input = screen.getByLabelText(/School email/);
    const error = screen.getByText("Error: Use your school email");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(error.id);
    expect(error.id).not.toBe("");
  });

  it("does not repeat the Error prefix", () => {
    render(<Field label="School email" error="Error: Use your school email" />);
    expect(screen.getByText("Error: Use your school email")).toBeTruthy();
  });

  it("keeps the caller description and adds the error to it", () => {
    render(<Field label="School email" error="Use your school email" aria-describedby="email-hint" />);
    const error = screen.getByText("Error: Use your school email");
    expect(screen.getByLabelText(/School email/).getAttribute("aria-describedby")).toBe(`email-hint ${error.id}`);
  });

  it("keeps the caller description when there is no error", () => {
    render(<Field label="School email" aria-describedby="email-hint" />);
    expect(screen.getByLabelText(/School email/).getAttribute("aria-describedby")).toBe("email-hint");
  });
});
