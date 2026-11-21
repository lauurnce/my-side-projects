import { useEffect, useRef, useState, type RefObject } from "react";
import { canvasSize, slideText, type Box } from "./helpers";
import type { PdfDocument } from "./useDeckDocument";

type Running = { cancel: () => void; promise: Promise<unknown> };

type Shown<Value> = { doc: PdfDocument; slide: number; value: Value };

export type SlideCanvasOptions = {
  doc: PdfDocument | null;
  annotationMode: number;
  slide: number;
  box: Box | null;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onError: () => void;
};

const resizeDelay = 150;

function isCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === "RenderingCancelledException";
}

export function useBoxSize(ref: RefObject<HTMLElement | null>): Box | null {
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let measured = false;

    const keep = (next: Box) =>
      setBox((previous) =>
        previous && previous.width === next.width && previous.height === next.height ? previous : next,
      );

    const observer = new ResizeObserver(([entry]) => {
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      clearTimeout(timer);
      if (measured) {
        timer = setTimeout(() => keep(next), resizeDelay);
        return;
      }
      measured = true;
      keep(next);
    });
    observer.observe(element);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [ref]);

  return box;
}

export function useSlideCanvas({ doc, annotationMode, slide, box, canvasRef, onError }: SlideCanvasOptions) {
  const running = useRef<Running | null>(null);
  const [painted, setPainted] = useState<Shown<true> | null>(null);
  const [text, setText] = useState<Shown<string> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!doc || !box || !canvas) return;
    let stale = false;

    const paint = async () => {
      const previous = running.current;
      if (previous) {
        previous.cancel();
        await previous.promise.catch(() => undefined);
      }
      if (stale) return;
      const page = await doc.getPage(slide);
      if (stale) return;
      const size = canvasSize(page.getViewport({ scale: 1 }), box, window.devicePixelRatio);
      if (!size) return;
      canvas.width = size.width;
      canvas.height = size.height;
      const task = page.render({ canvas, viewport: page.getViewport({ scale: size.scale }), annotationMode });
      running.current = task;
      try {
        await task.promise;
      } finally {
        if (running.current === task) running.current = null;
        page.cleanup();
      }
      if (!stale) setPainted({ doc, slide, value: true });
    };

    paint().catch((error) => {
      if (!stale && !isCancelled(error)) onError();
    });
    return () => {
      stale = true;
      running.current?.cancel();
    };
  }, [doc, annotationMode, slide, box, canvasRef, onError]);

  useEffect(() => {
    if (!doc) return;
    let stale = false;

    const read = async () => {
      const page = await doc.getPage(slide);
      const content = await page.getTextContent();
      if (!stale) setText({ doc, slide, value: slideText(content.items) });
    };

    read().catch(() => {
      if (!stale) setText({ doc, slide, value: "" });
    });
    return () => {
      stale = true;
    };
  }, [doc, slide]);

  useEffect(() => {
    const canvas = canvasRef.current;
    return () => {
      if (canvas) canvas.width = canvas.height = 0;
    };
  }, [canvasRef]);

  return {
    painted: doc !== null && painted?.doc === doc && painted.slide === slide,
    text: doc !== null && text?.doc === doc && text.slide === slide ? text.value : null,
  };
}
