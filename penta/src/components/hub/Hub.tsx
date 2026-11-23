import Link from "next/link";
import {
  classCodes,
  deckCountLabel,
  deckHref,
  liveByTitle,
  liveDeckIds,
  moreLiveLabel,
  readyDecks,
  unknownClassCode,
} from "@/components/decks/library/helpers";
import { HubDeckList } from "@/components/decks/library/HubDeckList";
import { altitudeLine, anyClassCounts, classMeters } from "@/components/grades/altitude/helpers";
import { Panel, Panels } from "@/components/landing/Panels";
import {
  activityCountLabel,
  dueCount,
  dueCountLabel,
  hubOpsLimit,
  hubOrder,
  nextDue,
  nextDueText,
  opsHref,
  opsItems,
  type OpsData,
  type OpsItem,
} from "@/components/ops/list/helpers";
import { OpsCards } from "@/components/ops/list/OpsCards";
import panelStyles from "@/components/landing/Panels.module.css";
import { AltitudeMeter } from "@/components/ui/AltitudeMeter";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { Grain } from "@/components/ui/Grain";
import { OctagonCTA } from "@/components/ui/OctagonCTA";
import { RouteCard } from "@/components/ui/RouteCard";
import { StatusChip } from "@/components/ui/StatusChip";
import type { Role } from "@/lib/auth";
import type { DeckSummary } from "@/lib/decks";
import { formatMeters, nextUp, type ClassProgress } from "@/lib/classes";
import { noAltitude, type Altitude } from "@/lib/grades";
import type { LiveDeck } from "@/lib/live";
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
  altitude?: Altitude;
};

type HubLiveProps = HubProps & {
  decks?: DeckSummary[];
  live?: LiveDeck[];
  ops?: OpsData;
};

const noOps: OpsData = { activities: [], attempts: [], now: 0 };

const shownClassLimit = 3;

const liveLinkText: Record<Role, string> = {
  student: "Join live",
  teacher: "Open the presenter view",
};

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

function heroCopy(role: Role, classes: HubClass[], altitude: Altitude): { lines: [string, string]; lead: string } {
  const published = sum(classes, "published");
  if (role === "teacher") {
    return {
      lines: ["You teach", classCount(classes.length)],
      lead: `${published} published and ${draftCount(sum(classes, "drafts"))} across your classes.`,
    };
  }
  return {
    lines: ["You’re at", `${formatMeters(altitude.overall)} m`],
    lead: anyClassCounts(altitude)
      ? "Your altitude is the average across your classes."
      : "Altitude starts counting when your classes have lessons, decks or graded work.",
  };
}

function LiveRow({ role, decks }: { role: Role; decks: DeckSummary[] }) {
  const [first, ...others] = decks;
  if (!first) return null;

  return (
    <p className={styles.liveRow}>
      <StatusChip status="live">Live</StatusChip>
      <span className={styles.liveTitle}>{first.title}</span>
      {others.length > 0 ? <span className={styles.liveMore}>{moreLiveLabel(others.length)}</span> : null}
      <Link href={deckHref(first.id)} className={styles.liveLink}>
        {liveLinkText[role]}
      </Link>
    </p>
  );
}

function DueRow({ item }: { item: OpsItem | null }) {
  if (!item) return null;

  return (
    <p className={styles.liveRow}>
      <Link href={opsHref(item.activity.id)} className={styles.dueLink}>
        {nextDueText(item)}
      </Link>
    </p>
  );
}

export function HubHero({ role, classes, altitude = noAltitude, decks = [], live = [], ops = noOps }: HubLiveProps) {
  const hasClasses = classes.length > 0;
  const { lines, lead } = heroCopy(role, classes, altitude);

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
        <LiveRow role={role} decks={liveByTitle(decks, liveDeckIds(live))} />
        {role === "student" ? <DueRow item={nextDue(opsItems(ops))} /> : null}
        <OctagonCTA
          href="/classes"
          eyebrow="Layer 01 · Routes"
          title={hasClasses ? "Open classes" : routesCopy[role].action}
        />
      </div>
      {role === "student" ? (
        <div className={styles.meter}>
          <AltitudeMeter
            meters={altitude.overall}
            note="Lessons, decks and graded work add meters. Summit = 3,000 m per term."
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

function StudentCard({ item, meters }: { item: HubClass; meters: number }) {
  return (
    <RouteCard
      href={`/classes/${item.id}`}
      code={item.code}
      section={item.section || "Class"}
      title={item.title}
      lessonsDone={item.done}
      lessonsTotal={item.published}
      meters={meters}
    />
  );
}

function HubRoutes({ role, classes, altitude = noAltitude }: HubProps) {
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
                {role === "teacher" ? (
                  <TeacherCard item={item} />
                ) : (
                  <StudentCard item={item} meters={classMeters(altitude, item.id)} />
                )}
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
      {role === "student" && shown.length > 0 ? (
        <p className={styles.altitudeLine}>
          <span className={styles.altitudeKey}>Your altitude</span>
          <span>{altitudeLine(altitude.overall)}</span>
          <Link href="/grades" className={styles.altitudeLink}>
            See how it adds up
          </Link>
        </p>
      ) : null}
    </Panel>
  );
}

function HubDecks({ role, classes, decks, liveIds }: HubProps & { decks: DeckSummary[]; liveIds: Set<string> }) {
  const ready = readyDecks(decks);
  const anyLive = ready.some((deck) => liveIds.has(deck.id));

  return (
    <Panel id="decks" cover={2} deep>
      <div className={panelStyles.head}>
        <h2 id="decks-title" className={panelStyles.title}>
          Decks
        </h2>
        <p className={panelStyles.labels}>
          <BracketLabel>Layer 02 · Presentations</BracketLabel>
          <BracketLabel>{deckCountLabel(ready.length)}</BracketLabel>
        </p>
        {anyLive ? <StatusChip status="live">Live now</StatusChip> : null}
      </div>
      {ready.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No decks yet</p>
          <p className={styles.emptyText}>Decks show up here when a teacher uploads one to a class.</p>
        </div>
      ) : (
        <HubDeckList role={role} decks={ready} classes={classes} liveIds={liveIds} />
      )}
    </Panel>
  );
}

function OpsEmpty() {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>Nothing due</p>
      <p className={styles.emptyText}>Quizzes, uploads and threads show up here when a class has them.</p>
    </div>
  );
}

function TeacherOpsRows({ ops, codeFor }: { ops: OpsData; codeFor: (classId: string) => string }) {
  return (
    <ul className={styles.opsRows}>
      {[...ops.activities].reverse().slice(0, hubOpsLimit).map((activity) => (
        <li key={activity.id} className={styles.cell}>
          <Link className={styles.opsRow} href={opsHref(activity.id)}>
            <span className={styles.opsRowTitle}>{activity.title}</span>
            <span className={styles.opsRowMeta}>
              <span>{codeFor(activity.classId)}</span>
              <span>{activity.publishedAt === null ? "Draft" : "Published"}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function HubOps({ role, classes, ops }: HubProps & { ops: OpsData }) {
  const codes = classCodes(classes);
  const codeFor = (classId: string) => codes.get(classId) ?? unknownClassCode;
  const items = role === "student" ? opsItems(ops) : [];
  const total = role === "student" ? items.length : ops.activities.length;
  const countLabel = role === "student" ? dueCountLabel(dueCount(items)) : activityCountLabel(total);

  return (
    <Panel id="ops">
      <div className={panelStyles.head}>
        <h2 id="ops-title" className={panelStyles.title}>
          Ops
        </h2>
        <p className={panelStyles.labels}>
          <BracketLabel>Layer 03 · Activities</BracketLabel>
          <BracketLabel>{countLabel}</BracketLabel>
        </p>
      </div>
      {total === 0 ? <OpsEmpty /> : null}
      {total > 0 && role === "student" ? (
        <OpsCards
          items={hubOrder(items).slice(0, hubOpsLimit)}
          codeFor={(item) => codeFor(item.activity.classId)}
          compact
        />
      ) : null}
      {total > 0 && role === "teacher" ? <TeacherOpsRows ops={ops} codeFor={codeFor} /> : null}
      {total > hubOpsLimit ? (
        <Link href="/classes" className={styles.textLink}>
          See all in your classes
        </Link>
      ) : null}
    </Panel>
  );
}

export function HubLayers({ role, classes, altitude = noAltitude, decks = [], live = [], ops = noOps }: HubLiveProps) {
  return (
    <Panels>
      <HubRoutes role={role} classes={classes} altitude={altitude} />
      <HubDecks role={role} classes={classes} decks={decks} liveIds={liveDeckIds(live)} />
      <HubOps role={role} classes={classes} ops={ops} />
    </Panels>
  );
}
