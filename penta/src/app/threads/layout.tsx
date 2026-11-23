import { AppBar } from "@/components/app/AppBar";
import { requireUser } from "@/lib/auth";

export default async function ThreadsLayout({ children }: LayoutProps<"/threads">) {
  const user = await requireUser();

  return (
    <>
      <AppBar user={user} />
      <main id="main">{children}</main>
    </>
  );
}
