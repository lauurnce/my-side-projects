export type IndexPillProps = {
  index: string;
  name: string;
  sub?: string;
  description: string;
  active: boolean;
  onSelect: () => void;
};

export function IndexPill({ index, name, onSelect }: IndexPillProps) {
  return (
    <button type="button" onClick={onSelect}>
      {index} {name}
    </button>
  );
}
