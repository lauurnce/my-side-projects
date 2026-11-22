import { AppBar } from "@/components/app/AppBar";
import { requireUser } from "@/lib/auth";

export default async function OpsLayout({ children }: LayoutProps<"/ops">) {
  const user = await requireUser();

  return (
    <>
      <AppBar user={user} />
      <main id="main">{children}</main>
    </>
  );
}
