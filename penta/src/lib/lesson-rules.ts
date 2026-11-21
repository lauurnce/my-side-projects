import { z } from "zod";
import { routeLimits } from "@/lib/config";

const unsafeNameCharacters = /[\u0001-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/;
const unsafeBodyCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩﻿]/;
const tooDeepQuote = /^(?:\s*>){13,}/m;
const tooDeepIndent = /^[ \t]{49,}\S/m;

function cleanTitle(maxLength: number, emptyMessage: string) {
  return z
    .string()
    .trim()
    .min(1, emptyMessage)
    .max(maxLength, `Use ${maxLength} characters or fewer`)
    .refine((value) => !unsafeNameCharacters.test(value), "Remove hidden or control characters");
}

export const moduleTitleSchema = cleanTitle(routeLimits.moduleTitleLength, "Enter a module title");

export const lessonTitleSchema = cleanTitle(routeLimits.lessonTitleLength, "Enter a lesson title");

export const lessonBodySchema = z
  .string()
  .transform((value) => value.replace(/\r\n?/g, "\n"))
  .refine(
    (value) => value.length <= routeLimits.lessonBodyLength,
    `Use ${routeLimits.lessonBodyLength.toLocaleString("en-US")} characters or fewer`,
  )
  .refine((value) => !unsafeBodyCharacters.test(value), "Remove hidden or control characters")
  .refine(
    (value) => !tooDeepQuote.test(value) && !tooDeepIndent.test(value),
    "Quotes and lists are nested too deep",
  );

export const lessonMinutesSchema = z.coerce
  .number("Enter the minutes as a number")
  .int("Enter whole minutes")
  .min(1, "Enter at least 1 minute")
  .max(routeLimits.lessonMinutesMax, `Enter ${routeLimits.lessonMinutesMax} minutes or fewer`);
