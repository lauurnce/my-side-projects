import { describe, expect, it } from "vitest";
import { admin } from "./helpers";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Case = [label: string, key: Json, answer: Json, expected: boolean];

async function grade(kind: string, key: Json, answer: Json): Promise<boolean | null> {
  const { data, error } = await admin.rpc("grade_check", { question_kind: kind, key_answers: key, answer });
  if (error) throw error;
  return data;
}

const multipleChoice: Case[] = [
  ["the chosen index equals the key", 2, 2, true],
  ["another index", 2, 1, false],
  ["index zero is a real answer", 0, 0, true],
  ["a list that contains the key", 2, [0, 1, 2], false],
  ["the index as text", 2, "2", false],
  ["a boolean", 1, true, false],
  ["no answer", 2, null, false],
];

const trueFalse: Case[] = [
  ["true equals true", true, true, true],
  ["false equals false", false, false, true],
  ["the wrong side", true, false, false],
  ["the word true", true, "true", false],
  ["the number one", true, 1, false],
  ["no answer", false, null, false],
];

const identification: Case[] = [
  ["the exact answer", ["Manila"], "Manila", true],
  ["another case", ["Manila"], "mAnILA", true],
  ["spaces around", ["Manila"], "   Manila  ", true],
  ["extra inner spaces", ["City of Manila"], "city   of\tmanila", true],
  ["a listed alternative", ["Manila", "City of Manila", "Maynila"], "maynila", true],
  ["full width letters", ["Manila"], "ｍａｎｉｌａ", true],
  ["a pasted zero width space", ["Manila"], "Mani​la", true],
  ["an ideographic space around", ["Manila"], "　Manila　", true],
  ["a wrong answer", ["Manila"], "Quezon City", false],
  ["part of the answer", ["City of Manila"], "Manila", false],
  ["an empty answer", ["Manila"], "", false],
  ["only spaces", ["Manila"], "    ", false],
  ["only zero width characters", ["Manila"], "​​", false],
  ["a list as the answer", ["Manila"], ["Manila"], false],
  ["a number as the answer", ["42"], 42, false],
  ["a number typed as text", ["42"], " 42 ", true],
  ["no answer", ["Manila"], null, false],
];

describe.each([
  ["mcq", multipleChoice],
  ["tf", trueFalse],
  ["ident", identification],
])("grading %s", (kind, cases) => {
  it.each(cases)("%s", async (_label, key, answer, expected) => {
    expect(await grade(kind, key, answer)).toBe(expected);
  });
});

describe("grading edges", () => {
  it("marks an unknown kind wrong", async () => {
    expect(await grade("essay", ["x"], "x")).toBe(false);
  });

  it("marks everything wrong when the key is missing", async () => {
    expect(await grade("tf", null, true)).toBe(false);
    expect(await grade("ident", null, "Manila")).toBe(false);
  });

  it("never matches a key of the wrong shape", async () => {
    expect(await grade("ident", "Manila", "Manila")).toBe(false);
    expect(await grade("mcq", [1], 1)).toBe(false);
    expect(await grade("tf", "true", true)).toBe(false);
  });
});
