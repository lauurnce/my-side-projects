"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp } from "@/app/auth/actions";
import { emptyAuthState } from "@/app/auth/schemas";
import styles from "@/components/auth/AuthForm.module.css";
import { Field } from "@/components/ui/Field";
import { FilterPill } from "@/components/ui/FilterPill";

const passwordHintId = "signup-password-hint";
const teacherCodeHintId = "signup-teacher-code-hint";

export function SignupForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signUp, emptyAuthState);

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="next" value={next} />
      <p role="alert" className={styles.message}>
        {state.error}
      </p>
      <p role="status" className={styles.message}>
        {state.notice}
      </p>
      <Field
        label="Full name"
        name="fullName"
        type="text"
        autoComplete="name"
        required
        maxLength={120}
        defaultValue={state.values?.fullName}
        error={state.fieldErrors?.fullName}
      />
      <Field
        label="School email"
        name="email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <div className={styles.group}>
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          aria-describedby={passwordHintId}
          error={state.fieldErrors?.password}
        />
        <span id={passwordHintId} className={styles.hint}>
          At least 8 characters
        </span>
      </div>
      <div className={styles.group}>
        <Field
          label="Teacher code"
          name="teacherCode"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={100}
          aria-describedby={teacherCodeHintId}
          error={state.fieldErrors?.teacherCode}
        />
        <span id={teacherCodeHintId} className={styles.hint}>
          Leave empty if you are a student
        </span>
      </div>
      <FilterPill type="submit" disabled={pending} className={styles.submit}>
        {pending ? "Creating account" : "Sign up"}
      </FilterPill>
      <p className={styles.switch}>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </form>
  );
}
