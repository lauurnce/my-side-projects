import { useCallback, useEffect, useState } from "react";
import { refreshDeckSource } from "@/app/decks/view-actions";
import type { DeckSource } from "@/components/decks/DeckViewer";
import { documentOptions, loadPdfjs } from "@/lib/pdf-client";
import { createRangeReader, type RangeReader } from "./range-fetch";

type Pdfjs = Awaited<ReturnType<typeof loadPdfjs>>;
type LoadingTask = ReturnType<Pdfjs["getDocument"]>;

export type PdfDocument = Awaited<LoadingTask["promise"]>;

export type DeckDocument = {
  status: "loading" | "ready" | "failed";
  doc: PdfDocument | null;
  annotationMode: number;
  fail: () => void;
  retry: () => void;
};

type Opened = { key: string; doc: PdfDocument; annotationMode: number };

const rangeChunkSize = 262144;

function createTransport(pdfjs: Pdfjs, length: number, readRange: RangeReader, onFailure: () => void) {
  class DeckRangeTransport extends pdfjs.PDFDataRangeTransport {
    closed = false;

    requestDataRange(begin: number, end: number) {
      readRange(begin, end).then(
        (chunk) => {
          if (!this.closed) this.onDataRange(begin, chunk);
        },
        () => {
          if (!this.closed) onFailure();
        },
      );
    }

    abort() {
      this.closed = true;
    }
  }
  return new DeckRangeTransport(length, null);
}

export function useDeckDocument(deckId: string, source: DeckSource | null): DeckDocument {
  const [attempt, setAttempt] = useState(0);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const url = source?.url ?? null;
  const length = source?.length ?? 0;
  const key = `${url} ${length} ${attempt}`;

  useEffect(() => {
    if (!url) return;
    let stale = false;
    let task: LoadingTask | null = null;
    let transport: ReturnType<typeof createTransport> | null = null;

    const fail = () => {
      if (!stale) setFailedKey(key);
    };
    const refresh = () =>
      refreshDeckSource({ deckId }).then(
        (fresh) => fresh?.url ?? null,
        () => null,
      );

    const open = async () => {
      const pdfjs = await loadPdfjs();
      const firstUrl = attempt === 0 ? url : await refresh();
      if (stale) return;
      if (!firstUrl) return fail();
      const readRange = createRangeReader(firstUrl, (target, init) => fetch(target, init), refresh);
      transport = createTransport(pdfjs, length, readRange, fail);
      task = pdfjs.getDocument({
        range: transport,
        disableAutoFetch: true,
        disableStream: true,
        rangeChunkSize,
        ...documentOptions,
      });
      const doc = await task.promise;
      if (stale) return;
      setOpened({ key, doc, annotationMode: pdfjs.AnnotationMode.DISABLE });
    };

    open().catch(fail);
    return () => {
      stale = true;
      if (transport) transport.closed = true;
      void task?.destroy();
    };
  }, [deckId, url, length, attempt, key]);

  const fail = useCallback(() => setFailedKey(key), [key]);
  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  const doc = opened?.key === key && failedKey !== key ? opened.doc : null;

  return {
    status: failedKey === key ? "failed" : doc ? "ready" : "loading",
    doc,
    annotationMode: opened?.annotationMode ?? 0,
    fail,
    retry,
  };
}
