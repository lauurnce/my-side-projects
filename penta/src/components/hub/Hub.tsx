import Link from "next/link";
import { Panel, Panels } from "@/components/landing/Panels";
import panelStyles from "@/components/landing/Panels.module.css";
import { AltitudeMeter } from "@/components/ui/AltitudeMeter";
import { BracketLabel } from "@/components/ui/BracketLabel";
import { Grain } from "@/components/ui/Grain";
import { OctagonCTA } from "@/components/ui/OctagonCTA";
import { RouteCard } from "@/components/ui/RouteCard";
import type { Role } from "@/lib/auth";
import styles from "./Hub.module.css";

export type HubClass = {
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

export function HubHero({ role, classes }: HubProps) {
  const hasClasses = classes.length > 0;

  return (
    <section className={styles.hero}>
      <Grain />
      <div className={styles.heroText}>
        <p className={styles.labels}>
          <BracketLabel>Hub</BracketLabel> <BracketLabel>{role}</BracketLabel>{" "}
          <BracketLabel>{classCount(classes.length)}</BracketLabel>
        </p>
        <h1 className={styles.headline}>
          <span>You&rsquo;re at</span> <span>0 m</span>
        </h1>
        <p className={styles.lead}>Altitude starts counting when your classes have lessons.</p>
        <OctagonCTA
          href="/classes"
          eyebrow="Layer 01 · Routes"
          title={hasClasses ? "Open classes" : routesCopy[role].action}
        />
      </div>
      <div className={styles.meter}>
        <AltitudeMeter meters={0} note="Lessons, decks and activities each add meters. Summit = 3,000 m per term." />
      </div>
    </section>
  );
}

function HubRoutes({ role, classes }: HubProps) {
  const shown = classes.slice(0, shownClassLimit);

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
        <ul className={styles.cards}>
          {shown.map((item) => (
            <li key={item.id}>
              <RouteCard
                href={`/classes/${item.id}`}
                code={item.code}
                section={item.section || "Class"}
                title={item.title}
                lessonsDone={0}
                lessonsTotal={0}
                meters={0}
              />
            </li>
          ))}
        </ul>
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
