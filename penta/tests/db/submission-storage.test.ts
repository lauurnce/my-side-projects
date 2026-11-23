import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { megabyte, submissionUpload } from "../../src/lib/config";
import { buildDocx, buildMacroDocument, buildPdf } from "../fixtures/deck-files";
import {
  addSubmission,
  addUpload,
  admin,
  anon,
  createRouteWorld,
  docxType,
  pdfType,
  readActivity,
  readSubmission,
  refused,
  removeCreatedUsers,
  removeSubmissionFiles,
  storeSubmissionFile,
  submissionBucket,
  submissionColumns,
  submissionFileExists,
  submissionPath,
  type Actor,
  type Client,
} from "./helpers";

type Activity = NonNullable<Awaited<ReturnType<typeof readActivity>>>;
type Submission = NonNullable<Awaited<ReturnType<typeof readSubmission>>>;

const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const storedPdf = buildPdf(1, 700);

let world: Awaited<ReturnType<typeof createRouteWorld>>;
let essay: Activity;
let rowA: Submission;
let storedPath: string;
let callers: [string, Client][];
const extraPaths: string[] = [];

function files(client: Client) {
  return client.storage.from(submissionBucket);
}

function freshPath(studentId = world.studentA.id, kind: "pdf" | "docx" = "pdf") {
  const path = submissionPath(essay, studentId, randomUUID(), kind);
  extraPaths.push(path);
  return path;
}

async function accessToken(actor: Actor): Promise<string> {
  const { data } = await actor.client.auth.getSession();
  if (!data.session) throw new Error("the actor has no session");
  return data.session.access_token;
}

async function storedDetails(path: string) {
  const { data } = await admin.storage.from(submissionBucket).info(path);
  return data ? { size: data.size, etag: data.etag, contentType: data.contentType } : null;
}

function putSigned(signedUrl: string, bytes: Uint8Array, contentType: string, upsert = "false") {
  return fetch(signedUrl, {
    method: "PUT",
    headers: { "content-type": contentType, "x-upsert": upsert },
    body: Buffer.from(bytes),
  });
}

async function signedUploadUrl(path: string): Promise<string> {
  const { data, error } = await admin.storage.from(submissionBucket).createSignedUploadUrl(path);
  if (error) throw error;
  return data.signedUrl;
}

beforeAll(async () => {
  world = await createRouteWorld();
  essay = await addUpload(world.classroom.id, world.teacher.id, { title: "Access review essay" });
  rowA = await addSubmission(essay, world.studentA.id, { sizeBytes: storedPdf.length });
  storedPath = rowA.file_path!;
  await storeSubmissionFile(storedPath, storedPdf);
  callers = [
    ["student A, the owner", world.studentA.client],
    ["student B, a classmate", world.studentB.client],
    ["a student of another class", world.otherStudent.client],
    ["the class teacher", world.teacher.client],
    ["anon", anon],
  ];
});

afterAll(async () => {
  const left = [];
  for (const path of extraPaths) if (await submissionFileExists(path)) left.push(path);
  await removeSubmissionFiles(left);
  await removeCreatedUsers();
});

describe("submissions bucket", () => {
  it("submissions bucket: it exists, is private, limited to 25 MB and to the two MIME types", async () => {
    const { data, error } = await admin.storage.getBucket(submissionBucket);
    expect(error).toBeNull();
    expect(data).toMatchObject({ id: submissionBucket, name: submissionBucket, public: false, file_size_limit: 26214400 });
    expect(data!.file_size_limit).toBe(submissionUpload.maxBytes);
    expect([...data!.allowed_mime_types!].sort()).toEqual([pdfType, docxType].sort());
    expect(Object.values(submissionUpload.mimeTypeByExtension).sort()).toEqual([pdfType, docxType].sort());
  });

  it("submissions bucket: API roles cannot read the bucket record, make it public or see it in a listing", async () => {
    for (const [, client] of callers) {
      const one = await client.storage.getBucket(submissionBucket);
      expect(one.error).not.toBeNull();
      expect(one.data).toBeNull();
      expect((await client.storage.listBuckets()).data ?? []).toEqual([]);
      expect((await client.storage.updateBucket(submissionBucket, { public: true })).error).not.toBeNull();
      expect((await client.storage.emptyBucket(submissionBucket)).error).not.toBeNull();
    }
    expect((await admin.storage.getBucket(submissionBucket)).data?.public).toBe(false);
    expect(await submissionFileExists(storedPath)).toBe(true);
  });
});

describe("a student cannot read another student's file", () => {
  it("submissions objects: the admin client reads the stored file back", async () => {
    const { data, error } = await admin.storage.from(submissionBucket).download(storedPath);
    expect(error).toBeNull();
    expect(data!.size).toBe(storedPdf.length);
  });

  it("submissions objects: no API role can list the bucket or any folder of it", async () => {
    const folders = [
      "",
      world.classroom.id,
      `${world.classroom.id}/${essay.id}`,
      `${world.classroom.id}/${essay.id}/${world.studentA.id}`,
    ];
    for (const [, client] of callers) {
      for (const folder of folders) {
        const { data } = await files(client).list(folder);
        expect(data ?? []).toEqual([]);
      }
    }
  });

  it("submissions objects: no API role can download the file or read its details", async () => {
    for (const [, client] of callers) {
      const downloaded = await files(client).download(storedPath);
      expect(downloaded.error).not.toBeNull();
      expect(downloaded.data).toBeNull();
      const info = await files(client).info(storedPath);
      expect(info.error).not.toBeNull();
      expect(info.data).toBeNull();
      expect((await files(client).exists(storedPath)).data).toBe(false);
    }
  });

  it("submissions objects: no API role can sign a download or an upload", async () => {
    for (const [, client] of callers) {
      const view = await files(client).createSignedUrl(storedPath, 60);
      expect(view.error).not.toBeNull();
      expect(view.data).toBeNull();
      const many = await files(client).createSignedUrls([storedPath], 60);
      expect((many.data ?? []).filter((entry) => entry.signedUrl)).toEqual([]);
      for (const target of [freshPath(), freshPath(world.studentB.id), storedPath]) {
        const upload = await files(client).createSignedUploadUrl(target);
        expect(upload.error).not.toBeNull();
        expect(upload.data).toBeNull();
      }
    }
  });

  it("submissions objects: no API role can upload a new file, also under the caller's own id", async () => {
    const owners = [world.studentA.id, world.studentB.id, world.otherStudent.id, world.teacher.id];
    for (const [, client] of callers) {
      for (const ownerId of owners) {
        const target = freshPath(ownerId);
        const { data, error } = await files(client).upload(target, buildPdf(1), { contentType: pdfType });
        expect(error).not.toBeNull();
        expect(data).toBeNull();
        expect(await submissionFileExists(target)).toBe(false);
      }
    }
  });

  it("submissions objects: no API role can update, upsert, move or copy the stored file", async () => {
    const before = await storedDetails(storedPath);
    for (const [, client] of callers) {
      const replaced = await files(client).update(storedPath, buildPdf(3), { contentType: pdfType });
      expect(replaced.error).not.toBeNull();
      const upserted = await files(client).upload(storedPath, buildPdf(3), { contentType: pdfType, upsert: true });
      expect(upserted.error).not.toBeNull();
      const movedTo = freshPath(world.studentB.id);
      expect((await files(client).move(storedPath, movedTo)).error).not.toBeNull();
      const copiedTo = freshPath(world.studentB.id);
      expect((await files(client).copy(storedPath, copiedTo)).error).not.toBeNull();
      expect(await submissionFileExists(movedTo)).toBe(false);
      expect(await submissionFileExists(copiedTo)).toBe(false);
    }
    expect(before).toMatchObject({ size: storedPdf.length, contentType: pdfType });
    expect(await storedDetails(storedPath)).toEqual(before);
  });

  it("submissions objects: no API role can remove the stored file", async () => {
    const before = await storedDetails(storedPath);
    for (const [, client] of callers) {
      const { data } = await files(client).remove([storedPath]);
      expect(data ?? []).toEqual([]);
      expect(await submissionFileExists(storedPath)).toBe(true);
    }
    expect(await storedDetails(storedPath)).toEqual(before);
  });

  it("submissions objects: the public URL and the signed-in object URL do not serve the file", async () => {
    const publicUrl = admin.storage.from(submissionBucket).getPublicUrl(storedPath).data.publicUrl;
    expect((await fetch(publicUrl)).status).toBeGreaterThanOrEqual(400);
    for (const actor of [world.studentA, world.studentB, world.otherStudent, world.teacher]) {
      const response = await fetch(`${apiUrl}/storage/v1/object/authenticated/${submissionBucket}/${storedPath}`, {
        headers: { authorization: `Bearer ${await accessToken(actor)}`, apikey: anonKey },
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
      const direct = await fetch(`${apiUrl}/storage/v1/object/${submissionBucket}/${storedPath}`, {
        headers: { authorization: `Bearer ${await accessToken(actor)}`, apikey: anonKey },
      });
      expect(direct.status).toBeGreaterThanOrEqual(400);
    }
  });

  it("submissions objects: a signed link made by the admin client serves the file, so only the server can hand one out", async () => {
    const { data, error } = await admin.storage.from(submissionBucket).createSignedUrl(storedPath, 60);
    expect(error).toBeNull();
    const response = await fetch(data!.signedUrl);
    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBe(storedPdf.length);
  });
});

describe("submissions signed upload", () => {
  it("submissions signed upload: a PUT with the pdf or the docx type stores the file once", async () => {
    const pdfTarget = freshPath();
    const pdf = buildPdf(2);
    expect((await putSigned(await signedUploadUrl(pdfTarget), pdf, pdfType)).status).toBe(200);
    expect(await storedDetails(pdfTarget)).toMatchObject({ size: pdf.length, contentType: pdfType });
    const docxTarget = freshPath(world.studentA.id, "docx");
    const docx = buildDocx();
    expect((await putSigned(await signedUploadUrl(docxTarget), docx, docxType)).status).toBe(200);
    expect(await storedDetails(docxTarget)).toMatchObject({ size: docx.length, contentType: docxType });
  });

  it("submissions signed upload: a PUT with content-type text/html is refused", async () => {
    const target = freshPath();
    const signedUrl = await signedUploadUrl(target);
    const page = new TextEncoder().encode("<script>alert(1)</script>");
    const macroType = "application/vnd.ms-word.document.macroEnabled.12";
    const bodies: [Uint8Array, string][] = [
      [page, "text/html"],
      [page, "image/svg+xml"],
      [buildDocx(), "application/zip"],
      [buildMacroDocument(), macroType],
      [buildPdf(1), "application/octet-stream"],
    ];
    for (const [bytes, contentType] of bodies) {
      const response = await putSigned(signedUrl, bytes, contentType);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(await submissionFileExists(target)).toBe(false);
    }
  });

  it("submissions signed upload: a 26 MB body is refused", async () => {
    const target = freshPath();
    const body = new Uint8Array(26 * megabyte);
    body.set(buildPdf(1));
    expect(body.length).toBeGreaterThan(submissionUpload.maxBytes);
    const response = await putSigned(await signedUploadUrl(target), body, pdfType);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await submissionFileExists(target)).toBe(false);
  });

  it("submissions signed upload: a second PUT to the same URL while the object exists is refused, also with x-upsert true", async () => {
    const target = freshPath();
    const signedUrl = await signedUploadUrl(target);
    const first = buildPdf(2);
    expect((await putSigned(signedUrl, first, pdfType)).status).toBe(200);
    const before = await storedDetails(target);
    expect(before).toMatchObject({ size: first.length });
    for (const upsert of ["false", "true"]) {
      const second = await putSigned(signedUrl, buildPdf(9, 4000), pdfType, upsert);
      expect(second.status).toBeGreaterThanOrEqual(400);
      expect(await storedDetails(target)).toEqual(before);
    }
  });

  it("submissions signed upload: a new signed URL cannot be made for a path that already has a file", async () => {
    const { data, error } = await admin.storage.from(submissionBucket).createSignedUploadUrl(storedPath);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("submissions signed upload: a signed URL does not write to another student's path", async () => {
    const target = freshPath(world.studentB.id);
    const other = freshPath(world.studentA.id);
    const token = new URL(await signedUploadUrl(target)).searchParams.get("token");
    const response = await putSigned(
      `${apiUrl}/storage/v1/object/upload/sign/${submissionBucket}/${other}?token=${token}`,
      buildPdf(1),
      pdfType,
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await submissionFileExists(other)).toBe(false);
    expect(await submissionFileExists(target)).toBe(false);
  });
});

describe("submissions path access", () => {
  it("submissions path access: student B cannot get student A's row, so the file route has no path to sign", async () => {
    for (const actor of [world.studentB, world.otherStudent, world.outsider, world.otherTeacher]) {
      const byId = await actor.client.from("submissions").select(submissionColumns).eq("id", rowA.id).maybeSingle();
      expect(byId.error).toBeNull();
      expect(byId.data).toBeNull();
      const byPath = await actor.client.from("submissions").select("id, file_path").eq("file_path", storedPath);
      expect(byPath.data).toEqual([]);
      const byActivity = await actor.client.from("submissions").select("file_path").eq("activity_id", essay.id);
      expect(byActivity.data).toEqual([]);
    }
    const asAnon = await anon.from("submissions").select("file_path").eq("id", rowA.id);
    expect(asAnon.error?.code).toBe(refused);
    expect(asAnon.data).toBeNull();
    const owner = await world.studentA.client.from("submissions").select("id").eq("id", rowA.id).maybeSingle();
    expect(owner.data).toEqual({ id: rowA.id });
    const teacher = await world.teacher.client.from("submissions").select("id").eq("id", rowA.id).maybeSingle();
    expect(teacher.data).toEqual({ id: rowA.id });
  });
});
