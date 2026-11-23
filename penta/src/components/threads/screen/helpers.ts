import { threadLimits } from "@/lib/config";
import { countCharacters } from "@/lib/threads";

export const formattingHelp =
  "Plain text with simple formatting: *emphasis*, **strong**, `code`, lists, quotes and links. No images.";

export const editRule = `You can edit for ${threadLimits.editMinutes} minutes, up to ${threadLimits.editsPerPost} times.`;

export function characterCountLabel(text: string): string {
  const count = countCharacters(text);
  if (count > threadLimits.bodyLength) return "Too long to post";
  return `${count.toLocaleString("en-US")} of ${threadLimits.bodyLength.toLocaleString("en-US")} characters`;
}
