import { signOut } from "@/app/auth/actions";
import styles from "./AppBar.module.css";

export function SignOutButton() {
  return (
    <form action={signOut} className={styles.signOut}>
      <button type="submit" className={styles.signOutButton}>
        Sign out
      </button>
    </form>
  );
}
