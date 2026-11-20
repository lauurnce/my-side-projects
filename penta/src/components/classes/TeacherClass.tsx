import type { CurrentUser } from "@/lib/auth";

export async function TeacherClass({ user, classId }: { user: CurrentUser; classId: string }) {
  return (
    <p>
      {user.fullName} {classId}
    </p>
  );
}
