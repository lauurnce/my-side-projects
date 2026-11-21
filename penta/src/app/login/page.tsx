import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Log in · PENTA" };

type LoginPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next } = await searchParams;

  return (
    <AuthShell
      title="Log in"
      labels={["Base camp", "Students and teachers"]}
      lead="Pick up the climb where you left it. Your classes are waiting."
    >
      <LoginForm next={typeof next === "string" ? next : ""} />
    </AuthShell>
  );
}
