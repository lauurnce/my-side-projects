import { z } from "zod";

const unsafeCharacters = /[\u0001-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/;

function cleanText(label: string, max: number) {
  return z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .refine((value) => !unsafeCharacters.test(value), `${label} has characters that are not allowed`);
}

function requiredText(label: string, max: number) {
  return cleanText(label, max).refine((value) => value.length > 0, `Enter the ${label.toLowerCase()}`);
}

export const createClassSchema = z.object({
  code: requiredText("Course code", 20),
  title: requiredText("Title", 120),
  section: cleanText("Section", 40),
  term: cleanText("Term", 40),
});

export const removeStudentSchema = z.object({
  classId: z.uuid(),
  studentId: z.uuid(),
});

export type CreateClassField = keyof z.infer<typeof createClassSchema>;

export type CreateClassState = {
  message?: string;
  fieldErrors?: Partial<Record<CreateClassField, string>>;
  values?: Record<CreateClassField, string>;
};

export const createClassFailed = "Could not create the class";
