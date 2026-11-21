import { crc32 } from "node:zlib";

const encoder = new TextEncoder();

function join(parts: Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let position = 0;
  for (const part of parts) {
    joined.set(part, position);
    position += part.length;
  }
  return joined;
}

function pageObjects(pageNumber: number, pageObject: number): string[] {
  const text = `BT /F1 64 Tf 120 250 Td (Slide ${pageNumber}) Tj ET`;
  return [
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 960 540] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageObject + 1} 0 R >>`,
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
  ];
}

export function buildPdf(pageCount: number, paddingBytes = 0): Uint8Array {
  const firstPageObject = 4;
  const kids = Array.from({ length: pageCount }, (_, index) => `${firstPageObject + index * 2} 0 R`).join(" ");
  const bodies = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pageCount} /Kids [${kids}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...Array.from({ length: pageCount }, (_, index) => pageObjects(index + 1, firstPageObject + index * 2)).flat(),
  ];
  if (paddingBytes > 0) bodies.push(`<< /Length ${paddingBytes} >>\nstream\n${"0".repeat(paddingBytes)}\nendstream`);

  let text = "%PDF-1.4\n";
  const offsets = bodies.map((body, index) => {
    const offset = text.length;
    text += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const tableOffset = text.length;
  const rows = offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  text += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n${rows}`;
  text += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${tableOffset}\n%%EOF\n`;
  return encoder.encode(text);
}

function header(signature: number, length: number): DataView {
  const view = new DataView(new ArrayBuffer(length));
  view.setUint32(0, signature, true);
  return view;
}

function bytesOf(view: DataView): Uint8Array {
  return new Uint8Array(view.buffer);
}

export function buildZip(entryNames: string[], comment = ""): Uint8Array {
  const content = encoder.encode("<xml/>");
  const checksum = crc32(content);
  const locals: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;

  for (const entryName of entryNames) {
    const name = encoder.encode(entryName);
    const local = header(0x04034b50, 30);
    local.setUint16(4, 20, true);
    local.setUint32(14, checksum, true);
    local.setUint32(18, content.length, true);
    local.setUint32(22, content.length, true);
    local.setUint16(26, name.length, true);
    locals.push(bytesOf(local), name, content);

    const entry = header(0x02014b50, 46);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint32(16, checksum, true);
    entry.setUint32(20, content.length, true);
    entry.setUint32(24, content.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    directory.push(bytesOf(entry), name);
    offset += 30 + name.length + content.length;
  }

  const directoryBytes = join(directory);
  const commentBytes = encoder.encode(comment);
  const end = header(0x06054b50, 22);
  end.setUint16(8, entryNames.length, true);
  end.setUint16(10, entryNames.length, true);
  end.setUint32(12, directoryBytes.length, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, commentBytes.length, true);
  return join([...locals, directoryBytes, bytesOf(end), commentBytes]);
}

export const presentationEntries = ["[Content_Types].xml", "_rels/.rels", "ppt/presentation.xml", "ppt/slides/slide1.xml"];

export function buildPptx(): Uint8Array {
  return buildZip(presentationEntries);
}
