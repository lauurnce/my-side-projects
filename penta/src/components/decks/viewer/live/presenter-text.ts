import type { LiveLink } from "@/lib/live";

const manilaTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

export function formatManilaTime(milliseconds: number): string {
  return manilaTime.format(milliseconds).replace(/\s/g, " ");
}

export function followerSentence(followers: number | null): string {
  if (followers === null) return "Count unavailable";
  if (followers <= 0) return "No students following yet";
  if (followers === 1) return "1 student following";
  return `${followers} students following`;
}

export function connectionSentence(link: LiveLink, lastReadAt: number): string | null {
  if (link === "catching_up") return "Reconnecting. Students still follow, a few seconds behind.";
  if (link === "out_of_touch") {
    return `No contact with the server since ${formatManilaTime(lastReadAt)}. Students may be behind.`;
  }
  return null;
}
