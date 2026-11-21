import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your school email")
  .max(254, "Use an email of 254 characters or fewer")
  .pipe(z.email("Enter a valid email address"));

const fullName = z
  .string()
  .trim()
  .min(1, "Enter your full name")
  .max(120, "Use a name of 120 characters or fewer");

const password = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Use a password of 72 characters or fewer");

const teacherCode = z.string().trim().max(100, "That teacher code is not valid").optional();

export const signUpSchema = z.object({ email, fullName, password, teacherCode });

export const logInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password").max(72, "Email or password is incorrect"),
});

export type AuthField = "email" | "fullName" | "password" | "teacherCode";

export type AuthState = {
  error?: string;
  notice?: string;
  fieldErrors?: Partial<Record<AuthField, string>>;
  values?: { email?: string; fullName?: string };
};

export const emptyAuthState: AuthState = {};

export function firstFieldErrors(error: z.ZodError): Partial<Record<AuthField, string>> {
  const errors: Partial<Record<AuthField, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as AuthField;
    errors[field] ??= issue.message;
  }
  return errors;
}
