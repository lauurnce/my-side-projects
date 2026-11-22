import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database.types";
import { loadDeckFinished, missingSlides } from "@/lib/deck-progress";

function fakeClient(answer: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(answer);
  return { rpc, supabase: { rpc } as unknown as SupabaseClient<Database> };
}

describe("missingSlides", () => {
  it("lists the slides not seen yet in order", () => {
    expect(missingSlides([1, 3, 5], 6)).toEqual([2, 4, 6]);
  });

  it("lists every slide when none was seen", () => {
    expect(missingSlides([], 3)).toEqual([1, 2, 3]);
  });

  it("is empty when every slide was seen", () => {
    expect(missingSlides([3, 1, 2], 3)).toEqual([]);
  });

  it("ignores duplicate and out of range values", () => {
    expect(missingSlides([2, 2, 0, -1, 9, 2.5, Number.NaN], 4)).toEqual([1, 3, 4]);
  });

  it("is empty for a deck with no slides", () => {
    expect(missingSlides([1, 2], 0)).toEqual([]);
    expect(missingSlides([1, 2], -3)).toEqual([]);
  });
});

describe("loadDeckFinished", () => {
  it("asks the database about the deck and the student", async () => {
    const { rpc, supabase } = fakeClient({ data: true, error: null });
    expect(await loadDeckFinished(supabase, "deck-1", "student-1")).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("deck_finished", { target_deck: "deck-1", target_student: "student-1" });
  });

  it("is false when the database says false", async () => {
    const { supabase } = fakeClient({ data: false, error: null });
    expect(await loadDeckFinished(supabase, "deck-1", "student-1")).toBe(false);
  });

  it("is false when the database answers nothing", async () => {
    const { supabase } = fakeClient({ data: null, error: null });
    expect(await loadDeckFinished(supabase, "deck-1", "student-1")).toBe(false);
  });

  it("is false on an error", async () => {
    const { supabase } = fakeClient({ data: null, error: { message: "permission denied" } });
    expect(await loadDeckFinished(supabase, "deck-1", "student-1")).toBe(false);
  });

  it("is false for anything that is not exactly true", async () => {
    const { supabase } = fakeClient({ data: "true", error: null });
    expect(await loadDeckFinished(supabase, "deck-1", "student-1")).toBe(false);
  });
});
