"use client";

import Link from "next/link";
import { useActionState } from "react";
import { logIn } from "@/app/auth/actions";
import { emptyAuthState } from "@/app/auth/schemas";
import styles from "@/components/auth/AuthForm.module.css";
import { Field } from "@/components/ui/Field";
import { FilterPill } from "@/components/ui/FilterPill";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(logIn, emptyAuthState);

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="next" value={next} />
      <p role="alert" className={styles.message}>
        {state.error}
      </p>
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
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        maxLength={72}
        error={state.fieldErrors?.password}
      />
      <FilterPill type="submit" disabled={pending} className={styles.submit}>
        {pending ? "Logging in" : "Log in"}
      </FilterPill>
      <p className={styles.switch}>
        New to PENTA? <Link href="/signup">Sign up</Link>
      </p>
    </form>
  );
}
