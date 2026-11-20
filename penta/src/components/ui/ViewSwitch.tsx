export type ViewOption = {
  value: string;
  label: string;
};

export type ViewSwitchProps = {
  label: string;
  options: readonly [ViewOption, ViewOption];
  value: string;
  onChange: (value: string) => void;
};

export function ViewSwitch({ label, options, value, onChange }: ViewSwitchProps) {
  return (
    <div role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
