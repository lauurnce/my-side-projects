"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createClassFailed,
  createClassSchema,
  removeStudentSchema,
  type CreateClassField,
  type CreateClassState,
} from "./teacher-schema";

const createClassFields: CreateClassField[] = ["code", "title", "section", "term"];

function textValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function firstErrors(error: z.ZodError<Record<CreateClassField, string>>) {
  const errors = z.flattenError(error).fieldErrors;
  return Object.fromEntries(
    createClassFields.flatMap((field) => (errors[field]?.[0] ? [[field, errors[field][0]]] : [])),
  );
}

export async function createClass(_previousState: CreateClassState, formData: FormData): Promise<CreateClassState> {
  const user = await requireRole("teacher");
  const values = Object.fromEntries(
    createClassFields.map((field) => [field, textValue(formData, field).slice(0, 200)]),
  ) as Record<CreateClassField, string>;

  const parsed = createClassSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: firstErrors(parsed.error), values };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("classes")
    .insert({ ...parsed.data, teacher_id: user.id })
    .select("id")
    .single();
  if (error || !data) return { message: createClassFailed, values };

  revalidatePath("/classes");
  redirect(`/classes/${data.id}`);
}

export async function removeStudent(formData: FormData): Promise<void> {
  await requireRole("teacher");
  const parsed = removeStudentSchema.safeParse({
    classId: formData.get("classId"),
    studentId: formData.get("studentId"),
  });
  if (!parsed.success) redirect("/classes");

  const { classId, studentId } = parsed.data;
  const supabase = await createClient();
  const { data: removed } = await supabase.rpc("remove_student", {
    target_class: classId,
    target_student: studentId,
  });

  revalidatePath(`/classes/${classId}`);
  revalidatePath("/classes");
  redirect(`/classes/${classId}?removed=${removed === true ? "yes" : "no"}`);
}
