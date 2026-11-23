"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cancelHandIn, finishHandIn, startHandIn } from "@/app/ops/handin-actions";
import { putFile } from "@/components/decks/teacher/put-file";
import { FilterPill } from "@/components/ui/FilterPill";
import { UploadDrop, type UploadState } from "@/components/ui/UploadDrop";
import { formatBytes } from "@/lib/decks";
import { chosenProblem, handInText, lateWarning, progressLabel, submitLabel, uploadPercent } from "./helpers";
import styles from "./handin.module.css";

type Phase = "idle" | "starting" | "uploading" | "finishing";

type Notice = { tone: "status" | "alert"; text: string };

type Chosen = { file: File | null; error: string };

export type HandInFormProps = {
  activityId: string;
  dueAt: string | null;
  current: { isLate: boolean } | null;
  now: number;
};

const nothingChosen: Chosen = { file: null, error: "" };

const phaseText: Record<Exclude<Phase, "idle" | "uploading">, string> = {
  starting: handInText.starting,
  finishing: handInText.finishing,
};

function alertNotice(text: string): Notice {
  return { tone: "alert", text };
}

function dropState(chosen: Chosen, busy: boolean): UploadState {
  if (chosen.error) return "error";
  return busy ? "uploading" : "idle";
}

export function HandInForm({ activityId, dueAt, current, now }: HandInFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [chosen, setChosen] = useState<Chosen>(nothingChosen);
  const [phase, setPhase] = useState<Phase>("idle");
  const [percent, setPercent] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirming, setConfirming] = useState(false);
  const busy = phase !== "idle";
  const replacing = current !== null;

  function choose(files: File[]) {
    if (busy) return;
    const error = chosenProblem(files[0]);
    setNotice(null);
    setConfirming(false);
    setChosen(error ? { file: null, error } : { file: files[0], error: "" });
  }

  function clearForm() {
    formRef.current?.reset();
    setChosen(nothingChosen);
  }

  async function runHandIn(file: File): Promise<Notice> {
    setPhase("starting");
    const started = await startHandIn({ activityId, file: { name: file.name, size: file.size } });
    if (started.status === "error") {
      router.refresh();
      return alertNotice(started.message);
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setPercent(0);
    setPhase("uploading");
    try {
      const report = (loadedBytes: number) => setPercent(uploadPercent(loadedBytes, file.size));
      await putFile(started.target, file, report, controller.signal);
    } catch {
      await cancelHandIn({ uploadId: started.uploadId }).catch(() => undefined);
      return controller.signal.aborted
        ? { tone: "status", text: handInText.cancelled }
        : alertNotice(handInText.failed);
    }

    setPhase("finishing");
    const finished = await finishHandIn({ uploadId: started.uploadId });
    router.refresh();
    if (finished.status === "error") return alertNotice(finished.message);

    clearForm();
    return { tone: "status", text: replacing ? handInText.replaced : handInText.handedIn };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setNotice(null);
    if (!chosen.file) {
      setChosen({ file: null, error: chosen.error || handInText.noFile });
      return;
    }
    if (!confirming && lateWarning(dueAt, current, Date.now()) === "replace_late") {
      setConfirming(true);
      return;
    }

    setConfirming(false);
    try {
      setNotice(await runHandIn(chosen.file));
    } catch {
      setNotice(alertNotice(handInText.noAnswer));
    } finally {
      abortRef.current = null;
      setPhase("idle");
    }
  }

  return (
    <form ref={formRef} className={styles.form} onSubmit={submit} noValidate aria-label="Hand in a file">
      <fieldset className={styles.fields} disabled={busy}>
        <UploadDrop
          name="file"
          title="Your file"
          hint={handInText.dropHint}
          accept=".pdf,.docx"
          state={dropState(chosen, busy)}
          message={chosen.error}
          onFiles={choose}
        />
        {chosen.file ? (
          <p className={styles.chosen}>
            Chosen file: <bdi>{chosen.file.name}</bdi>, {formatBytes(chosen.file.size)}
          </p>
        ) : null}
        {lateWarning(dueAt, current, now) === "new_late" ? <p className={styles.warning}>{handInText.lateNew}</p> : null}
        {confirming ? (
          <div role="alert" className={styles.confirm}>
            <p className={styles.confirmText}>{handInText.lateReplace}</p>
            <p className={styles.confirmText}>{handInText.confirmReplace}</p>
            <button type="button" className={styles.button} onClick={() => setConfirming(false)}>
              Keep the current file
            </button>
          </div>
        ) : null}
        <FilterPill type="submit" className={styles.submit}>
          {submitLabel(replacing)}
        </FilterPill>
        {replacing ? <p className={styles.small}>{handInText.replaceNote}</p> : null}
      </fieldset>
      {phase === "uploading" ? (
        <div className={styles.progress}>
          <p className={styles.progressText}>{progressLabel(percent)}</p>
          <progress className={styles.bar} max={100} value={percent} aria-label="Upload progress" />
          <button type="button" className={styles.button} onClick={() => abortRef.current?.abort()}>
            Cancel
          </button>
        </div>
      ) : null}
      {phase === "starting" || phase === "finishing" ? <p className={styles.progressText}>{phaseText[phase]}</p> : null}
      {notice ? (
        <p role={notice.tone === "status" ? "status" : "alert"} className={styles.notice}>
          {notice.text}
        </p>
      ) : null}
      <noscript>
        <p className={styles.note}>{handInText.needsScript}</p>
      </noscript>
    </form>
  );
}
