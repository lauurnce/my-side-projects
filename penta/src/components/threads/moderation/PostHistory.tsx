"use client";

import { useEffect, useId, useRef, useState } from "react";
import { loadPostHistory } from "@/app/threads/moderation-actions";
import type { HistoryEvent } from "@/app/threads/moderation-schema";
import { historyLabel, historyLead, moderationCopy } from "./labels";
import styles from "./moderation.module.css";

type Loaded = { events: HistoryEvent[]; failed: boolean };

function HistoryItem({ event }: { event: HistoryEvent }) {
  const when = event.happenedAt ? `, ${event.happenedAt}` : "";
  const isEdit = event.kind === "edit";
  return (
    <li className={styles.event}>
      <p className={styles.eventLine}>
        {historyLead(event.kind)} <bdi>{event.actorName}</bdi>
        {when}.{isEdit ? ` ${moderationCopy.earlierText}` : ""}
      </p>
      {isEdit ? (
        <p className={styles.oldBody} dir="auto" tabIndex={0}>
          {event.oldBody}
        </p>
      ) : null}
    </li>
  );
}

function HistoryPanel({ loaded }: { loaded: Loaded | null }) {
  if (!loaded) return <p className={styles.note}>{moderationCopy.historyLoading}</p>;
  if (loaded.failed) return <p className={styles.note}>{moderationCopy.historyFailed}</p>;
  if (loaded.events.length === 0) return <p className={styles.note}>{moderationCopy.historyEmpty}</p>;
  return (
    <ol className={styles.events}>
      {loaded.events.map((event, index) => (
        <HistoryItem key={index} event={event} />
      ))}
    </ol>
  );
}

export function PostHistory({ postId, authorName, version }: { postId: string; authorName: string; version: string }) {
  const panelId = useId();
  const requested = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!open || requested.current === version) return;
    requested.current = version;
    loadPostHistory(postId).then(
      (events) => {
        if (requested.current === version) setLoaded({ events, failed: false });
      },
      () => {
        if (requested.current !== version) return;
        requested.current = null;
        setLoaded({ events: [], failed: true });
      },
    );
  }, [open, version, postId]);

  return (
    <div className={styles.history}>
      <button
        type="button"
        className={styles.button}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={historyLabel(authorName)}
        onClick={() => setOpen(!open)}
      >
        {moderationCopy.history}
      </button>
      <div id={panelId} className={styles.panel} hidden={!open} aria-live="polite">
        {open ? <HistoryPanel loaded={loaded} /> : null}
      </div>
    </div>
  );
}
