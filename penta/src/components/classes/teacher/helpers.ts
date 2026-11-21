const manilaDate = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", dateStyle: "medium" });

export function formatJoinedDate(joinedAt: string): string {
  const date = new Date(joinedAt);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return manilaDate.format(date);
}

export function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function countByClass(enrollments: { class_id: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { class_id } of enrollments) counts.set(class_id, (counts.get(class_id) ?? 0) + 1);
  return counts;
}

export type RosterRow = {
  studentId: string;
  fullName: string;
  joinedAt: string;
};

export function toRosterRows(
  enrollments: { student_id: string; joined_at: string }[],
  profiles: { id: string; full_name: string }[],
): RosterRow[] {
  const names = new Map(profiles.map((profile) => [profile.id, profile.full_name]));
  return enrollments
    .map((enrollment) => ({
      studentId: enrollment.student_id,
      fullName: names.get(enrollment.student_id) ?? "Unknown student",
      joinedAt: enrollment.joined_at,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "en"));
}
