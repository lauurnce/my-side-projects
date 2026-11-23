import type { EditorDispatch } from "@/lib/slides/editor";
import type { Block, Slide } from "@/lib/slides/schema";
import styles from "./toolbar.module.css";

export type PickImage = (file: File) => Promise<string | null>;

export type ToolbarProps = {
  slide: Slide;
  selectedBlock: Block | null;
  canUndo: boolean;
  canRedo: boolean;
  dispatch: EditorDispatch;
  onPickImage: PickImage;
};

export function Toolbar({ canUndo, canRedo, dispatch }: ToolbarProps) {
  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Slide tools">
      <button type="button" disabled={!canUndo} onClick={() => dispatch({ type: "undo" })}>
        Undo
      </button>
      <button type="button" disabled={!canRedo} onClick={() => dispatch({ type: "redo" })}>
        Redo
      </button>
    </div>
  );
}
