import type { ReactNode } from "react";

export type BarcodeProps = {
  caption?: ReactNode;
};

export function Barcode({ caption }: BarcodeProps) {
  return <div>{caption}</div>;
}
