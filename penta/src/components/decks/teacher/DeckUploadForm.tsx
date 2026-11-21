"use client";

import { useRef, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { cancelDeckUpload, finishDeckUpload, startDeckUpload } from "@/app/decks/upload-actions";
import teacherStyles from "@/components/classes/teacher/teacher.module.css";
import { Field } from "@/components/ui/Field";
import { FilterPill } from "@/components/ui/FilterPill";
import { UploadDrop, type UploadState } from "@/components/ui/UploadDrop";
import { deckLimits } from "@/lib/config";
import type { DeckFileKind } from "@/lib/deck-file";
import type { UploadTargets } from "@/lib/deck-storage";
import styles from "./decks.module.css";
import type { LessonGroup } from "./labels";
import { LessonSelect } from "./LessonSelect";
import { countPdfPages } from "./pdf-pages";
import { putFile } from "./put-file";
import {
  chosenFileLabel,
  chosenFileProblem,
  loadsSlowly,
  progressLabel,
  uploadMessages,
  uploadPercent,
} from "./upload-checks";

type Phase = "idle" | "checking" | "uploading" | "finishing";

type Notice = { tone: "status" | "alert"; text: string };

type Chosen = { file: File | null; error: string };

type Upload = { title: string; lessonId: string | null; pdf: File; pptx: File | null };

export type DeckUploadFormProps = {
  classId: string;
  lessons: LessonGroup[];
  storageFull: boolean;
};

const nothingChosen: Chosen = { file: null, error: "" };

const phaseText: Record<Exclude<Phase, "idle" | "uploading">, string> = {
  checking: uploadMessages.checking,
  finishing: uploadMessages.finishing,
};

function alertNotice(text: string): Notice {
  return { tone: "alert", text };
}

function sizeOf(file: File): { name: string; size: number } {
  return { name: file.name, size: file.size };
}

function dropState(chosen: Chosen, busy: boolean): UploadState {
  if (chosen.error) return "error";
  return busy ? "uploading" : "idle";
}

function dropMessage(chosen: Chosen): string {
  if (chosen.error) return chosen.error;
  return chosen.file ? chosenFileLabel(chosen.file) : "";
}

export function DeckUploadForm({ classId, lessons, storageFull }: DeckUploadFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [pdf, setPdf] = useState<Chosen>(nothingChosen);
  const [pptx, setPptx] = useState<Chosen>(nothingChosen);
  const [titleError, setTitleError] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [percent, setPercent] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const busy = phase !== "idle";
  const locked = busy || storageFull;

  function chooser(kind: DeckFileKind, setChosen: Dispatch<SetStateAction<Chosen>>) {
    return (files: File[]) => {
      if (locked) return;
      const error = chosenFileProblem(kind, files[0]);
      setChosen(error ? { file: null, error } : { file: files[0], error: "" });
    };
  }

  function emptyInput(name: DeckFileKind) {
    const input = formRef.current?.elements.namedItem(name);
    if (input instanceof HTMLInputElement) input.value = "";
  }

  function removePptx() {
    emptyInput("pptx");
    setPptx(nothingChosen);
  }

  function clearForm() {
    formRef.current?.reset();
    setPdf(nothingChosen);
    setPptx(nothingChosen);
  }

  async function sendFiles(upload: Upload, targets: UploadTargets, signal: AbortSignal) {
    const parts = [{ file: upload.pdf, target: targets.pdf }];
    if (upload.pptx && targets.pptx) parts.push({ file: upload.pptx, target: targets.pptx });
    const sizes = parts.map((part) => part.file.size);
    const loaded = parts.map(() => 0);

    for (const [index, part] of parts.entries()) {
      const report = (bytes: number) => {
        loaded[index] = bytes;
        setPercent(uploadPercent(loaded, sizes));
      };
      await putFile(part.target, part.file, report, signal);
      report(part.file.size);
    }
  }

  async function runUpload(upload: Upload): Promise<Notice | null> {
    setPhase("checking");
    const pages = await countPdfPages(upload.pdf);
    if (!pages.ok) {
      emptyInput("pdf");
      setPdf({ file: null, error: pages.message });
      return null;
    }

    const started = await startDeckUpload({
      classId,
      title: upload.title,
      lessonId: upload.lessonId,
      pdf: sizeOf(upload.pdf),
      pptx: upload.pptx ? sizeOf(upload.pptx) : null,
    });
    if (started.status === "error") return alertNotice(started.message);

    const controller = new AbortController();
    abortRef.current = controller;
    setPercent(0);
    setPhase("uploading");
    try {
      await sendFiles(upload, started.targets, controller.signal);
    } catch {
      await cancelDeckUpload({ deckId: started.deckId }).catch(() => undefined);
      router.refresh();
      return controller.signal.aborted
        ? { tone: "status", text: uploadMessages.cancelled }
        : alertNotice(uploadMessages.failed);
    }

    setPhase("finishing");
    const finished = await finishDeckUpload({ deckId: started.deckId, slideCount: pages.pages });
    router.refresh();
    if (finished.status === "error") return alertNotice(finished.message);

    clearForm();
    return { tone: "status", text: uploadMessages.uploaded };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) return;

    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const lessonId = String(form.get("lessonId") ?? "") || null;
    setNotice(null);
    setTitleError(title ? "" : uploadMessages.noTitle);
    if (!pdf.file) setPdf({ file: null, error: pdf.error || uploadMessages.noPdf });
    if (!title || !pdf.file) return;

    try {
      setNotice(await runUpload({ title, lessonId, pdf: pdf.file, pptx: pptx.file }));
    } catch {
      setNotice(alertNotice(uploadMessages.noAnswer));
    } finally {
      abortRef.current = null;
      setPhase("idle");
    }
  }

  return (
    <form ref={formRef} className={styles.form} onSubmit={submit} noValidate aria-label="Upload a deck">
      <p className={styles.intro}>{uploadMessages.intro}</p>
      <fieldset className={styles.fields} disabled={locked}>
        <div className={styles.wide}>
          <Field
            label="Deck title"
            name="title"
            type="text"
            required
            maxLength={deckLimits.titleLength}
            autoComplete="off"
            error={titleError || undefined}
          />
        </div>
        <div className={styles.dropCell}>
          <UploadDrop
            name="pdf"
            title="Slides as PDF"
            hint={uploadMessages.pdfHint}
            accept=".pdf,application/pdf"
            state={dropState(pdf, busy)}
            message={dropMessage(pdf)}
            onFiles={chooser("pdf", setPdf)}
          />
          {loadsSlowly(pdf.file) && <p className={styles.note}>{uploadMessages.slowLoad}</p>}
        </div>
        <div className={styles.dropCell}>
          <UploadDrop
            name="pptx"
            title="PowerPoint original"
            hint={uploadMessages.pptxHint}
            accept=".pptx"
            state={dropState(pptx, busy)}
            message={dropMessage(pptx)}
            onFiles={chooser("pptx", setPptx)}
          />
          {pptx.file && (
            <button type="button" className={`${styles.button} ${styles.remove}`} onClick={removePptx}>
              Remove the PowerPoint file
            </button>
          )}
        </div>
        <div className={styles.wide}>
          <LessonSelect groups={lessons} />
        </div>
        <FilterPill type="submit" className={styles.submit}>
          Upload deck
        </FilterPill>
      </fieldset>
      {storageFull && <p className={styles.warning}>{uploadMessages.full}</p>}
      {phase === "uploading" && (
        <div className={styles.progress}>
          <p className={styles.progressText}>{progressLabel(percent)}</p>
          <progress className={styles.bar} max={100} value={percent} aria-label="Upload progress" />
          <button type="button" className={styles.button} onClick={() => abortRef.current?.abort()}>
            Cancel
          </button>
        </div>
      )}
      {(phase === "checking" || phase === "finishing") && <p className={styles.progressText}>{phaseText[phase]}</p>}
      {notice && (
        <p role={notice.tone === "status" ? "status" : "alert"} className={teacherStyles.notice}>
          {notice.text}
        </p>
      )}
    </form>
  );
}
