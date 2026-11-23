import { AltitudeMeter } from "@/components/ui/AltitudeMeter";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { formatMeters } from "@/lib/classes";
import { altitudeFor, type Altitude } from "@/lib/grades";
import styles from "./altitude.module.css";
import { anyClassCounts, basisNote, breakdownText, classMeters, weightsSentence } from "./helpers";

export type AltitudeClass = { id: string; code: string; title: string };

export type AltitudeViewProps = { altitude: Altitude; classes: AltitudeClass[] };

function ClassRow({ item, altitude }: { item: AltitudeClass; altitude: Altitude }) {
  const own = altitudeFor(altitude, item.id);
  const meters = formatMeters(classMeters(altitude, item.id));
  const note = basisNote(own);

  return (
    <li className={styles.row}>
      <span className={styles.code}>{item.code}</span>
      <span className={styles.name}>{item.title}</span>
      <span className={styles.meters}>
        <span aria-hidden="true">{meters} m</span>
        <span className="visually-hidden">{meters} meters</span>
      </span>
      <span className={styles.breakdown}>{breakdownText(own)}</span>
      {note ? <span className={styles.note}>{note}</span> : null}
    </li>
  );
}

export function AltitudeView({ altitude, classes }: AltitudeViewProps) {
  return (
    <section className={styles.section} aria-labelledby="altitude-title">
      <div className={styles.head}>
        <h2 id="altitude-title" className={styles.heading}>
          Altitude
        </h2>
        <BracketLabel>Progress</BracketLabel>
      </div>
      {classes.length === 0 ? (
        <p className={styles.empty}>No classes yet. Join a class to start climbing.</p>
      ) : (
        <div className={styles.body}>
          <AltitudeMeter
            meters={altitude.overall}
            note={
              anyClassCounts(altitude)
                ? "The average across your classes that count."
                : "Starts counting when a class has lessons, decks or graded work."
            }
          />
          <ul className={styles.rows}>
            {classes.map((item) => (
              <ClassRow key={item.id} item={item} altitude={altitude} />
            ))}
          </ul>
        </div>
      )}
      <p className={styles.explain}>{weightsSentence()}</p>
    </section>
  );
}
