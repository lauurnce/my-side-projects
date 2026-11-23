import Link from "next/link";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { StatusChip } from "@/components/ui/StatusChip";
import { dueLabel } from "@/lib/manila-time";
import styles from "./deadlines.module.css";
import { moreLabel, shownDeadlines, type DeadlineGroups, type DeadlineItem } from "./helpers";

export type DeadlinesViewProps = { groups: DeadlineGroups; now: number };

function Row({ item, now, missing }: { item: DeadlineItem; now: number; missing?: boolean }) {
  return (
    <li className={styles.row}>
      <span className={styles.meta}>
        <span>{item.kind}</span>
        <span>{item.classCode}</span>
      </span>
      <Link className={styles.title} href={`/ops/${item.id}`}>
        {item.title}
      </Link>
      <span className={styles.due}>
        {missing ? <StatusChip status="due">Missing</StatusChip> : null}
        <span>{dueLabel(item.dueAt, now) ?? "No due date"}</span>
      </span>
    </li>
  );
}

function Group({ title, items, now, more, missing }: {
  title?: string;
  items: DeadlineItem[];
  now: number;
  more: number;
  missing?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <div className={styles.group}>
      {title ? <h3 className={styles.groupTitle}>{title}</h3> : null}
      <ul className={styles.rows} aria-label={title ?? "Upcoming"}>
        {items.map((item) => (
          <Row key={item.id} item={item} now={now} missing={missing} />
        ))}
      </ul>
      {more > 0 ? <p className={styles.more}>{moreLabel(more)}</p> : null}
    </div>
  );
}

export function DeadlinesView({ groups, now }: DeadlinesViewProps) {
  const shown = shownDeadlines(groups);
  const open = shown.upcoming.length + shown.undated.length;

  return (
    <section className={styles.section} aria-labelledby="deadlines-title">
      <div className={styles.head}>
        <h2 id="deadlines-title" className={styles.heading}>
          My upcoming deadlines
        </h2>
        <BracketLabel>{`${groups.upcoming.length + groups.undated.length} to do`}</BracketLabel>
      </div>
      {open === 0 ? (
        <p className={styles.empty}>
          {shown.pastDue.length === 0 ? "Nothing due. You are all caught up." : "Nothing upcoming."}
        </p>
      ) : null}
      <Group items={shown.upcoming} now={now} more={shown.undated.length === 0 ? shown.more : 0} />
      <Group title="No due date" items={shown.undated} now={now} more={shown.more} />
      <Group title="Past due" items={shown.pastDue} now={now} more={shown.morePastDue} missing />
    </section>
  );
}
