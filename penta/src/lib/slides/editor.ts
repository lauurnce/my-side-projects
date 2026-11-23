import { slideLimits } from "@/lib/config";
import { clampFrame } from "./geometry";
import { deckContentSchema, hasText } from "./schema";
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

type Selection = { selectedSlide: number; selectedBlock: string | null };
type Step = { selection?: Selection; mergeKey?: string; continues?: boolean };
type BlockChange = (block: Block) => Block;

export function createEditorState(content: DeckContent): EditorState {
  return { content, selectedSlide: 0, selectedBlock: null, past: [], future: [], mergeKey: null };
}

export function canUndo(state: EditorState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: EditorState): boolean {
  return state.future.length > 0;
}

function isValid(content: DeckContent): boolean {
  return deckContentSchema.safeParse(content).success;
}

function isIndex(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < length;
}

function repairSelection(content: DeckContent, selection: Selection): Selection {
  const last = content.slides.length - 1;
  const selectedSlide = Number.isInteger(selection.selectedSlide) ? Math.min(Math.max(selection.selectedSlide, 0), last) : 0;
  const isOnSlide = content.slides[selectedSlide].blocks.some((block) => block.id === selection.selectedBlock);
  return { selectedSlide, selectedBlock: isOnSlide ? selection.selectedBlock : null };
}

function select(state: EditorState, selection: Selection): EditorState {
  const next = repairSelection(state.content, selection);
  const isSame = next.selectedSlide === state.selectedSlide && next.selectedBlock === state.selectedBlock;
  if (isSame && state.mergeKey === null) return state;
  return { ...state, ...next, mergeKey: null };
}

function pushPast(state: EditorState): DeckContent[] {
  return [...state.past, state.content].slice(-slideLimits.historySteps);
}

function commit(state: EditorState, content: DeckContent, step: Step = {}): EditorState {
  if (!isValid(content)) return state;
  return {
    content,
    ...repairSelection(content, step.selection ?? state),
    past: step.continues ? state.past : pushPast(state),
    future: [],
    mergeKey: step.mergeKey ?? null,
  };
}

function withSlides(state: EditorState, slides: Slide[]): DeckContent {
  return { ...state.content, slides };
}

function withBlocks(state: EditorState, blocks: Block[]): DeckContent {
  const slides = state.content.slides.map((slide, index) => (index === state.selectedSlide ? { ...slide, blocks } : slide));
  return withSlides(state, slides);
}

function selectedBlocks(state: EditorState): Block[] {
  return state.content.slides[state.selectedSlide].blocks;
}

function changeBlock(state: EditorState, blockId: string, change: BlockChange, step: Step = {}): EditorState {
  const blocks = selectedBlocks(state);
  const current = blocks.find((block) => block.id === blockId);
  if (!current) return state;
  const changed = change(current);
  if (changed === current) return state;
  return commit(state, withBlocks(state, blocks.map((block) => (block === current ? changed : block))), step);
}

function mergeStep(state: EditorState, action: { type: string; blockId: string; merge: boolean }): Step {
  const mergeKey = `${action.type}:${action.blockId}`;
  return { mergeKey, continues: action.merge && state.mergeKey === mergeKey };
}

function reframe(block: Block, frame: Frame): Block {
  const next = clampFrame(frame);
  const isSame = next.x === block.x && next.y === block.y && next.w === block.w && next.h === block.h;
  return isSame ? block : { ...block, ...next };
}

function retext(block: Block, text: string): Block {
  if (!hasText(block) || block.text === text) return block;
  return { ...block, text };
}

function restyle(block: Block, style: BlockStyle): Block {
  if (block.type === "title" || block.type === "text") {
    return style.tone === undefined || style.tone === block.tone ? block : { ...block, tone: style.tone };
  }
  if (block.type === "box") {
    return style.fill === undefined || style.fill === block.fill ? block : { ...block, fill: style.fill };
  }
  if (block.type === "arrow") {
    return style.direction === undefined || style.direction === block.direction ? block : { ...block, direction: style.direction };
  }
  return style.alt === undefined || style.alt === block.alt ? block : { ...block, alt: style.alt };
}

function addSlide(state: EditorState, slide: Slide, at: number): EditorState {
  if (!Number.isInteger(at)) return state;
  const slides = state.content.slides;
  const index = Math.min(Math.max(at, 0), slides.length);
  const next = [...slides.slice(0, index), slide, ...slides.slice(index)];
  return commit(state, withSlides(state, next), { selection: { selectedSlide: index, selectedBlock: null } });
}

function deleteSlide(state: EditorState, index: number): EditorState {
  const slides = state.content.slides;
  if (!isIndex(index, slides.length)) return state;
  const next = slides.filter((_, position) => position !== index);
  return commit(state, withSlides(state, next), { selection: { selectedSlide: index, selectedBlock: state.selectedBlock } });
}

function moveSlide(state: EditorState, from: number, to: number): EditorState {
  const slides = state.content.slides;
  if (from === to || !isIndex(from, slides.length) || !isIndex(to, slides.length)) return state;
  const rest = slides.filter((_, position) => position !== from);
  const next = [...rest.slice(0, to), slides[from], ...rest.slice(to)];
  const selectedSlide = next.indexOf(slides[state.selectedSlide]);
  return commit(state, withSlides(state, next), { selection: { selectedSlide, selectedBlock: state.selectedBlock } });
}

function selectSlide(state: EditorState, index: number): EditorState {
  if (!isIndex(index, state.content.slides.length)) return state;
  return select(state, { selectedSlide: index, selectedBlock: null });
}

function selectBlock(state: EditorState, blockId: string | null): EditorState {
  const isKnown = blockId === null || selectedBlocks(state).some((block) => block.id === blockId);
  if (!isKnown) return state;
  return select(state, { selectedSlide: state.selectedSlide, selectedBlock: blockId });
}

function addBlock(state: EditorState, block: Block): EditorState {
  const content = withBlocks(state, [...selectedBlocks(state), block]);
  return commit(state, content, { selection: { selectedSlide: state.selectedSlide, selectedBlock: block.id } });
}

function deleteBlock(state: EditorState, blockId: string): EditorState {
  const blocks = selectedBlocks(state);
  const rest = blocks.filter((block) => block.id !== blockId);
  if (rest.length === blocks.length) return state;
  return commit(state, withBlocks(state, rest));
}

function undo(state: EditorState): EditorState {
  const content = state.past.at(-1);
  if (!content) return state;
  return {
    content,
    ...repairSelection(content, state),
    past: state.past.slice(0, -1),
    future: [...state.future, state.content],
    mergeKey: null,
  };
}

function redo(state: EditorState): EditorState {
  const content = state.future.at(-1);
  if (!content) return state;
  return {
    content,
    ...repairSelection(content, state),
    past: pushPast(state),
    future: state.future.slice(0, -1),
    mergeKey: null,
  };
}

function replace(state: EditorState, content: DeckContent): EditorState {
  if (!isValid(content)) return state;
  return { ...createEditorState(content), ...repairSelection(content, state) };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "addSlide":
      return addSlide(state, action.slide, action.at);
    case "deleteSlide":
      return deleteSlide(state, action.index);
    case "moveSlide":
      return moveSlide(state, action.from, action.to);
    case "selectSlide":
      return selectSlide(state, action.index);
    case "addBlock":
      return addBlock(state, action.block);
    case "selectBlock":
      return selectBlock(state, action.blockId);
    case "setFrame":
      return changeBlock(state, action.blockId, (block) => reframe(block, action.frame), mergeStep(state, action));
    case "setText":
      return changeBlock(state, action.blockId, (block) => retext(block, action.text), mergeStep(state, action));
    case "setStyle":
      return changeBlock(state, action.blockId, (block) => restyle(block, action.style));
    case "deleteBlock":
      return deleteBlock(state, action.blockId);
    case "undo":
      return undo(state);
    case "redo":
      return redo(state);
    case "replace":
      return replace(state, action.content);
    default:
      return state;
  }
}
