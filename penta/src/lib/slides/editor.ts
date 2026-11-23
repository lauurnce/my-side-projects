import type { Block, DeckContent, Direction, Fill, Frame, Slide, Tone } from "./schema";

export type BlockStyle = { tone?: Tone; fill?: Fill; direction?: Direction; alt?: string };

export type EditorState = {
  content: DeckContent;
  selectedSlide: number;
  selectedBlock: string | null;
  past: DeckContent[];
  future: DeckContent[];
  mergeKey: string | null;
};

export type EditorAction =
  | { type: "addSlide"; slide: Slide; at: number }
  | { type: "deleteSlide"; index: number }
  | { type: "moveSlide"; from: number; to: number }
  | { type: "selectSlide"; index: number }
  | { type: "addBlock"; block: Block }
  | { type: "selectBlock"; blockId: string | null }
  | { type: "setFrame"; blockId: string; frame: Frame; merge: boolean }
  | { type: "setText"; blockId: string; text: string; merge: boolean }
  | { type: "setStyle"; blockId: string; style: BlockStyle }
  | { type: "deleteBlock"; blockId: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "replace"; content: DeckContent };

export type EditorDispatch = (action: EditorAction) => void;

export function createEditorState(content: DeckContent): EditorState {
  return { content, selectedSlide: 0, selectedBlock: null, past: [], future: [], mergeKey: null };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  if (action.type === "replace") return createEditorState(action.content);
  return state;
}

export function canUndo(state: EditorState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: EditorState): boolean {
  return state.future.length > 0;
}
