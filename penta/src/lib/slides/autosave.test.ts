import { describe, expect, it } from "vitest";
import { slideLimits } from "@/lib/config";
import { createSaveState, nextSave, retryDelay, saveIndicator, saveReducer, type SaveAnswer, type SaveState } from "./autosave";
import type { DeckContent } from "./schema";

function deck(text: string): DeckContent {
  return { v: 1, slides: [{ id: "slide001", blocks: [{ id: "title001", type: "title", x: 0, y: 0, w: 400, h: 100, text, tone: "ink" }] }] };
}

const first = deck("One");
const second = deck("Two");
const third = deck("Three");
let made = 0;
const makeId = () => `save-${(made += 1)}`;

function send(state: SaveState, current: DeckContent): SaveState {
  const pending = nextSave(state, current, makeId);
  if (!pending) throw new Error("nothing to send");
  return saveReducer(state, { type: "sent", pending });
}

function answer(state: SaveState, reply: SaveAnswer): SaveState {
  return saveReducer(state, { type: "answered", answer: reply });
}

describe("autosave", () => {
  it("has nothing to send while the content is the saved one", () => {
    const state = createSaveState(first, 4);
    expect(nextSave(state, first, makeId)).toBeNull();
    expect(saveIndicator(state, first)).toBe("saved");
    expect(saveIndicator(state, second)).toBe("unsaved");
  });

  it("adopts the new version and shows Saved only when nothing changed meanwhile", () => {
    const sending = send(createSaveState(first, 4), second);
    expect(saveIndicator(sending, second)).toBe("saving");
    expect(nextSave(sending, third, makeId)).toBeNull();

    const saved = answer(sending, { status: "saved", version: 5 });
    expect(saved).toMatchObject({ version: 5, saved: second, sending: null, failures: 0 });
    expect(saveIndicator(saved, second)).toBe("saved");
    expect(saveIndicator(saved, third)).toBe("unsaved");
    expect(nextSave(saved, third, makeId)).toMatchObject({ content: third });
  });

  it("sends the same content with the same id again after a failure, before any newer content", () => {
    const sending = send(createSaveState(first, 4), second);
    const sentId = sending.sending!.saveId;
    const failed = answer(sending, { status: "failed" });
    expect(failed).toMatchObject({ failures: 1, version: 4, saved: first });
    expect(saveIndicator(failed, third)).toBe("not_saved");
    expect(nextSave(failed, third, makeId)).toEqual({ content: second, saveId: sentId });

    const again = answer(send(failed, third), { status: "saved", version: 5 });
    expect(again).toMatchObject({ version: 5, saved: second, retry: null, failures: 0 });
    expect(nextSave(again, third, makeId)).toMatchObject({ content: third });
  });

  it("waits longer after each failure, up to the last step", () => {
    const steps = slideLimits.saveRetryMilliseconds;
    expect(retryDelay(0)).toBe(0);
    expect(retryDelay(1)).toBe(steps[0]);
    expect(retryDelay(2)).toBe(steps[1]);
    expect(retryDelay(99)).toBe(steps[steps.length - 1]);
  });

  it("keeps trying while signed out and says so", () => {
    const out = answer(send(createSaveState(first, 4), second), { status: "signed_out" });
    expect(saveIndicator(out, second)).toBe("signed_out");
    expect(nextSave(out, second, makeId)).toMatchObject({ content: second });
    const back = answer(send(out, second), { status: "saved", version: 5 });
    expect(back.signedOut).toBe(false);
    expect(saveIndicator(back, second)).toBe("saved");
  });

  it("stops on a conflict until the teacher keeps their copy", () => {
    const conflict = answer(send(createSaveState(first, 4), second), { status: "conflict", version: 9 });
    expect(saveIndicator(conflict, second)).toBe("conflict");
    expect(nextSave(conflict, third, makeId)).toBeNull();
    expect(saveReducer(conflict, { type: "edited" })).toBe(conflict);

    const kept = saveReducer(conflict, { type: "keepMine" });
    expect(kept).toMatchObject({ halt: null, version: 9, remoteVersion: null });
    expect(nextSave(kept, third, makeId)).toMatchObject({ content: third });
  });

  it("stops while the deck is live and resumes when asked", () => {
    const live = answer(send(createSaveState(first, 4), second), { status: "live", sessionId: "session-1" });
    expect(live).toMatchObject({ halt: "live", liveSessionId: "session-1" });
    expect(nextSave(live, second, makeId)).toBeNull();
    const resumed = saveReducer(live, { type: "resume" });
    expect(resumed).toMatchObject({ halt: null, liveSessionId: null });
    expect(nextSave(resumed, second, makeId)).toMatchObject({ content: second });
  });

  it.each(["too_large", "missing_image", "refused"] as const)("stops on %s until the content is edited", (status) => {
    const halted = answer(send(createSaveState(first, 4), second), { status });
    expect(saveIndicator(halted, second)).toBe(status);
    expect(nextSave(halted, second, makeId)).toBeNull();
    const edited = saveReducer(halted, { type: "edited" });
    expect(edited.halt).toBeNull();
    expect(nextSave(edited, third, makeId)).toMatchObject({ content: third });
  });

  it("ignores an answer when nothing was sent and a second send while one is out", () => {
    const idle = createSaveState(first, 4);
    expect(answer(idle, { status: "saved", version: 5 })).toBe(idle);
    const sending = send(idle, second);
    expect(saveReducer(sending, { type: "sent", pending: { content: third, saveId: "other" } })).toBe(sending);
  });
});
