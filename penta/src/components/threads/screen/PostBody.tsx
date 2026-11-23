"use client";

import { useEffect, useRef, useState } from "react";
import { FilterPill } from "@/components/ui/FilterPill";
import { PostMarkdown } from "@/components/ui/Markdown";
import { PostBoundary } from "./PostBoundary";
import styles from "./screen.module.css";

export function PostBody({ body }: { body: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const element = box.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setOverflows(element.scrollHeight > element.clientHeight + 1));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={box} className={expanded ? styles.bodyOpen : styles.body}>
        <PostBoundary body={body}>
          <PostMarkdown>{body}</PostMarkdown>
        </PostBoundary>
      </div>
      {overflows && !expanded ? (
        <FilterPill className={styles.ghost} onClick={() => setExpanded(true)}>
          Show more
        </FilterPill>
      ) : null}
    </>
  );
}
