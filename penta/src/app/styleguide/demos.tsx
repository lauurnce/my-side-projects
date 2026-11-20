"use client";

import { useState } from "react";
import { IndexPill } from "@/components/ui/IndexPill";
import { UploadDrop } from "@/components/ui/UploadDrop";
import { ViewSwitch } from "@/components/ui/ViewSwitch";
import { pills, viewOptions } from "./data";
import styles from "./page.module.css";

const ignoreFiles = () => undefined;

export function IndexPillDemo() {
  const [activeIndex, setActiveIndex] = useState("01");

  return (
    <div className={styles.pillStack}>
      {pills.map((pill) => (
        <IndexPill
          key={pill.index}
          {...pill}
          active={pill.index === activeIndex}
          onSelect={() => setActiveIndex(pill.index)}
        />
      ))}
    </div>
  );
}

export function ViewSwitchDemo() {
  const [view, setView] = useState<string>(viewOptions[0].value);

  return <ViewSwitch label="View" options={viewOptions} value={view} onChange={setView} />;
}

export function UploadDropDemo({ hint }: { hint: string }) {
  const shared = { title: "Drop your file", hint, accept: ".docx,.pdf", onFiles: ignoreFiles };

  return (
    <div className={styles.uploadGrid}>
      <UploadDrop {...shared} name="upload-idle" />
      <UploadDrop {...shared} name="upload-busy" state="uploading" message="Uploading chapter-3-draft.docx" />
      <UploadDrop {...shared} name="upload-error" state="error" message="Error: this file is not a DOCX or PDF" />
    </div>
  );
}
