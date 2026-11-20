import { ThemeToggle } from "@/components/ui/ThemeToggle";

export function TopBar() {
  return (
    <header>
      <ThemeToggle />
      <a href="/login">Log in</a>
    </header>
  );
}
