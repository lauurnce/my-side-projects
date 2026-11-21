import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/app/auth/actions", () => ({ signUp: vi.fn(), logIn: vi.fn() }));

import { LoginForm } from "@/app/login/LoginForm";
import { SignupForm } from "./SignupForm";

afterEach(cleanup);

function describedText(input: HTMLElement) {
  const ids = (input.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
  return ids.map((id) => document.getElementById(id)?.textContent);
}

describe("SignupForm", () => {
  it("labels every field and sets its autocomplete value", () => {
    render(<SignupForm next="" />);
    expect(screen.getByLabelText("Full name").getAttribute("autocomplete")).toBe("name");
    expect(screen.getByLabelText("School email").getAttribute("autocomplete")).toBe("email");
    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("new-password");
    expect(screen.getByLabelText("Teacher code").getAttribute("autocomplete")).toBe("off");
  });

  it("ties the password rule and the teacher code hint to their fields", () => {
    render(<SignupForm next="" />);
    expect(describedText(screen.getByLabelText("Password"))).toEqual(["At least 8 characters"]);
    expect(describedText(screen.getByLabelText("Teacher code"))).toEqual(["Leave empty if you are a student"]);
  });

  it("leaves the teacher code optional", () => {
    render(<SignupForm next="" />);
    expect(screen.getByLabelText("Teacher code").hasAttribute("required")).toBe(false);
    expect(screen.getByLabelText("Password").hasAttribute("required")).toBe(true);
  });

  it("has a submit button, an empty alert and a link to the login page", () => {
    render(<SignupForm next="" />);
    expect(screen.getByRole("button", { name: "Sign up" }).getAttribute("type")).toBe("submit");
    expect(screen.getByRole("alert").textContent).toBe("");
    expect(screen.getByRole("link", { name: "Log in" }).getAttribute("href")).toBe("/login");
  });
});

describe("LoginForm", () => {
  it("labels the fields and sets their autocomplete values", () => {
    render(<LoginForm next="" />);
    expect(screen.getByLabelText("School email").getAttribute("autocomplete")).toBe("email");
    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("current-password");
  });

  it("carries next in a hidden field as text", () => {
    const { container } = render(<LoginForm next={'/classes/abc?tab="people"'} />);
    const hidden = container.querySelector<HTMLInputElement>('input[type="hidden"][name="next"]');
    expect(hidden?.value).toBe('/classes/abc?tab="people"');
  });

  it("has a submit button and a link to the sign-up page", () => {
    render(<LoginForm next="" />);
    expect(screen.getByRole("button", { name: "Log in" }).getAttribute("type")).toBe("submit");
    expect(screen.getByRole("link", { name: "Sign up" }).getAttribute("href")).toBe("/signup");
  });
});
