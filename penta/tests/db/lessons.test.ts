import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addLesson,
  addModule,
  anon,
  checkFailed,
  countLessons,
  createRouteWorld,
  foreignKeyFailed,
  limitReached,
  markDone,
  readLesson,
  refused,
  removeCreatedUsers,
} from "./helpers";

type Lesson = Awaited<ReturnType<typeof readLesson>>;

let world: Awaited<ReturnType<typeof createRouteWorld>>;
let shared: Awaited<ReturnType<typeof addModule>>;
let draft: Lesson;
let published: Lesson;

function draftOf(moduleId: string, extra: Partial<Lesson> = {}) {
  return { module_id: moduleId, title: "Roles and privileges", body_md: "Grant the least you can.", est_minutes: 15, ...extra };
}

function expectWithinAMinuteOfNow(timestamp: string | null) {
  expect(timestamp).not.toBeNull();
  expect(Math.abs(Date.now() - new Date(timestamp!).getTime())).toBeLessThan(60_000);
}

async function freshModule() {
  return addModule(world.classroom.id, `Module ${randomUUID().slice(0, 8)}`);
}

async function expectSharedLessonsUnchanged() {
  expect(await readLesson(draft.id)).toEqual(draft);
  expect(await readLesson(published.id)).toEqual(published);
}

beforeAll(async () => {
  world = await createRouteWorld();
  shared = await addModule(world.classroom.id, "Week 1");
  draft = await addLesson(shared.id, "Draft lesson");
  published = await addLesson(shared.id, "Published lesson", true);
});

afterAll(removeCreatedUsers);

describe("lessons insert", () => {
  it("lessons insert: the teacher adds drafts with revision 1 and positions 1 then 2", async () => {
    const target = await freshModule();
    const first = await world.teacher.client
      .from("lessons")
      .insert(draftOf(target.id))
      .select("module_id, title, body_md, est_minutes, position, published_at, revision")
      .single();
    const second = await world.teacher.client
      .from("lessons")
      .insert({ module_id: target.id, title: "Short one" })
      .select("module_id, title, body_md, est_minutes, position, published_at, revision")
      .single();
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(first.data).toEqual({ ...draftOf(target.id), position: 1, published_at: null, revision: 1 });
    expect(second.data).toEqual({
      module_id: target.id,
      title: "Short one",
      body_md: "",
      est_minutes: 10,
      position: 2,
      published_at: null,
      revision: 1,
    });
  });

  it("lessons insert: the teacher cannot set published_at, position, revision, updated_at, created_at or id", async () => {
    const target = await freshModule();
    const chosen = [
      { published_at: new Date().toISOString() },
      { position: 5 },
      { revision: 9 },
      { updated_at: "2020-01-01T00:00:00Z" },
      { created_at: "2020-01-01T00:00:00Z" },
      { id: randomUUID() },
    ];
    for (const extra of chosen) {
      const { error } = await world.teacher.client.from("lessons").insert(draftOf(target.id, extra));
      expect(error?.code).toBe(refused);
    }
    expect(await countLessons(target.id)).toBe(0);
  });

  it("lessons insert: another teacher cannot add a lesson to the module", async () => {
    const before = await countLessons(shared.id);
    const { error } = await world.otherTeacher.client.from("lessons").insert(draftOf(shared.id));
    expect(error?.code).toBe(refused);
    expect(await countLessons(shared.id)).toBe(before);
  });

  it("lessons insert: an enrolled student, a student of another class and the outsider cannot add a lesson", async () => {
    const before = await countLessons(shared.id);
    for (const actor of [world.studentA, world.otherStudent, world.outsider]) {
      const { error } = await actor.client.from("lessons").insert(draftOf(shared.id));
      expect(error?.code).toBe(refused);
    }
    expect(await countLessons(shared.id)).toBe(before);
  });

  it("lessons insert: anon cannot add a lesson", async () => {
    const before = await countLessons(shared.id);
    const { error } = await anon.from("lessons").insert(draftOf(shared.id));
    expect(error?.code).toBe(refused);
    expect(await countLessons(shared.id)).toBe(before);
  });

  it("lessons insert: a module that does not exist is refused", async () => {
    const { error } = await world.teacher.client.from("lessons").insert(draftOf(randomUUID()));
    expect(error?.code).toBe(refused);
  });

  it("lessons insert: a body with a direction override or a control character is refused", async () => {
    const target = await freshModule();
    for (const body_md of ["Read this ‮backwards", "Ring the bell\u0007", "Delete\u007F", "Mark﻿"]) {
      const { error } = await world.teacher.client.from("lessons").insert(draftOf(target.id, { body_md }));
      expect(error?.code).toBe(checkFailed);
    }
    expect(await countLessons(target.id)).toBe(0);
  });

  it("lessons insert: a body with newlines and tabs is accepted", async () => {
    const target = await freshModule();
    const body_md = "# Backups\n\nFirst line.\r\n\n\tindented with a tab\n";
    const { data, error } = await world.teacher.client
      .from("lessons")
      .insert(draftOf(target.id, { body_md }))
      .select("body_md")
      .single();
    expect(error).toBeNull();
    expect(data?.body_md).toBe(body_md);
  });

  it("lessons insert: a body of 50,000 characters is accepted and 50,001 is refused", async () => {
    const target = await freshModule();
    const fits = await world.teacher.client
      .from("lessons")
      .insert(draftOf(target.id, { body_md: "a".repeat(50_000) }))
      .select("id")
      .single();
    expect(fits.error).toBeNull();
    expect((await readLesson(fits.data!.id)).body_md).toHaveLength(50_000);
    const tooLong = await world.teacher.client.from("lessons").insert(draftOf(target.id, { body_md: "a".repeat(50_001) }));
    expect(tooLong.error?.code).toBe(checkFailed);
    expect(await countLessons(target.id)).toBe(1);
  });

  it("lessons insert: minutes 0 and 601 are refused, 1 and 600 are accepted", async () => {
    const target = await freshModule();
    for (const est_minutes of [0, 601, -5]) {
      const { error } = await world.teacher.client.from("lessons").insert(draftOf(target.id, { est_minutes }));
      expect(error?.code).toBe(checkFailed);
    }
    for (const est_minutes of [1, 600]) {
      const { error } = await world.teacher.client.from("lessons").insert(draftOf(target.id, { est_minutes }));
      expect(error).toBeNull();
    }
    expect(await countLessons(target.id)).toBe(2);
  });

  it("lessons insert: a title of 161 characters, an empty title or a control character is refused, 160 is accepted", async () => {
    const target = await freshModule();
    for (const title of ["a".repeat(161), "", "Bell\u0007", "Two\nlines"]) {
      const { error } = await world.teacher.client.from("lessons").insert(draftOf(target.id, { title }));
      expect(error?.code).toBe(checkFailed);
    }
    const fits = await world.teacher.client.from("lessons").insert(draftOf(target.id, { title: "a".repeat(160) }));
    expect(fits.error).toBeNull();
    expect(await countLessons(target.id)).toBe(1);
  });

  it("lessons insert: the 61st lesson in a module is refused with lesson_limit", async () => {
    const target = await freshModule();
    for (let index = 1; index <= 60; index += 1) {
      const { error } = await world.teacher.client.from("lessons").insert({ module_id: target.id, title: `Lesson ${index}` });
      expect(error).toBeNull();
    }
    expect(await countLessons(target.id)).toBe(60);
    const { error } = await world.teacher.client.from("lessons").insert({ module_id: target.id, title: "Lesson 61" });
    expect(error?.code).toBe(limitReached);
    expect(error?.message).toBe("lesson_limit");
    expect(await countLessons(target.id)).toBe(60);
  });
});

describe("lessons select", () => {
  it("lessons select: the teacher reads drafts and published lessons", async () => {
    const { data, error } = await world.teacher.client
      .from("lessons")
      .select("id, module_id, title, body_md, position, est_minutes, published_at, revision, created_at, updated_at")
      .eq("module_id", shared.id)
      .order("position");
    expect(error).toBeNull();
    expect(data).toEqual([draft, published]);
  });

  it("lessons select: an enrolled student reads a published lesson", async () => {
    const { data, error } = await world.studentA.client.from("lessons").select("id, title, body_md").eq("id", published.id);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: published.id, title: published.title, body_md: published.body_md }]);
  });

  it("lessons select: an enrolled student reads zero drafts", async () => {
    const byId = await world.studentA.client.from("lessons").select("id").eq("id", draft.id);
    expect(byId.error).toBeNull();
    expect(byId.data).toEqual([]);
    const byTitle = await world.studentA.client.from("lessons").select("id").eq("title", draft.title);
    expect(byTitle.data).toEqual([]);
    const everything = await world.studentA.client.from("lessons").select("id, published_at");
    expect(everything.error).toBeNull();
    expect(everything.data!.length).toBeGreaterThan(0);
    expect(everything.data!.every((row) => row.published_at !== null)).toBe(true);
    expect(everything.data!.map((row) => row.id)).not.toContain(draft.id);
  });

  it("lessons select: a student of another class and the outsider read nothing, published or not", async () => {
    for (const actor of [world.otherStudent, world.outsider]) {
      const { data, error } = await actor.client.from("lessons").select("id").in("id", [draft.id, published.id]);
      expect(error).toBeNull();
      expect(data).toEqual([]);
      const everything = await actor.client.from("lessons").select("id");
      expect(everything.data).toEqual([]);
    }
  });

  it("lessons select: another teacher reads nothing", async () => {
    const { data, error } = await world.otherTeacher.client.from("lessons").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("lessons select: anon is refused", async () => {
    const { data, error } = await anon.from("lessons").select("id");
    expect(error?.code).toBe(refused);
    expect(data).toBeNull();
  });

  it("lessons select: an embedded read through modules gives a student no draft", async () => {
    const { data, error } = await world.studentA.client.from("modules").select("id, lessons(*)").eq("id", shared.id).single();
    expect(error).toBeNull();
    expect(data!.lessons.map((lesson) => lesson.id)).toEqual([published.id]);
    const asTeacher = await world.teacher.client.from("modules").select("id, lessons(id)").eq("id", shared.id).single();
    expect(asTeacher.data!.lessons.map((lesson) => lesson.id).sort()).toEqual([draft.id, published.id].sort());
  });

  it("lessons select: a count as a student counts only published lessons", async () => {
    const asStudent = await world.studentA.client
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("module_id", shared.id);
    expect(asStudent.error).toBeNull();
    expect(asStudent.count).toBe(1);
    const asTeacher = await world.teacher.client
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("module_id", shared.id);
    expect(asTeacher.count).toBe(2);
    const asOutsider = await world.outsider.client.from("lessons").select("id", { count: "exact", head: true });
    expect(asOutsider.count).toBe(0);
  });

  it("lessons select: a lesson disappears for a student once the teacher unpublishes it", async () => {
    const target = await addLesson(shared.id, "Comes and goes", true);
    const visible = await world.studentA.client.from("lessons").select("id").eq("id", target.id);
    expect(visible.data).toEqual([{ id: target.id }]);
    const unpublished = await world.teacher.client.from("lessons").update({ published_at: null }).eq("id", target.id).select("id");
    expect(unpublished.data).toEqual([{ id: target.id }]);
    const hidden = await world.studentA.client.from("lessons").select("id").eq("id", target.id);
    expect(hidden.data).toEqual([]);
    await world.teacher.client.from("lessons").delete().eq("id", target.id);
  });
});

describe("lessons update", () => {
  it("lessons update: publishing with a future or a past timestamp stores the database time", async () => {
    for (const requested of ["2099-01-01T00:00:00Z", "2001-01-01T00:00:00Z"]) {
      const target = await addLesson((await freshModule()).id);
      const { data, error } = await world.teacher.client
        .from("lessons")
        .update({ published_at: requested })
        .eq("id", target.id)
        .select("published_at");
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expectWithinAMinuteOfNow(data![0].published_at);
      expectWithinAMinuteOfNow((await readLesson(target.id)).published_at);
    }
  });

  it("lessons update: publishing again keeps the first published_at", async () => {
    const target = await addLesson((await freshModule()).id, "Published once", true);
    const { data, error } = await world.teacher.client
      .from("lessons")
      .update({ published_at: "2099-01-01T00:00:00Z" })
      .eq("id", target.id)
      .select("published_at");
    expect(error).toBeNull();
    expect(data).toEqual([{ published_at: target.published_at }]);
    expect(await readLesson(target.id)).toEqual(target);
  });

  it("lessons update: unpublishing stores null", async () => {
    const target = await addLesson((await freshModule()).id, "Pulled back", true);
    const { data, error } = await world.teacher.client
      .from("lessons")
      .update({ published_at: null })
      .eq("id", target.id)
      .select("published_at");
    expect(error).toBeNull();
    expect(data).toEqual([{ published_at: null }]);
    expect(await readLesson(target.id)).toEqual({ ...target, published_at: null });
  });

  it("lessons update: an edit of the title, the body or the minutes raises revision by one and changes updated_at", async () => {
    const target = await addLesson((await freshModule()).id);
    let before = target;
    for (const change of [{ title: "Point in time recovery" }, { body_md: "Replay the log." }, { est_minutes: 25 }]) {
      const { data, error } = await world.teacher.client.from("lessons").update(change).eq("id", target.id).select("revision");
      expect(error).toBeNull();
      expect(data).toEqual([{ revision: before.revision + 1 }]);
      const after = await readLesson(target.id);
      expect(after).toMatchObject(change);
      expect(after.revision).toBe(before.revision + 1);
      expect(new Date(after.updated_at).getTime()).toBeGreaterThan(new Date(before.updated_at).getTime());
      expect(after.created_at).toBe(target.created_at);
      before = after;
    }
    expect(before.revision).toBe(4);
  });

  it("lessons update: a save with the same values keeps revision and updated_at", async () => {
    const target = await addLesson((await freshModule()).id);
    const { data, error } = await world.teacher.client
      .from("lessons")
      .update({ title: target.title, body_md: target.body_md, est_minutes: target.est_minutes })
      .eq("id", target.id)
      .select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(await readLesson(target.id)).toEqual(target);
  });

  it("lessons update: publish and unpublish do not change revision or updated_at", async () => {
    const target = await addLesson((await freshModule()).id);
    const publish = await world.teacher.client
      .from("lessons")
      .update({ published_at: new Date().toISOString() })
      .eq("id", target.id)
      .select("id");
    expect(publish.data).toHaveLength(1);
    const afterPublish = await readLesson(target.id);
    expect(afterPublish.published_at).not.toBeNull();
    expect(afterPublish).toEqual({ ...target, published_at: afterPublish.published_at });
    const unpublish = await world.teacher.client.from("lessons").update({ published_at: null }).eq("id", target.id).select("id");
    expect(unpublish.data).toHaveLength(1);
    expect(await readLesson(target.id)).toEqual(target);
  });

  it("lessons update: a save with a stale revision changes zero rows", async () => {
    const target = await addLesson((await freshModule()).id);
    const first = await world.teacher.client
      .from("lessons")
      .update({ body_md: "Saved from the first tab." })
      .eq("id", target.id)
      .eq("revision", target.revision)
      .select("revision");
    expect(first.data).toEqual([{ revision: 2 }]);
    const stale = await world.teacher.client
      .from("lessons")
      .update({ body_md: "Saved from the second tab." })
      .eq("id", target.id)
      .eq("revision", target.revision)
      .select("revision");
    expect(stale.error).toBeNull();
    expect(stale.data).toEqual([]);
    const after = await readLesson(target.id);
    expect(after.body_md).toBe("Saved from the first tab.");
    expect(after.revision).toBe(2);
  });

  it("lessons update: the teacher cannot update module_id, position, revision, updated_at, created_at or id", async () => {
    const elsewhere = await freshModule();
    const changes = [
      { module_id: elsewhere.id },
      { position: 40 },
      { revision: 1 },
      { updated_at: "2020-01-01T00:00:00Z" },
      { created_at: "2020-01-01T00:00:00Z" },
      { id: randomUUID() },
    ];
    for (const change of changes) {
      const { error } = await world.teacher.client.from("lessons").update(change).eq("id", draft.id);
      expect(error?.code).toBe(refused);
    }
    await expectSharedLessonsUnchanged();
    expect(await countLessons(elsewhere.id)).toBe(0);
  });

  it("lessons update: an enrolled student, another teacher, a student of another class and the outsider cannot update", async () => {
    for (const actor of [world.studentA, world.otherTeacher, world.otherStudent, world.outsider]) {
      for (const change of [{ title: "Changed by someone else" }, { published_at: new Date().toISOString() }, { published_at: null }]) {
        const { data, error } = await actor.client
          .from("lessons")
          .update(change)
          .in("id", [draft.id, published.id])
          .select("id");
        expect(error).toBeNull();
        expect(data).toEqual([]);
      }
    }
    await expectSharedLessonsUnchanged();
  });

  it("lessons update: anon cannot update", async () => {
    const { error } = await anon.from("lessons").update({ title: "Changed by nobody" }).eq("id", published.id);
    expect(error?.code).toBe(refused);
    await expectSharedLessonsUnchanged();
  });

  it("lessons update: a bad body, minutes or title is refused and the row stays", async () => {
    const changes = [
      { body_md: "a".repeat(50_001) },
      { body_md: "Read this ‮backwards" },
      { body_md: "Ring the bell\u0007" },
      { est_minutes: 0 },
      { est_minutes: 601 },
      { title: "a".repeat(161) },
      { title: "" },
    ];
    for (const change of changes) {
      const { error } = await world.teacher.client.from("lessons").update(change).eq("id", draft.id);
      expect(error?.code).toBe(checkFailed);
    }
    await expectSharedLessonsUnchanged();
  });
});

describe("lessons delete", () => {
  it("lessons delete: the teacher deletes a draft", async () => {
    const container = await freshModule();
    const target = await addLesson(container.id);
    const { data, error } = await world.teacher.client.from("lessons").delete().eq("id", target.id).select("id");
    expect(error).toBeNull();
    expect(data).toEqual([{ id: target.id }]);
    expect(await countLessons(container.id)).toBe(0);
  });

  it("lessons delete: a lesson that a student completed is refused with 23503", async () => {
    const target = await addLesson((await freshModule()).id, "Completed", true);
    await markDone(target.id, world.studentA.id);
    const { error } = await world.teacher.client.from("lessons").delete().eq("id", target.id).select("id");
    expect(error?.code).toBe(foreignKeyFailed);
    expect(await readLesson(target.id)).toEqual(target);
  });

  it("lessons delete: an enrolled student, another teacher, a student of another class and the outsider cannot delete", async () => {
    for (const actor of [world.studentA, world.otherTeacher, world.otherStudent, world.outsider]) {
      const { data, error } = await actor.client.from("lessons").delete().in("id", [draft.id, published.id]).select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
    await expectSharedLessonsUnchanged();
  });

  it("lessons delete: anon cannot delete", async () => {
    const { error } = await anon.from("lessons").delete().eq("id", published.id);
    expect(error?.code).toBe(refused);
    await expectSharedLessonsUnchanged();
  });
});
