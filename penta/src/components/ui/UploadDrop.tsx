"use client";

import { useId, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import styles from "./UploadDrop.module.css";

export type UploadState = "idle" | "uploading" | "error";

export type UploadDropProps = {
  name: string;
  title: string;
  hint: string;
  accept: string;
  state?: UploadState;
  message?: string;
  onFiles: (files: File[]) => void;
};

const fallbackError = "Upload failed. Try again.";

function statusText(state: UploadState, message: string) {
  if (state === "error" && !message) return fallbackError;
  if (state !== "error" || !message || message.startsWith("Error: ")) return message;
  return `Error: ${message}`;
}

export function UploadDrop({ name, title, hint, accept, state = "idle", message = "", onFiles }: UploadDropProps) {
  const messageId = useId();
  const [dragging, setDragging] = useState(false);
  const uploading = state === "uploading";

  function holdDrag(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(true);
  }

  function releaseDrag() {
    setDragging(false);
  }

  function takeDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (uploading) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  }

  function takeChoice(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) onFiles(files);
  }

  return (
    <div className={styles.wrap}>
      <label
        className={styles.drop}
        data-dragging={dragging}
        data-state={state}
        aria-busy={uploading ? "true" : undefined}
        onDragEnter={holdDrag}
        onDragOver={holdDrag}
        onDragLeave={releaseDrag}
        onDrop={takeDrop}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 16 V4 M7 9 L12 4 L17 9 M4 20 H20" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        <span className={styles.title}>{title}</span>
        <span className={styles.hint}>{hint}</span>
        <input
          className={styles.input}
          type="file"
          name={name}
          accept={accept}
          disabled={uploading}
          aria-invalid={state === "error" ? "true" : undefined}
          aria-describedby={messageId}
          onChange={takeChoice}
        />
      </label>
      <p id={messageId} role="status" className={styles.message}>
        {statusText(state, message)}
      </p>
    </div>
  );
}
