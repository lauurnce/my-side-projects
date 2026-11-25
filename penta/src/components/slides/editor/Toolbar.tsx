import { useId, useState, type ChangeEvent } from "react";
import { slideLimits } from "@/lib/config";
import type { BlockStyle, EditorDispatch } from "@/lib/slides/editor";
import { newId } from "@/lib/slides/ids";
import { newBlock, newImageBlock } from "@/lib/slides/layouts";
import type { Block, BlockType, Direction, Fill, Slide, Tone } from "@/lib/slides/schema";
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

type Option<Value extends string> = { value: Value; label: string; disabled?: boolean };

const addable: Option<Exclude<BlockType, "image">>[] = [
  { value: "title", label: "Title" },
  { value: "text", label: "Text" },
  { value: "box", label: "Box" },
  { value: "arrow", label: "Arrow" },
];

const toneOptions: Option<Tone>[] = [
  { value: "ink", label: "Ink" },
  { value: "maroon", label: "Maroon" },
];

const fillOptions: Option<Fill>[] = [
  { value: "none", label: "None" },
  { value: "ink", label: "Ink" },
  { value: "parchment", label: "Parchment" },
  { value: "cream", label: "Cream" },
  { value: "maroon", label: "Maroon" },
  { value: "gold", label: "Gold" },
];

const directionOptions: Option<Direction>[] = [
  { value: "right", label: "Right" },
  { value: "left", label: "Left" },
  { value: "up", label: "Up" },
  { value: "down", label: "Down" },
];

const blockNames: Record<BlockType, string> = {
  title: "Title",
  text: "Text",
  image: "Image",
  box: "Box",
  arrow: "Arrow",
};

type OptionGroupProps<Value extends string> = {
  label: string;
  options: Option<Value>[];
  value: Value;
  onChoose: (value: Value) => void;
};

function OptionGroup<Value extends string>({ label, options, value, onChoose }: OptionGroupProps<Value>) {
  return (
    <div className={styles.group} role="group" aria-label={label}>
      <span className={styles.label} aria-hidden="true">
        {label}
      </span>
      <div className={styles.segments}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.segment}
            aria-pressed={option.value === value}
            disabled={option.disabled}
            onClick={() => onChoose(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

type ImageButtonProps = {
  disabled: boolean;
  dispatch: EditorDispatch;
  onPickImage: PickImage;
};

function ImageButton({ disabled, dispatch, onPickImage }: ImageButtonProps) {
  const [pending, setPending] = useState(false);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    setPending(true);
    try {
      const name = await onPickImage(file);
      if (name) dispatch({ type: "addBlock", block: newImageBlock(name, newId) });
    } finally {
      input.value = "";
      setPending(false);
    }
  }

  return (
    <label className={styles.file} data-disabled={disabled || pending}>
      <input
        className={`visually-hidden ${styles.fileInput}`}
        type="file"
        aria-label="Image"
        accept="image/png,image/jpeg,image/webp"
        disabled={disabled || pending}
        onChange={choose}
      />
      <span>{pending ? "Adding image" : "Image"}</span>
    </label>
  );
}

type DescriptionProps = {
  value: string;
  onChange: (alt: string) => void;
};

function Description({ value, onChange }: DescriptionProps) {
  const inputId = useId();

  return (
    <div className={styles.group}>
      <label className={styles.label} htmlFor={inputId}>
        Description
      </label>
      <input
        id={inputId}
        className={styles.input}
        type="text"
        value={value}
        maxLength={slideLimits.altLength}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function fillChoices(slide: Slide, selected: Block): Option<Fill>[] {
  const goldTaken = slide.blocks.some((block) => block.type === "box" && block.fill === "gold" && block.id !== selected.id);
  return fillOptions.map((option) => (option.value === "gold" ? { ...option, disabled: goldTaken } : option));
}

type BlockControlsProps = {
  slide: Slide;
  block: Block;
  dispatch: EditorDispatch;
};

function BlockControls({ slide, block, dispatch }: BlockControlsProps) {
  const setStyle = (style: BlockStyle) => dispatch({ type: "setStyle", blockId: block.id, style });

  return (
    <div className={styles.row} role="group" aria-label={`${blockNames[block.type]} block`}>
      <span className={styles.kind}>{blockNames[block.type]}</span>
      {block.type === "title" || block.type === "text" ? (
        <OptionGroup label="Tone" options={toneOptions} value={block.tone} onChoose={(tone) => setStyle({ tone })} />
      ) : null}
      {block.type === "box" ? (
        <OptionGroup label="Fill" options={fillChoices(slide, block)} value={block.fill} onChoose={(fill) => setStyle({ fill })} />
      ) : null}
      {block.type === "arrow" ? (
        <OptionGroup label="Direction" options={directionOptions} value={block.direction} onChoose={(direction) => setStyle({ direction })} />
      ) : null}
      {block.type === "image" ? <Description value={block.alt} onChange={(alt) => setStyle({ alt })} /> : null}
      <button type="button" className={`${styles.button} ${styles.end}`} onClick={() => dispatch({ type: "deleteBlock", blockId: block.id })}>
        Delete block
      </button>
    </div>
  );
}

export function Toolbar({ slide, selectedBlock, canUndo, canRedo, dispatch, onPickImage }: ToolbarProps) {
  const full = slide.blocks.length >= slideLimits.blocksPerSlide;

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Slide tools">
      <div className={styles.row}>
        <div className={styles.group} role="group" aria-label="Add a block">
          <span className={styles.label} aria-hidden="true">
            Add
          </span>
          <div className={styles.buttons}>
            {addable.map((option) => (
              <button
                key={option.value}
                type="button"
                className={styles.button}
                disabled={full}
                onClick={() => dispatch({ type: "addBlock", block: newBlock(option.value, newId) })}
              >
                {option.label}
              </button>
            ))}
            <ImageButton disabled={full} dispatch={dispatch} onPickImage={onPickImage} />
          </div>
        </div>
        <div className={`${styles.buttons} ${styles.end}`}>
          <button type="button" className={styles.button} disabled={!canUndo} onClick={() => dispatch({ type: "undo" })}>
            Undo
          </button>
          <button type="button" className={styles.button} disabled={!canRedo} onClick={() => dispatch({ type: "redo" })}>
            Redo
          </button>
        </div>
      </div>
      {full ? (
        <p className={styles.hint}>This slide has {slideLimits.blocksPerSlide} blocks, the most a slide can hold.</p>
      ) : null}
      {selectedBlock ? (
        <BlockControls slide={slide} block={selectedBlock} dispatch={dispatch} />
      ) : (
        <p className={styles.hint}>Select a block to change it.</p>
      )}
    </div>
  );
}
