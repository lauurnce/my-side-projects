import { describe, expect, it } from "vitest";
import { firstFieldErrors, logInSchema, signUpSchema } from "./schemas";

const good = { email: "ana@pup.edu.ph", fullName: "Ana Reyes", password: "long enough", teacherCode: "" };

function signUpErrors(input: Record<string, unknown>) {
  const parsed = signUpSchema.safeParse({ ...good, ...input });
  return parsed.success ? {} : firstFieldErrors(parsed.error);
}

describe("signUpSchema", () => {
  it("accepts a good sign-up", () => {
    expect(signUpSchema.parse(good)).toEqual(good);
  });

  it("accepts a sign-up with no teacher code field", () => {
    const withoutCode = { email: good.email, fullName: good.fullName, password: good.password };
    expect(signUpSchema.parse(withoutCode).teacherCode).toBeUndefined();
  });

  it("trims and lower-cases the email", () => {
    expect(signUpSchema.parse({ ...good, email: "  Ana.Reyes@PUP.edu.ph " }).email).toBe("ana.reyes@pup.edu.ph");
  });

  it.each(["", "   ", "ana", "ana@", "@pup.edu.ph", "ana reyes@pup.edu.ph"])("rejects the email %j", (email) => {
    expect(signUpErrors({ email }).email).toBeTruthy();
  });

  it("rejects an email longer than 254 characters", () => {
    expect(signUpErrors({ email: `${"a".repeat(250)}@pup.edu.ph` }).email).toBeTruthy();
  });

  it("trims the full name", () => {
    expect(signUpSchema.parse({ ...good, fullName: "  Ana Reyes  " }).fullName).toBe("Ana Reyes");
  });

  it.each(["", "    "])("rejects the empty full name %j", (fullName) => {
    expect(signUpErrors({ fullName }).fullName).toBe("Enter your full name");
  });

  it("accepts a full name of 120 characters and rejects 121", () => {
    expect(signUpErrors({ fullName: "a".repeat(120) }).fullName).toBeUndefined();
    expect(signUpErrors({ fullName: "a".repeat(121) }).fullName).toBeTruthy();
  });

  it("does not trim the password", () => {
    expect(signUpSchema.parse({ ...good, password: "  spaced pw  " }).password).toBe("  spaced pw  ");
  });

  it("counts spaces toward the password length", () => {
    expect(signUpErrors({ password: " 1234567" }).password).toBeUndefined();
  });

  it("accepts passwords of 8 and 72 characters", () => {
    expect(signUpErrors({ password: "a".repeat(8) }).password).toBeUndefined();
    expect(signUpErrors({ password: "a".repeat(72) }).password).toBeUndefined();
  });

  it("rejects passwords of 7 and 73 characters", () => {
    expect(signUpErrors({ password: "a".repeat(7) }).password).toBe("Use at least 8 characters");
    expect(signUpErrors({ password: "a".repeat(73) }).password).toBeTruthy();
  });

  it("accepts a teacher code of 100 characters and rejects 101", () => {
    expect(signUpErrors({ teacherCode: "a".repeat(100) }).teacherCode).toBeUndefined();
    expect(signUpErrors({ teacherCode: "a".repeat(101) }).teacherCode).toBe("That teacher code is not valid");
  });

  it.each([{ email: 5 }, { fullName: null }, { password: undefined }, { teacherCode: 12 }])(
    "rejects a value that is not text: %j",
    (input) => {
      expect(Object.keys(signUpErrors(input))).toHaveLength(1);
    },
  );

  it("reports one message per field", () => {
    expect(Object.keys(signUpErrors({ email: "", fullName: "", password: "" })).sort()).toEqual([
      "email",
      "fullName",
      "password",
    ]);
  });
});

describe("logInSchema", () => {
  it("lower-cases the email and keeps the password as typed", () => {
    expect(logInSchema.parse({ email: " ANA@pup.edu.ph", password: " pass word " })).toEqual({
      email: "ana@pup.edu.ph",
      password: " pass word ",
    });
  });

  it("rejects a bad email and an empty password", () => {
    const parsed = logInSchema.safeParse({ email: "ana", password: "" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(Object.keys(firstFieldErrors(parsed.error)).sort()).toEqual(["email", "password"]);
  });

  it("rejects a password longer than 72 characters", () => {
    expect(logInSchema.safeParse({ email: good.email, password: "a".repeat(73) }).success).toBe(false);
  });
});
