import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deckUpload } from "../../src/lib/config";
import { buildPdf, buildPptx } from "../fixtures/deck-files";
import {
  addDeck,
  admin,
  anon,
  createRouteWorld,
  deckBucket,
  deckFileExists,
  pdfType,
  pptxType,
  removeCreatedUsers,
  storeDeckFile,
  type Actor,
  type Client,
} from "./helpers";

type Deck = Awaited<ReturnType<typeof addDeck>>;

const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const storedPdf = buildPdf(2, 500);

let world: Awaited<ReturnType<typeof createRouteWorld>>;
let deck: Deck;
let callers: [string, Client][];

function files(client: Client) {
  return client.storage.from(deckBucket);
}

function freshPath(name = "slides.pdf") {
  return `${world.classroom.id}/${randomUUID()}/${name}`;
}

function encoded(value: string) {
  return Buffer.from(value).toString("base64");
}

async function accessToken(actor: Actor): Promise<string> {
  const { data } = await actor.client.auth.getSession();
  if (!data.session) throw new Error("the actor has no session");
  return data.session.access_token;
}

async function storedSize(path: string): Promise<number | null> {
  const { data } = await admin.storage.from(deckBucket).info(path);
  return data?.size ?? null;
}

function startResumable(token: string, path: string, bytes: Uint8Array) {
  const metadata = [
    `bucketName ${encoded(deckBucket)}`,
    `objectName ${encoded(path)}`,
    `contentType ${encoded(pdfType)}`,
    `cacheControl ${encoded("3600")}`,
  ].join(",");
  return fetch(`${apiUrl}/storage/v1/upload/resumable`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      apikey: anonKey,
      "tus-resumable": "1.0.0",
      "upload-length": String(bytes.length),
      "upload-metadata": metadata,
      "content-type": "application/offset+octet-stream",
      "x-upsert": "false",
    },
    body: Buffer.from(bytes),
  });
}

function putSigned(signedUrl: string, bytes: Uint8Array, contentType: string) {
  return fetch(signedUrl, {
    method: "PUT",
    headers: { "content-type": contentType, "x-upsert": "false" },
    body: Buffer.from(bytes),
  });
}

async function signedUploadUrl(path: string): Promise<string> {
  const { data, error } = await admin.storage.from(deckBucket).createSignedUploadUrl(path);
  if (error) throw error;
  return data.signedUrl;
}

beforeAll(async () => {
  world = await createRouteWorld();
  deck = await addDeck(world.classroom.id, world.teacher.id, { kind: "pptx", slideCount: 2, sizeBytes: storedPdf.length });
  await storeDeckFile(deck.pdf_path!, storedPdf);
  await storeDeckFile(deck.original_path!, buildPptx(), pptxType);
  callers = [
    ["anon", anon],
    ["the class teacher", world.teacher.client],
    ["an enrolled student", world.studentA.client],
    ["another teacher", world.otherTeacher.client],
  ];
});

afterAll(removeCreatedUsers);

describe("decks bucket", () => {
  it("decks bucket: it is private, limited to 50 MB and to the deck and image MIME types", async () => {
    const { data, error } = await admin.storage.getBucket(deckBucket);
    expect(error).toBeNull();
    expect(data).toMatchObject({ id: deckBucket, name: deckBucket, public: false, file_size_limit: deckUpload.maxBytes });
    expect(data!.file_size_limit).toBe(52428800);
    expect([...data!.allowed_mime_types!].sort()).toEqual([pdfType, pptxType, "image/png", "image/jpeg", "image/webp"].sort());
    expect(Object.values(deckUpload.mimeTypeByExtension).sort()).toEqual([pdfType, pptxType].sort());
  });

  it("decks bucket: API roles cannot read the bucket record or see it in a listing", async () => {
    for (const [, client] of callers) {
      const one = await client.storage.getBucket(deckBucket);
      expect(one.error).not.toBeNull();
      expect(one.data).toBeNull();
      const all = await client.storage.listBuckets();
      expect(all.data ?? []).toEqual([]);
    }
  });

  it("decks bucket: API roles cannot make the bucket public or create another bucket", async () => {
    for (const [, client] of callers) {
      expect((await client.storage.updateBucket(deckBucket, { public: true })).error).not.toBeNull();
      expect((await client.storage.createBucket(`open-${randomUUID().slice(0, 8)}`, { public: true })).error).not.toBeNull();
    }
    const { data } = await admin.storage.getBucket(deckBucket);
    expect(data?.public).toBe(false);
    expect(await deckFileExists(deck.pdf_path!)).toBe(true);
  });
});

describe("decks objects", () => {
  it("decks objects: the admin client reads the stored file back", async () => {
    const { data, error } = await admin.storage.from(deckBucket).download(deck.pdf_path!);
    expect(error).toBeNull();
    expect(data!.size).toBe(storedPdf.length);
  });

  it("decks objects: API roles list nothing", async () => {
    const folders = ["", world.classroom.id, `${world.classroom.id}/${deck.id}`];
    for (const [, client] of callers) {
      for (const folder of folders) {
        const { data } = await files(client).list(folder);
        expect(data ?? []).toEqual([]);
      }
    }
  });

  it("decks objects: API roles cannot download a file or read its details", async () => {
    for (const [, client] of callers) {
      for (const path of [deck.pdf_path!, deck.original_path!]) {
        const downloaded = await files(client).download(path);
        expect(downloaded.error).not.toBeNull();
        expect(downloaded.data).toBeNull();
        const info = await files(client).info(path);
        expect(info.error).not.toBeNull();
        expect(info.data).toBeNull();
      }
    }
  });

  it("decks objects: API roles cannot sign a download or an upload", async () => {
    for (const [, client] of callers) {
      const view = await files(client).createSignedUrl(deck.pdf_path!, 60);
      expect(view.error).not.toBeNull();
      expect(view.data).toBeNull();
      const many = await files(client).createSignedUrls([deck.pdf_path!, deck.original_path!], 60);
      expect((many.data ?? []).filter((entry) => entry.signedUrl)).toEqual([]);
      const target = freshPath();
      const upload = await files(client).createSignedUploadUrl(target);
      expect(upload.error).not.toBeNull();
      expect(upload.data).toBeNull();
    }
  });

  it("decks objects: API roles cannot upload a new file", async () => {
    for (const [, client] of callers) {
      const target = freshPath();
      const { data, error } = await files(client).upload(target, buildPdf(1), { contentType: pdfType });
      expect(error).not.toBeNull();
      expect(data).toBeNull();
      expect(await deckFileExists(target)).toBe(false);
    }
  });

  it("decks objects: API roles cannot replace, move or copy a stored file", async () => {
    for (const [, client] of callers) {
      const replaced = await files(client).update(deck.pdf_path!, buildPdf(1), { contentType: pdfType });
      expect(replaced.error).not.toBeNull();
      const upserted = await files(client).upload(deck.pdf_path!, buildPdf(1), { contentType: pdfType, upsert: true });
      expect(upserted.error).not.toBeNull();
      const movedTo = freshPath();
      expect((await files(client).move(deck.pdf_path!, movedTo)).error).not.toBeNull();
      const copiedTo = freshPath();
      expect((await files(client).copy(deck.pdf_path!, copiedTo)).error).not.toBeNull();
      expect(await deckFileExists(movedTo)).toBe(false);
      expect(await deckFileExists(copiedTo)).toBe(false);
    }
    expect(await storedSize(deck.pdf_path!)).toBe(storedPdf.length);
  });

  it("decks objects: API roles cannot remove a stored file", async () => {
    for (const [, client] of callers) {
      const { data } = await files(client).remove([deck.pdf_path!, deck.original_path!]);
      expect(data ?? []).toEqual([]);
      expect(await deckFileExists(deck.pdf_path!)).toBe(true);
      expect(await deckFileExists(deck.original_path!)).toBe(true);
    }
  });

  it("decks objects: the public URL and the signed-in object URL do not serve the file", async () => {
    const publicUrl = admin.storage.from(deckBucket).getPublicUrl(deck.pdf_path!).data.publicUrl;
    const asPublic = await fetch(publicUrl);
    expect(asPublic.status).toBeGreaterThanOrEqual(400);
    for (const actor of [world.teacher, world.studentA]) {
      const response = await fetch(`${apiUrl}/storage/v1/object/authenticated/${deckBucket}/${deck.pdf_path!}`, {
        headers: { authorization: `Bearer ${await accessToken(actor)}`, apikey: anonKey },
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
  });

  it("decks objects: the resumable endpoint refuses a signed-in teacher and a student", async () => {
    for (const actor of [world.teacher, world.studentA]) {
      const target = freshPath();
      const response = await startResumable(await accessToken(actor), target, buildPdf(1));
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(await deckFileExists(target)).toBe(false);
    }
    const withAnonKey = freshPath();
    expect((await startResumable(anonKey, withAnonKey, buildPdf(1))).status).toBeGreaterThanOrEqual(400);
    expect(await deckFileExists(withAnonKey)).toBe(false);
  });

  it("decks objects: the same resumable request made with the service role is accepted", async () => {
    const target = freshPath();
    const bytes = buildPdf(1);
    const response = await startResumable(process.env.SUPABASE_SERVICE_ROLE_KEY!, target, bytes);
    expect(response.status).toBe(201);
    expect(await storedSize(target)).toBe(bytes.length);
  });
});

describe("decks signed upload", () => {
  it("decks signed upload: a PUT with the pdf type stores the file once", async () => {
    const target = freshPath();
    const bytes = buildPdf(2);
    const response = await putSigned(await signedUploadUrl(target), bytes, pdfType);
    expect(response.status).toBe(200);
    expect(await storedSize(target)).toBe(bytes.length);
  });

  it("decks signed upload: a PUT with content-type text/html is refused", async () => {
    const target = freshPath();
    const signedUrl = await signedUploadUrl(target);
    for (const contentType of ["text/html", "image/svg+xml", "application/zip"]) {
      const response = await putSigned(signedUrl, new TextEncoder().encode("<script>alert(1)</script>"), contentType);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(await deckFileExists(target)).toBe(false);
    }
  });

  it("decks signed upload: a second PUT to the same URL while the object exists is refused", async () => {
    const target = freshPath();
    const signedUrl = await signedUploadUrl(target);
    const first = buildPdf(2);
    expect((await putSigned(signedUrl, first, pdfType)).status).toBe(200);
    const second = await putSigned(signedUrl, buildPdf(9, 4000), pdfType);
    expect(second.status).toBeGreaterThanOrEqual(400);
    expect(await storedSize(target)).toBe(first.length);
  });

  it("decks signed upload: a new signed URL cannot be made for a path that already has a file", async () => {
    const { data, error } = await admin.storage.from(deckBucket).createSignedUploadUrl(deck.pdf_path!);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("decks signed upload: a signed URL does not write to another path", async () => {
    const target = freshPath();
    const other = freshPath();
    const token = new URL(await signedUploadUrl(target)).searchParams.get("token");
    const response = await putSigned(
      `${apiUrl}/storage/v1/object/upload/sign/${deckBucket}/${other}?token=${token}`,
      buildPdf(1),
      pdfType,
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await deckFileExists(other)).toBe(false);
    expect(await deckFileExists(target)).toBe(false);
  });
});

describe("decks path access", () => {
  it("decks path access: a student of another class cannot read the deck row, so there is no path to sign", async () => {
    for (const actor of [world.otherStudent, world.outsider, world.otherTeacher]) {
      const { data, error } = await actor.client.from("decks").select("id, pdf_path, original_path").eq("id", deck.id).maybeSingle();
      expect(error).toBeNull();
      expect(data).toBeNull();
      const byPath = await actor.client.from("decks").select("id").eq("pdf_path", deck.pdf_path!);
      expect(byPath.data).toEqual([]);
    }
    const asAnon = await anon.from("decks").select("pdf_path").eq("id", deck.id);
    expect(asAnon.data).toBeNull();
    const enrolled = await world.studentA.client.from("decks").select("pdf_path").eq("id", deck.id).maybeSingle();
    expect(enrolled.data).toEqual({ pdf_path: deck.pdf_path! });
  });
});
