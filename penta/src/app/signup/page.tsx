import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = { title: "Sign up · PENTA" };

type SignupPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const { next } = await searchParams;

  return (
    <AuthShell
      title="Sign up"
      labels={["Base camp", "0 m of 3,000 m"]}
      lead="Make an account with your school email. Students join classes with a code from their teacher."
    >
      <SignupForm next={typeof next === "string" ? next : ""} />
    </AuthShell>
  );
}
