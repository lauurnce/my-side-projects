import Link from "next/link";
import { Panel, Panels } from "@/components/landing/Panels";
import panelStyles from "@/components/landing/Panels.module.css";
import { AltitudeMeter } from "@/components/ui/AltitudeMeter";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { Grain } from "@/components/ui/Grain";
import { OctagonCTA } from "@/components/ui/OctagonCTA";
import { RouteCard } from "@/components/ui/RouteCard";
import type { Role } from "@/lib/auth";
import { formatMeters, nextUp, type ClassProgress } from "@/lib/classes";
import { hubAltitude } from "@/lib/routes";
import styles from "./Hub.module.css";

export type HubClass = ClassProgress & {
  id: string;
  code: string;
  title: string;
  section: string;
};

type HubProps = {
  role: Role;
  classes: HubClass[];
};

const shownClassLimit = 3;

const routesCopy: Record<Role, { action: string; empty: string }> = {
  student: { action: "Join a class", empty: "Enter a join code from your teacher." },
  teacher: { action: "Create a class", empty: "Create your first class." },
};

function classCount(count: number): string {
  return count === 1 ? "1 class" : `${count} classes`;
}

function draftCount(count: number): string {
  return count === 1 ? "1 draft" : `${count} drafts`;
}

function sum(classes: HubClass[], key: "published" | "drafts"): number {
  return classes.reduce((total, item) => total + item[key], 0);
}

function heroCopy(role: Role, classes: HubClass[]): { lines: [string, string]; lead: string } {
  const published = sum(classes, "published");
  if (role === "teacher") {
    return {
      lines: ["You teach", classCount(classes.length)],
      lead: `${published} published and ${draftCount(sum(classes, "drafts"))} across your classes.`,
    };
  }
  return {
    lines: ["You’re at", `${formatMeters(hubAltitude(classes))} m`],
    lead:
      published > 0
        ? "Your altitude is the average across your classes."
        : "Altitude starts counting when your classes have lessons.",
  };
}

export function HubHero({ role, classes }: HubProps) {
  const hasClasses = classes.length > 0;
  const { lines, lead } = heroCopy(role, classes);

  return (
    <section className={styles.hero}>
      <Grain />
      <div className={styles.heroText}>
        <p className={styles.labels}>
          <BracketLabel>Hub</BracketLabel> <BracketLabel>{role}</BracketLabel>{" "}
          <BracketLabel>{classCount(classes.length)}</BracketLabel>
        </p>
        <h1 className={styles.headline}>
          <span>{lines[0]}</span> <span>{lines[1]}</span>
        </h1>
        <p className={styles.lead}>{lead}</p>
        <OctagonCTA
          href="/classes"
          eyebrow="Layer 01 · Routes"
          title={hasClasses ? "Open classes" : routesCopy[role].action}
        />
      </div>
      {role === "student" ? (
        <div className={styles.meter}>
          <AltitudeMeter
            meters={hubAltitude(classes)}
            note="Every finished lesson adds meters. Summit = 3,000 m per term."
          />
        </div>
      ) : null}
    </section>
  );
}

function ContinueCard({ classes }: { classes: HubClass[] }) {
  const target = nextUp(classes);

  return (
    <div className={styles.feature}>
      <div className={`building-image ${styles.building}`} aria-hidden="true" />
      <Grain />
      <div className={styles.scrim} aria-hidden="true" />
      <div className={styles.featureText}>
        <BracketLabel>Continue where you left off</BracketLabel>
        {target ? (
          <>
            <span className={styles.featureCode}>{target.code}</span>
            <span className={styles.featureName}>{target.title}</span>
          </>
        ) : (
          <span className={styles.featureCode}>You are up to date.</span>
        )}
      </div>
      {target ? (
        <div className={styles.featureAction}>
          <OctagonCTA
            href={`/classes/${target.id}/lessons/${target.next.id}`}
            eyebrow="Next lesson"
            title={target.next.title}
            size={72}
          />
        </div>
      ) : null}
    </div>
  );
}

function TeacherCard({ item }: { item: HubClass }) {
  return (
    <Link className={styles.teacherLink} href={`/classes/${item.id}`}>
      <span className={styles.teacherCard}>
        <span className={styles.teacherRow}>
          <span>{item.code}</span>
          {item.section ? (
            <span>
              <span aria-hidden="true">[ </span>
              {item.section}
              <span aria-hidden="true"> ]</span>
            </span>
          ) : null}
        </span>
        <span className={styles.teacherTitle}>{item.title}</span>
        <span className={`${styles.teacherRow} ${styles.teacherFoot}`}>
          {item.published} published · {draftCount(item.drafts)}
        </span>
      </span>
    </Link>
  );
}

function StudentCard({ item }: { item: HubClass }) {
  return (
    <RouteCard
      href={`/classes/${item.id}`}
      code={item.code}
      section={item.section || "Class"}
      title={item.title}
      lessonsDone={item.done}
      lessonsTotal={item.published}
      meters={item.meters}
    />
  );
}

function HubRoutes({ role, classes }: HubProps) {
  const shown = classes.slice(0, shownClassLimit);
  const showContinue = role === "student" && sum(classes, "published") > 0;

  return (
    <Panel id="routes" cover={1}>
      <div className={panelStyles.head}>
        <h2 id="routes-title" className={panelStyles.title}>
          Routes
        </h2>
        <p className={panelStyles.labels}>
          <BracketLabel>Layer 01 · Learning management</BracketLabel>
          <BracketLabel>{classCount(classes.length)}</BracketLabel>
        </p>
      </div>
      {shown.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No classes yet</p>
          <p className={styles.emptyText}>{routesCopy[role].empty}</p>
          <Link href="/classes" className={styles.textLink}>
            Go to classes
          </Link>
        </div>
      ) : (
        <div className={showContinue ? styles.routes : undefined}>
          {showContinue ? <ContinueCard classes={classes} /> : null}
          <ul className={styles.cards}>
            {shown.map((item) => (
              <li key={item.id} className={styles.cell}>
                {role === "teacher" ? <TeacherCard item={item} /> : <StudentCard item={item} />}
              </li>
            ))}
          </ul>
        </div>
      )}
      {classes.length > shownClassLimit ? (
        <Link href="/classes" className={styles.textLink}>
          See all {classes.length} classes
        </Link>
      ) : null}
    </Panel>
  );
}

function HubDecks() {
  return (
    <Panel id="decks" cover={2} deep>
      <div className={panelStyles.head}>
        <h2 id="decks-title" className={panelStyles.title}>
          Decks
        </h2>
        <p className={panelStyles.labels}>
          <BracketLabel>Layer 02 · Presentations</BracketLabel>
          <BracketLabel>0 decks</BracketLabel>
        </p>
      </div>
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No decks yet</p>
        <p className={styles.emptyText}>Decks show up here when a teacher uploads one to a class.</p>
      </div>
    </Panel>
  );
}

function HubOps() {
  return (
    <Panel id="ops">
      <div className={panelStyles.head}>
        <h2 id="ops-title" className={panelStyles.title}>
          Ops
        </h2>
        <p className={panelStyles.labels}>
          <BracketLabel>Layer 03 · Activities</BracketLabel>
          <BracketLabel>0 due</BracketLabel>
        </p>
      </div>
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>Nothing due</p>
        <p className={styles.emptyText}>Quizzes, uploads and threads show up here when a class has them.</p>
      </div>
    </Panel>
  );
}

export function HubLayers(props: HubProps) {
  return (
    <Panels>
      <HubRoutes {...props} />
      <HubDecks />
      <HubOps />
    </Panels>
  );
}
