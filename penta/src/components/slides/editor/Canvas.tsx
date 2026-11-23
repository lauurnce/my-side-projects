"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { blockTextClass, SlideRenderer } from "@/components/slides/SlideRenderer";
import { slideLimits } from "@/lib/config";
import type { EditorDispatch } from "@/lib/slides/editor";
import { isArrowKey, keyFrame, moveFrame, resizeFrame, sameFrame, type Corner } from "@/lib/slides/geometry";
import { hasText, type Block, type Frame, type Slide, type TextBlock } from "@/lib/slides/schema";
import styles from "./canvas.module.css";

export type CanvasProps = {
  slide: Slide;
  selectedBlock: string | null;
  imageBase: string;
  dispatch: EditorDispatch;
};

type Draft = { blockId: string; frame: Frame };

type Drag = {
  pointerId: number;
  blockId: string;
  corner: Corner | null;
  startX: number;
  startY: number;
  start: Frame;
  scale: number;
  frame: Frame;
  moved: boolean;
};

const fallbackWidth = 960;
const dragThreshold = 3;
const labelLength = 40;
const corners: Corner[] = ["nw", "ne", "sw", "se"];
const typeNames: Record<Block["type"], string> = { title: "Title", text: "Text", image: "Image", box: "Box", arrow: "Arrow" };
const textLimits: Record<TextBlock["type"], number> = {
  title: slideLimits.titleLength,
  text: slideLimits.textLength,
  box: slideLimits.boxLength,
};

function frameOf(block: Block): Frame {
  return { x: block.x, y: block.y, w: block.w, h: block.h };
}

function blockLabel(block: Block): string {
  const name = `${typeNames[block.type]} block`;
  const words = hasText(block) ? block.text : block.type === "image" ? block.alt : "";
  const short = words.replace(/\s+/g, " ").trim().slice(0, labelLength).trim();
  return short ? `${name}: ${short}` : name;
}

function screenBox(frame: Frame, scale: number) {
  return { left: frame.x * scale, top: frame.y * scale, width: frame.w * scale, height: frame.h * scale };
}

function withDraft(slide: Slide, draft: Draft | null): Slide {
  if (!draft) return slide;
  return { ...slide, blocks: slide.blocks.map((block) => (block.id === draft.blockId ? { ...block, ...draft.frame } : block)) };
}

function cleanText(block: TextBlock, value: string): string {
  return block.type === "text" ? value : value.replace(/\r\n|\r|\n/g, " ");
}

function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return width > 0 ? width : fallbackWidth;
}

export function Canvas({ slide, selectedBlock, imageBase, dispatch }: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const drag = useRef<Drag | null>(null);
  const pointerDown = useRef(false);
  const typed = useRef(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const width = useWidth(canvasRef);
  const scale = width / slideLimits.width;
  const shown = useMemo(() => withDraft(slide, draft), [slide, draft]);
  const selected = shown.blocks.find((block) => block.id === selectedBlock) ?? null;
  const edited = shown.blocks.find((block): block is TextBlock => block.id === editing && hasText(block)) ?? null;
  const editedId = edited?.id ?? null;

  useEffect(() => {
    const field = fieldRef.current;
    if (!editedId || !field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, [editedId]);

  const setButton = (blockId: string) => (element: HTMLButtonElement | null) => {
    if (element) buttons.current.set(blockId, element);
    else buttons.current.delete(blockId);
  };

  const pointerScale = () => {
    const measured = canvasRef.current?.getBoundingClientRect().width ?? 0;
    return (measured > 0 ? measured : width) / slideLimits.width;
  };

  const startDrag = (event: PointerEvent<HTMLElement>, block: Block, corner: Corner | null) => {
    if (event.button !== 0) return;
    pointerDown.current = true;
    buttons.current.get(block.id)?.focus();
    if (block.id !== selectedBlock) dispatch({ type: "selectBlock", blockId: block.id });
    const start = frameOf(block);
    drag.current = {
      pointerId: event.pointerId,
      blockId: block.id,
      corner,
      startX: event.clientX,
      startY: event.clientY,
      start,
      scale: pointerScale(),
      frame: start,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    if (!active.moved && Math.hypot(dx, dy) < dragThreshold) return;
    active.moved = true;
    active.frame = active.corner
      ? resizeFrame(active.start, active.corner, dx / active.scale, dy / active.scale)
      : moveFrame(active.start, dx / active.scale, dy / active.scale);
    setDraft({ blockId: active.blockId, frame: active.frame });
  };

  const dropDrag = () => {
    pointerDown.current = false;
    drag.current = null;
    setDraft(null);
  };

  const endDrag = (event: PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    dropDrag();
    if (sameFrame(active.frame, active.start)) return;
    dispatch({ type: "setFrame", blockId: active.blockId, frame: active.frame, merge: false });
  };

  const cancelDrag = (event: PointerEvent<HTMLElement>) => {
    if (drag.current && drag.current.pointerId !== event.pointerId) return;
    dropDrag();
  };

  const clearSelection = (event: PointerEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    dispatch({ type: "selectBlock", blockId: null });
  };

  const startEditing = (block: Block) => {
    if (!hasText(block)) return;
    typed.current = false;
    if (block.id !== selectedBlock) dispatch({ type: "selectBlock", blockId: block.id });
    setEditing(block.id);
  };

  const focusBlock = (block: Block) => {
    if (pointerDown.current || block.id === selectedBlock) return;
    dispatch({ type: "selectBlock", blockId: block.id });
  };

  const pressHistoryKey = (event: KeyboardEvent<HTMLElement>): boolean => {
    if (!event.ctrlKey && !event.metaKey) return false;
    const key = event.key.toLowerCase();
    const redo = (key === "z" && event.shiftKey) || (key === "y" && event.ctrlKey);
    if (redo || key === "z") {
      event.preventDefault();
      dispatch({ type: redo ? "redo" : "undo" });
    }
    return true;
  };

  const pressArrow = (event: KeyboardEvent<HTMLElement>, block: Block) => {
    event.preventDefault();
    const frame = keyFrame(frameOf(block), event.key, { fine: event.shiftKey, resize: event.altKey });
    if (sameFrame(frame, frameOf(block))) return;
    dispatch({ type: "setFrame", blockId: block.id, frame, merge: event.repeat });
  };

  const pressKey = (event: KeyboardEvent<HTMLButtonElement>, block: Block) => {
    if (event.nativeEvent.isComposing || pressHistoryKey(event)) return;
    if (isArrowKey(event.key)) return pressArrow(event, block);
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      dispatch({ type: "deleteBlock", blockId: block.id });
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      dispatch({ type: "selectBlock", blockId: null });
      return;
    }
    if (event.key !== "Enter" || !hasText(block)) return;
    event.preventDefault();
    if (!event.repeat) startEditing(block);
  };

  const leaveField = (event: KeyboardEvent<HTMLTextAreaElement>, block: TextBlock) => {
    event.preventDefault();
    setEditing(null);
    buttons.current.get(block.id)?.focus();
  };

  const pressFieldKey = (event: KeyboardEvent<HTMLTextAreaElement>, block: TextBlock) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") return leaveField(event, block);
    if (event.key === "Enter" && block.type !== "text") leaveField(event, block);
  };

  const changeText = (event: ChangeEvent<HTMLTextAreaElement>, block: TextBlock) => {
    const text = cleanText(block, event.target.value);
    dispatch({ type: "setText", blockId: block.id, text, merge: typed.current });
    typed.current = true;
  };

  return (
    <div ref={canvasRef} className={styles.canvas} role="group" aria-label="Slide canvas">
      <div className={styles.surface}>
        <SlideRenderer slide={shown} width={width} imageBase={imageBase} editingBlockId={editedId} />
      </div>
      <div
        className={styles.overlay}
        onPointerDown={clearSelection}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={cancelDrag}
      >
        {shown.blocks.map((block) => (
          <button
            key={block.id}
            ref={setButton(block.id)}
            type="button"
            className={styles.block}
            style={screenBox(block, scale)}
            aria-label={blockLabel(block)}
            aria-pressed={block.id === selectedBlock}
            onPointerDown={(event) => startDrag(event, block, null)}
            onDoubleClick={() => startEditing(block)}
            onFocus={() => focusBlock(block)}
            onKeyDown={(event) => pressKey(event, block)}
          />
        ))}
        {selected ? (
          <div className={styles.selection} style={screenBox(selected, scale)} aria-hidden="true">
            {corners.map((corner) => (
              <span
                key={corner}
                className={`${styles.handle} ${styles[corner]}`}
                data-corner={corner}
                onPointerDown={(event) => startDrag(event, selected, corner)}
                onMouseDown={(event) => event.preventDefault()}
              />
            ))}
          </div>
        ) : null}
      </div>
      {edited ? (
        <div className={styles.editLayer} style={{ transform: `scale(${scale})` }}>
          <textarea
            ref={fieldRef}
            className={`${blockTextClass(edited)} ${styles.field}`}
            style={{ left: edited.x, top: edited.y, width: edited.w, height: edited.h }}
            aria-label={`${typeNames[edited.type]} text`}
            data-tone={"tone" in edited ? edited.tone : undefined}
            data-fill={"fill" in edited ? edited.fill : undefined}
            value={edited.text}
            maxLength={textLimits[edited.type]}
            rows={1}
            spellCheck={false}
            onChange={(event) => changeText(event, edited)}
            onKeyDown={(event) => pressFieldKey(event, edited)}
            onBlur={() => setEditing(null)}
          />
        </div>
      ) : null}
    </div>
  );
}
