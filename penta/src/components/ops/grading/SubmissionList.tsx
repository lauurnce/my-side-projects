import outlineStyles from "@/components/classes/teacher/outline/outline.module.css";
import teacherStyles from "@/components/classes/teacher/teacher.module.css";
import { StatusChip } from "@/components/ui/StatusChip";
import { GradeForm, type GradeAction } from "./GradeForm";
import { gradingNotes, stateChip, summaryCounts, summaryLine, type GradingRow } from "./helpers";
import styles from "./grading.module.css";

export type SubmissionListProps = {
  rows: GradingRow[] | null;
  points: number;
  gradeAction: GradeAction;
};

function RowFile({ file }: { file: NonNullable<GradingRow["file"]> }) {
  return (
    <div className={styles.file}>
      <p className={styles.fileName}>
        <bdi>{file.name}</bdi>
      </p>
      <p className={styles.meta}>{file.detail}</p>
      <p className={styles.meta}>{file.handedIn}</p>
      {file.href ? (
        <a className={outlineStyles.button} href={file.href}>
          Open file
        </a>
      ) : (
        <p className={styles.removed}>{gradingNotes.fileRemoved}</p>
      )}
    </div>
  );
}

function RowRecord({ record }: { record: NonNullable<GradingRow["record"]> }) {
  return (
    <div className={styles.record}>
      <p className={styles.recordLine}>{record.headline}</p>
      {record.history.length > 0 && (
        <ol className={styles.history}>
          {record.history.map((sentence, index) => (
            <li key={index}>{sentence}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Row({ row, points, gradeAction }: { row: GradingRow; points: number; gradeAction: GradeAction }) {
  const chip = stateChip(row.state);

  return (
    <li className={styles.row}>
      <div className={styles.info}>
        <p className={styles.name} dir="auto">
          {row.name}
        </p>
        <div className={styles.chips}>
          <StatusChip status={chip.status}>{chip.word}</StatusChip>
          {row.lateText && <StatusChip status="late">{row.lateText}</StatusChip>}
        </div>
        {row.file && <RowFile file={row.file} />}
        {row.record && <RowRecord record={row.record} />}
      </div>
      {row.submission && (
        <GradeForm
          submissionId={row.submission.id}
          uploadId={row.submission.uploadId}
          studentName={row.name}
          points={points}
          score={row.submission.score}
          feedback={row.submission.feedback}
          action={gradeAction}
        />
      )}
    </li>
  );
}

export function SubmissionList({ rows, points, gradeAction }: SubmissionListProps) {
  return (
    <section className={teacherStyles.section} aria-labelledby="submissions-title">
      <div className={teacherStyles.sectionHead}>
        <h2 id="submissions-title" className={teacherStyles.sectionTitle}>
          Submissions
        </h2>
      </div>
      {rows === null && (
        <p role="alert" className={teacherStyles.notice}>
          {gradingNotes.rosterFailed}
        </p>
      )}
      {rows?.length === 0 && <p className={teacherStyles.empty}>{gradingNotes.noStudents}</p>}
      {rows && rows.length > 0 && (
        <>
          <p className={styles.summary}>{summaryLine(summaryCounts(rows))}</p>
          <p className={styles.note}>{gradingNotes.notScanned}</p>
          <ul className={styles.rows}>
            {rows.map((row) => (
              <Row key={row.studentId} row={row} points={points} gradeAction={gradeAction} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
