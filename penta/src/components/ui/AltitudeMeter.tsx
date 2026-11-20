export type AltitudeMeterProps = {
  meters: number;
  note?: string;
};

export function AltitudeMeter({ meters }: AltitudeMeterProps) {
  return <p>{meters} m</p>;
}
