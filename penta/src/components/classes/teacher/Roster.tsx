import { formatJoinedDate, type RosterRow } from "./helpers";
import { RemoveButton } from "./RemoveButton";
import styles from "./teacher.module.css";

export type RosterProps = {
  classId: string;
  rows: RosterRow[];
  removeAction: (formData: FormData) => Promise<void>;
};

export function Roster({ classId, rows, removeAction }: RosterProps) {
  if (rows.length === 0) return <p className={styles.empty}>No students yet. Share the join code.</p>;

  return (
    <div className={styles.tableBox} role="region" aria-label="Class roster" tabIndex={0}>
      <table className={styles.table}>
        <caption className="visually-hidden">Students in this class</caption>
        <thead>
          <tr>
            <th scope="col">Student</th>
            <th scope="col">Joined</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.studentId}>
              <th scope="row">{row.fullName}</th>
              <td>
                <time dateTime={row.joinedAt}>{formatJoinedDate(row.joinedAt)}</time>
              </td>
              <td>
                <form action={removeAction}>
                  <input type="hidden" name="classId" value={classId} />
                  <input type="hidden" name="studentId" value={row.studentId} />
                  <RemoveButton studentName={row.fullName} />
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
