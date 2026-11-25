import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const guestActions = ["signUp", "logIn", "signOut"];

function actionFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return actionFiles(path);
    return entry.name.endsWith("actions.ts") ? [path] : [];
  });
}

const actions = actionFiles("src/app").flatMap((file) =>
  readFileSync(file, "utf8")
    .split("\nexport async function ")
    .slice(1)
    .map((body) => ({ file, name: body.slice(0, body.indexOf("(")), body })),
);

describe("server actions", () => {
  it("finds the action files", () => {
    expect(actions.length).toBeGreaterThan(40);
  });

  it.each(actions.filter((action) => !guestActions.includes(action.name)))(
    "$name in $file checks the session itself",
    ({ body }) => {
      expect(body).toMatch(/requireUser\(|requireRole\(|getCurrentUser\(/);
    },
  );
});
