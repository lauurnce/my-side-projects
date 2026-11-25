# PENTA runbook

How to release, check, roll back, back up and look after the live site. PENTA is a Next.js
application on Vercel with a Supabase cloud project for Postgres, Auth, Storage and Realtime.
Every command runs from the `penta/` folder unless a step says otherwise.

Three words used below:

- **The cloud project**: the Supabase project the live site uses. It holds real accounts and real
  class work. A Supabase CLI command reaches it only when it carries `--remote`.
- **The local stack**: the Supabase containers started on the laptop with
  `npx supabase@3.4.0 start`. Supabase CLI commands target it by default.
- **`<site address>`**: the address the live site is served from, the same value as
  `NEXT_PUBLIC_SITE_URL` on Vercel.

In Supabase CLI 3.4.0, `db push`, `db dump`, `db reset`, `migration list` and `migration up` are
all "Local by default. Pass --remote for the linked project". Read the `Target:` line each command
prints before you answer any prompt.

## 1. Where things run and who owns what

| Piece | Where it runs | What it holds | Changed by |
| --- | --- | --- | --- |
| Web application | The Vercel project, with Root Directory set to `penta` | The built Next.js app, the proxy, the server actions and the environment variables | A push to `main`, or the Vercel dashboard |
| Database, Auth, Storage, Realtime | The Supabase cloud project | Every table, the accounts, the `decks` and `submissions` buckets | `npx supabase@3.4.0 db push --remote`, or the Supabase dashboard |
| Source and CI | The GitHub repository. The workflow is `.github/workflows/penta.yml` at the repository root | The code and the migrations. The workflow runs `npm ci` and `npm run verify` on pushes to `main` and on pull requests that touch `penta/` | Commits |
| Local stack | Docker on the laptop | Sample data only | `npx supabase@3.4.0 start`, `npm run demo:reset` |

The workflow uses no secrets and deploys nothing. It and the Vercel build are separate: Vercel
builds what is pushed to `main` whether or not the workflow passes. The workflow does not run the
database tests or the end to end tests, so those are run on the laptop before a release
(section 3).

## 2. Where the secrets live

The values are kept in two places only: the Vercel project's Environment Variables, and the
`.env.local` file in `penta/` on the laptop. Git ignores every `.env` file except `.env.example`,
which lists the names with empty values. The laptop file normally holds the local stack's values,
not the cloud project's.

| Variable | Source of the value | Kept in | Visibility |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard, project API settings | Vercel, `.env.local` | Public by design. Built into the browser bundle and into the content security policy. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard, API keys | Vercel, `.env.local` | Public by design. Row Level Security limits what it can do. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard, API keys | Vercel, `.env.local` | Must never reach the browser. It bypasses Row Level Security. |
| `TEACHER_SIGNUP_CODE` | Chosen by the owner | Vercel, `.env.local` | Server only. A shared secret given to teachers. |
| `NEXT_PUBLIC_SITE_URL` | The address of the site | Vercel, `.env.local` | Public. Not a secret. |

`SUPABASE_SERVICE_ROLE_KEY` is read only by `src/lib/supabase/admin.ts`, which imports
`server-only`, by `scripts/seed.ts` and by the tests. Never give it a name that starts with
`NEXT_PUBLIC_`, never paste it into an issue or a chat, and never commit it.

### Changing a value on Vercel

Use Settings, Environment Variables in the Vercel dashboard, or the Vercel CLI from a folder
linked to the project:

```bash
vercel env update NAME production
```

A deployment keeps the values it was built with, so every change ends with a new deployment
(Deployments, the latest production deployment, Redeploy). The three `NEXT_PUBLIC_` values are
also compiled into the bundle and the response headers, so they change only when the app is built
again.

### Rotating each one

| Variable | Rotate it by | What rotation changes |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard, API keys. If the project uses the newer secret keys, create a new secret key, put it on Vercel, redeploy, then delete the old key. If it uses the legacy `service_role` key, that key changes only when the project's JWT secret is rotated, which also replaces the anon key and signs everyone out. Update both variables and redeploy. | Until the redeploy finishes, teacher sign-up, deck uploads, hand-ins and file links fail, because they all use this key. Older deployments hold the old key and stop being rollback targets (section 5). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page. Put the new value on Vercel and redeploy. | The value is public, so rotate it only together with the service role key or when Supabase requires it. Until the redeploy, the site cannot reach Supabase at all. |
| `TEACHER_SIGNUP_CODE` | Choose a new random text of at least 20 characters, put it on Vercel, redeploy, and give it to the teachers who still need it. | People holding the old code can no longer create a teacher account. Existing teacher accounts are not affected. |
| `NEXT_PUBLIC_SUPABASE_URL` | Changes only if the site moves to another Supabase project. | Needs a redeploy, because the content security policy is built from it. |
| `NEXT_PUBLIC_SITE_URL` | Changes only if the site moves to another address. Also update the Site URL and redirect URLs under Authentication in the Supabase dashboard. | When it starts with `https://` the session cookie is marked `Secure`. |

The teacher sign-up code has a minimum length of 20 characters, set by `teacherCodeMinLength` in
`src/lib/teacher-code.ts`. While the variable is missing or shorter, no code is accepted. Rotate
it when a teacher leaves or when it may have been shared too widely.

### If the service role key leaks

Treat it as full access to the database, the accounts and the stored files.

1. Rotate it now, as in the table above, and redeploy. Accept the short breakage.
2. In the Supabase dashboard open Authentication, Users, and look for accounts you do not
   recognise. A teacher account has `"role": "teacher"` in its app metadata.
3. Open Storage and look in the `decks` and `submissions` buckets for files that should not be
   there.
4. Read the project's API and Postgres logs for the time the key was exposed.
5. Rotate `TEACHER_SIGNUP_CODE` as well if it was stored next to the key.
6. If the key was committed, removing the commit is not enough. The key stays leaked until it is
   rotated.

## 3. Releasing

Order: **test, migrate, push, smoke test**. The migration always reaches the cloud project before
the code that needs it.

1. Start the local stack and run every check on the laptop:

   ```bash
   npx supabase@3.4.0 start
   npx supabase@3.4.0 migration up
   npm run verify
   npm run test:db
   npm run e2e
   ```

   `npm run test:db` and `npm run e2e` refuse to run unless `NEXT_PUBLIC_SUPABASE_URL` in
   `.env.local` is a local address, so they cannot touch the cloud project.

2. See which migrations the cloud project is missing:

   ```bash
   npx supabase@3.4.0 migration list --remote
   ```

3. Dry run. This prints the migrations that would be applied and applies nothing:

   ```bash
   npx supabase@3.4.0 db push --remote --dry-run
   ```

4. Take a backup if the release changes existing tables or data (section 7), then apply:

   ```bash
   npx supabase@3.4.0 db push --remote
   ```

   Running it when there is nothing to apply changes nothing.

5. Only after step 4 succeeds, push the code:

   ```bash
   git push origin main
   ```

   Vercel builds the commit and makes it the production deployment. The GitHub workflow runs
   `npm run verify` on the same commit.

6. Run the smoke test in section 4.

Steps 2 to 4 need the folder linked to the cloud project. That is done once with
`npx supabase@3.4.0 login` and `npx supabase@3.4.0 link --project-ref <project ref>`. Without
`--remote`, `db push` and `migration list` act on the local stack.

### Why migrations go first

The migration is applied while the old code is still live. Migrations here are additive
(section 6), so the old code keeps working on the new schema. The other order does not work: new
code that reads a table, column or function the database does not have yet fails on every page
that uses it.

### If the code is deployed before its migration

PENTA has no check that compares the code with the schema, so nothing stops the pages from
loading. What happens instead:

- `/api/health` still answers `{"status":"ok","database":true}`. It does not look at the schema.
- Pages and actions that use the new table, column or function fail or show no data. Pages that
  do not use them keep working.

Fix: apply the migration. No redeploy is needed.

```bash
npx supabase@3.4.0 db push --remote
```

If the migration itself fails, roll the code back first (section 5), then fix the migration in a
new file.

## 4. Smoke test after a deploy

Do this on the live site after every release. It takes about five minutes.

1. Health check:

   ```bash
   curl -s <site address>/api/health
   ```

   It must print `{"status":"ok","database":true}`.

   | Field | Meaning |
   | --- | --- |
   | `status` | Always `"ok"` when the application answers. The route always answers 200. |
   | `database` | `true` when a request to `/rest/v1/` on `NEXT_PUBLIC_SUPABASE_URL` with the anon key succeeds within 2 seconds. `false` when either variable is missing, the request fails, or it takes longer. |

   `database: true` means the Supabase API is reachable. It does not mean the migrations are
   applied.

2. Response headers:

   ```bash
   curl -sI <site address>/
   ```

   | Header | Expected value |
   | --- | --- |
   | `Content-Security-Policy` | Starts with `default-src 'self'`. Its `connect-src` lists `'self'`, the Supabase project address and the same host with `wss://`. It must not contain `'unsafe-eval'` or `ws://localhost`. |
   | `X-Content-Type-Options` | `nosniff` |
   | `X-Frame-Options` | `DENY` |
   | `Referrer-Policy` | `strict-origin-when-cross-origin` |
   | `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` |
   | `Cross-Origin-Opener-Policy` | `same-origin` |
   | `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` |

   If `connect-src` holds only `'self'`, the build did not have `NEXT_PUBLIC_SUPABASE_URL`
   (section 11).

3. Landing page. Open `<site address>/` and scroll from the top to the footer. The three layers
   and their panels appear in turn and nothing overlaps or stays blank.
4. Theme switch. Use the theme button in the top bar. The page changes between light and dark,
   and the choice is still there after a reload.
5. Sign up. Open `/signup`, create a student account with an address you control, and leave
   "Teacher code" empty. With email confirmation on, the page says "Check your email to confirm
   your account". Otherwise it opens `/hub`.
6. Log in. Sign out, open `/login` and sign in again. It must land on `/hub`. Open `/classes`
   while signed out in a private window: it must redirect to `/login`.
7. Open a deck. Sign in as a teacher, open a class with a deck and open the deck. The first
   slide draws. If the class has no deck yet, upload a small PDF first, which also checks
   Storage and the service role key.
8. Check the browser console on the deck page. A line that starts with "Refused to connect"
   points at the content security policy (section 11).

Remove the test account afterwards in the Supabase dashboard under Authentication, Users.

## 5. Rolling back a bad deploy

A rollback points the production address at an earlier deployment without building again. It
never changes the database.

In the Vercel dashboard:

1. Open the project and go to Deployments.
2. Find the last production deployment that worked, the one before the bad release.
3. Open its menu and choose Instant Rollback, check the listed domains and confirm.

With the Vercel CLI, from a folder linked to the project:

1. List the production deployments and copy the address of the one before the bad one:

   ```bash
   vercel list --environment production
   ```

2. Roll back to it and check that it finished:

   ```bash
   vercel rollback <previous deployment address>
   vercel rollback status
   ```

3. Run the smoke test in section 4.
4. Fix the code and release as in section 3. If the production address still shows the old
   version after the new build, promote the new deployment:

   ```bash
   vercel promote <new deployment address>
   ```

Two limits to know. After a rollback Vercel stops assigning the production address to new builds
until a deployment is promoted. On the Hobby plan a rollback reaches only the deployment
immediately before the current one. To go further back, check out that commit and push it as a
new commit.

### When a rollback is safe, and when it is not

- **Safe:** the bad release shipped no migration, or a migration that follows the policy in
  section 6. The old code ignores new tables, columns and functions. Leave the migration in
  place.
- **Not safe:** a migration broke the policy. It dropped or renamed something, tightened a
  constraint, or replaced a function with a different signature, return shape or meaning that the
  old code cannot work with. The old code would then fail on the pages that use it. Fix forward
  with a new migration and a new deployment.
- **Not safe:** a key was rotated after the older deployment was built (section 2). That
  deployment still holds the old value. Deploy a fix forward instead.

Never reset or restore the database only to make it match older code.

## 6. Migration policy

1. The schema is plain SQL in `supabase/migrations`. Each file name starts with a timestamp, such
   as `20261128000800_handin_needs_enrollment.sql`, and the files are applied in file name order.
   A new file gets a timestamp later than every existing one.
2. A file is never edited once it has been pushed to the cloud project. The project records which
   files it has applied, so an edit would never run there and the laptop and the cloud would
   drift apart. A mistake is corrected by the next file.
3. Migrations are additive and forward-only. A migration may add a table, add a column that is
   nullable or has a default, add an index, add a policy or add a function. There are no down
   migrations.
4. A migration does not rename or drop a table or column, or tighten a constraint on existing
   rows, in the same release as the code change. Do that in a later release, once no deployed
   code uses the old shape.
5. A function is changed with `create or replace function` in a new file, as
   `20261128000400_native_deck_functions.sql` does for `sweep_decks`. Keep the same arguments and
   the same return shape, so the code that is already deployed keeps working.
6. Every table has Row Level Security on, and a new table ships with its policies and grants in
   the same release.
7. Every change ships with its tests in `tests/db`, and `npm run test:db` passes before the file
   is pushed. After a schema change run `npm run types:db` and commit the regenerated
   `src/lib/database.types.ts`.

Why: the migration runs while the old code is live (section 3), so the old code must keep working
on the new schema. The same property is what makes a code rollback safe (section 5).

## 7. Backups and restore

### What Supabase does for you

PENTA is sized for the Supabase free plan. On that plan Supabase takes no automatic daily
backups, and point-in-time recovery is a paid add-on on the paid plans. So on the free plan the
only backups are the ones you take. Confirm what the project has on its Database, Backups page
in the Supabase dashboard.

### Taking a logical backup

Take one before a release that changes existing data, and on a regular schedule while classes
are running.

```bash
npx supabase@3.4.0 db dump --remote --role-only -f backup-roles.sql
npx supabase@3.4.0 db dump --remote -f backup-schema.sql
npx supabase@3.4.0 db dump --remote --data-only --use-copy -f backup-data.sql
```

| File | Holds |
| --- | --- |
| `backup-roles.sql` | The database roles. |
| `backup-schema.sql` | The tables, policies and functions of the project's own schemas. The schemas Supabase manages, such as `auth` and `storage`, are left out. |
| `backup-data.sql` | The rows, including the accounts in `auth` and the file records in `storage`. The migration history tables are left out. |

The command connects with the project's database password, which is set on the Database settings
page of the Supabase dashboard. Add `--dry-run` to any of the three to print what would run
without running it.

Git ignores files named `backup*.sql`, `dump*.sql`, `*.dump` and `*.sql.gz`. Keep that naming.
**The data file contains names, emails, password hashes, scores and feedback.** Never commit it
and never attach it anywhere. Copy it somewhere that is not the laptop, and delete copies you no
longer need.

### What a dump does not contain

**Storage objects are not in a database dump.** The dump holds the rows that describe each file,
not the files. The deck PDFs, PowerPoint originals, slide images and student hand-ins live in the
`decks` and `submissions` buckets. Download the ones that matter from the Storage page of the
dashboard. A restore without the files shows decks and hand-ins that cannot be opened.

### Rehearsing a restore on the local stack

Do this once before you rely on a backup, and again after a large schema change. It needs `psql`
installed. It erases the local database.

1. Take a data dump that leaves out the bucket rows, because the migrations create the two
   buckets themselves:

   ```bash
   npx supabase@3.4.0 db dump --remote --data-only --use-copy -x storage.buckets -f backup-data.sql
   ```

2. Rebuild the local database from the migrations, without the sample data:

   ```bash
   npx supabase@3.4.0 db reset
   ```

   The `Target:` line must say local stack.

3. Load the data. `npx supabase@3.4.0 status` prints the local database address:

   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 --file backup-data.sql --dbname <local database address>
   ```

   It either loads everything or changes nothing.

4. Start the app against the local stack with `npm run dev`, sign in with a real account and
   look around. Decks and hand-ins are listed but their files do not open, because the files are
   not in the dump.
5. Erase the copy afterwards, because it is real data:

   ```bash
   npm run demo:reset
   ```

### Restoring for real

A restore loses everything entered after the backup was taken. It is the last resort, not a way
to undo a release. Never run `db reset --remote` on the cloud project: it erases every table.

If the cloud project is lost, create a new Supabase project, link the folder to it, apply the
migrations with `npx supabase@3.4.0 db push --remote`, load `backup-data.sql` into it with the
same `psql` command and the new project's database address, upload the saved files to the same
paths in the two buckets, then put the new project's address and keys on Vercel and redeploy
(section 2).

## 8. Demo data

Demo data exists only on the laptop.

| Command | What it does |
| --- | --- |
| `npm run demo:reset` | Erases the **local** database, applies every migration again, and runs the seed. |
| `npm run seed` | Adds the sample accounts and the sample classes to the **local** database. |

The seed reads `NEXT_PUBLIC_SUPABASE_URL` from `.env.local` and stops unless it is a local
address. The guard is in `src/lib/supabase/local.ts`:

```ts
const localHosts = ["127.0.0.1", "localhost", "[::1]"];

export function assertLocalSupabase(url: string | undefined): string {
  if (!url || !isLocalSupabase(url)) {
    throw new Error("This command runs only against the local development database");
  }
  return url;
}
```

With any other address the seed prints "Seed stopped: it runs only against the local development
database (127.0.0.1 or localhost)." and exits before it connects. The database tests and the end
to end tests use the same guard.

The local demo accounts, all with the password `penta-local-2026`:

| Role | Email | Name |
| --- | --- | --- |
| Teacher | `teacher@penta.local` | Maria Santos |
| Student | `student1@penta.local` | Ana Reyes |
| Student | `student2@penta.local` | Ben Cruz |
| Student | `student3@penta.local` | Carla Dizon |

**There is no command that seeds or resets the cloud project, and the cloud project must never
be reset.** `npm run demo:reset` resets the local stack only. Do not add `--remote` to a
`db reset` command, and do not put the cloud project's address in `.env.local` to get around the
guard. Accounts and classes on the live site are created through the site itself.

## 9. Storage housekeeping

### The budget

The limits are in `src/lib/config.ts`, and the database enforces the same numbers in the
migrations.

| Limit | Value | Enforced by |
| --- | --- | --- |
| Storage the plan provides | 1 GB, 50 MB per file | `storagePlan` in `src/lib/config.ts` |
| All stored files, before new uploads are refused | 900 MB | `private.storage_block_bytes()` |
| Deck budget, inside that total | 700 MB | `private.deck_budget_bytes()` |
| A deck file | 50 MB, PDF or PPTX | The `decks` bucket |
| A slide image in the editor | 2 MB, PNG, JPEG or WebP, 40 per deck | `slideLimits` and the `decks` bucket |
| A hand-in | 25 MB, PDF or DOCX | The `submissions` bucket |

Room for a new deck is the smaller of two numbers: the deck budget minus the `decks` bucket and
the reserved uploads, and the 900 MB total minus every stored file, the reserved deck uploads and
the pending hand-ins. A hand-in is checked against the 900 MB total.

### What fills it

- Uploaded decks: the PDF and the optional PowerPoint original.
- Images placed in decks made in the slide editor.
- Student hand-ins, one file per student per upload activity.

### What cleans it up

The clean-up runs inside the server actions. There is no scheduled job, so it happens only while
people use the site.

| Function | What it removes | When it runs |
| --- | --- | --- |
| `sweep_decks` | Deletes rows of uploaded decks that were reserved more than 6 hours ago and never finished. Lists every file in the `decks` bucket that no deck row points to, and the app deletes those files. | When a teacher starts, finishes or cancels a deck upload, and after a deck is deleted. |
| `sweep_submissions` | Deletes hand-in reservations older than 6 hours. Lists up to 200 files in the `submissions` bucket that are older than 15 minutes and belong to no hand-in and no reservation, and the app deletes them. | When a student starts, finishes or cancels a hand-in, after a teacher removes graded files, and when the teacher's page for an upload activity loads. |
| `unused_deck_images` | Lists images of one editor deck that are older than 24 hours and no longer used by the saved slides, and the app deletes them. | After each successful save in the slide editor, and when an image upload reaches the image limit. |
| `drop_graded_files` | For one upload activity, clears the file of every hand-in that is already graded and records when. Scores and feedback stay. The files are then deleted by the sweep that follows. | When the teacher of that activity chooses to remove the files of graded work. |

`sweep_decks`, `sweep_submissions` and `unused_deck_images` can be called only with the service
role key. `drop_graded_files` does nothing unless the caller teaches the activity.

### When storage is nearly full

Teachers see "Storage is almost full" on the decks page when decks pass 90% of the deck budget,
and on the grading page when all files pass 90% of 900 MB. When it is full, deck uploads and
editor images answer "Storage is full", and students see "Storage is full, so new files cannot be
accepted right now. Tell your teacher."

1. Check the real numbers on the Storage and Usage pages of the Supabase dashboard.
2. Ask teachers to remove the files of graded work on upload activities that are finished.
3. Ask teachers to delete decks they no longer need. A deck that a quiz requires cannot be
   deleted until the quiz stops requiring it.
4. If a deadline is close, free room first. A student whose upload was refused has to hand in
   again.

Moving to a larger plan does not raise the limits by itself. They are in `src/lib/config.ts` and
in the two SQL functions above, so raising them is a code change with a new migration.

## 10. Watching the site

| Where | What it shows |
| --- | --- |
| Vercel, Deployments | Each build, its commit, whether it succeeded, and the build log. |
| Vercel, Logs | Requests and function logs of the live deployment, including errors from server actions and the proxy. |
| Supabase, Logs | API, Auth, Storage, Realtime and Postgres logs. |
| Supabase, Table Editor and SQL Editor | The rows themselves. |
| Supabase, Authentication, Users | The accounts and when each last signed in. |
| Supabase, Storage | The files in the `decks` and `submissions` buckets. |
| Supabase, Usage | Database size, storage size, egress and active users against the plan's limits. |
| `<site address>/api/health` | Whether the app answers and can reach the Supabase API. Point an uptime monitor at it and alert when the body is not `{"status":"ok","database":true}`, because the status code is always 200. |

Recent failed requests from the Vercel CLI:

```bash
vercel logs --environment production --status-code 5xx --since 30m
```

Free plan limits worth watching:

- Storage: 1 GB in total and 50 MB per file. PENTA stops taking uploads at 900 MB (section 9).
- Database size, on the Usage page. Hand-in records, quiz answers and thread posts grow all term.
- Egress. Every deck a student opens is downloaded from Storage.
- Email. Sign-up confirmation emails are sent by Supabase Auth and are rate limited. The limits
  are under Authentication in the dashboard. The site answers "Too many attempts. Try again in a
  few minutes." when Auth rate limits a request.
- Inactivity. Supabase pauses a free project that has had no activity for about a week. A paused
  project does not answer: `/api/health` shows `"database":false` and signed-in pages answer 503.
  It does not wake up by itself. Open the project in the Supabase dashboard and restore it, then
  run the smoke test.

## 11. Common problems

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Every page under `/hub`, `/classes`, `/decks`, `/ops`, `/grades` and `/threads` answers 503 with "PENTA cannot check your session right now. Try again in a moment." | The proxy could not reach Supabase Auth, or Auth answered with a server error. The project may be paused or down, or the Supabase address or anon key on Vercel is wrong. | Check `/api/health`. Open the Supabase dashboard and restore the project if it is paused. Compare `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` on Vercel with the dashboard, then redeploy. The response carries `Retry-After: 10` and nothing is cached. |
| Log-in works but pages show nothing or fail after a deploy | The migrations were not applied to the cloud project, or Vercel holds the keys of a different project. | Run `npx supabase@3.4.0 migration list --remote`, then `npx supabase@3.4.0 db push --remote`. Check that the three Supabase variables on Vercel all belong to the same project. |
| A teacher gets "That teacher code is not valid" with the right code | `TEACHER_SIGNUP_CODE` is missing on Vercel, is shorter than 20 characters, or was changed without a redeploy. | Set a value of at least 20 characters for Production and redeploy. Check for a stray space at either end. |
| A teacher gets "Could not create the account", students can sign up | `SUPABASE_SERVICE_ROLE_KEY` is missing or wrong. Teacher accounts are created with it. Or the email is already registered. | Set the key for Production and redeploy. |
| Decks do not render, live mode and threads do not update, and the console says "Refused to connect" | The content security policy has no Supabase address. It is built from `NEXT_PUBLIC_SUPABASE_URL` when the app is built, so the variable was missing or pointed at another project at build time. | Set the variable for Production and redeploy. Check `connect-src` as in section 4. |
| One deck does not render but others do | The file is missing from the `decks` bucket, or the signed link expired. A view link lasts one hour. | Reload the page. If it still fails, check the file in Storage and upload the deck again. |
| Live mode updates slowly | Realtime is not connected. The viewer falls back to asking the server about every 3 seconds, so students still follow, a few seconds late. | Check the Realtime logs and the connection count on the Usage page. If the console shows a refused `wss://` connection, see the content security policy row. |
| Thread posts appear late | The same fallback. Threads ask the server about every 10 seconds when Realtime is down. | As above. |
| Uploads fail with "Storage is full" | The 900 MB total or the 700 MB deck budget is reached. | Section 9. |
| Uploads fail with "Storage is not available right now. Try again in a moment." | The server could not reach Storage, or the service role key is wrong. | Check the Storage logs and `SUPABASE_SERVICE_ROLE_KEY`. |
| A deck cannot be deleted | A quiz requires that deck. | Change or delete the quiz first. |
| "Too many attempts. Try again in a few minutes." on sign-up or log-in | Supabase Auth rate limited the request. | Wait. If it happens to a whole class at once, review the rate limits under Authentication. |
| `npm run seed` prints "Seed stopped" | `.env.local` holds an address that is not local. | That is the guard working. Put the local stack's values back (section 8). |

## 12. Removing a person's data on request

PENTA has no page that deletes an account. It is done in the Supabase dashboard. Confirm that the
request comes from the owner of the email address first.

Every table reaches a person through `public.profiles`, and `profiles.id` refers to `auth.users`
with `on delete cascade`. Deleting the auth user therefore does this:

| What happens | Tables and columns |
| --- | --- |
| Deleted | `profiles`, `enrollments`, `join_attempts`, `lesson_progress`, `deck_views`, `quiz_attempts` and with them `quiz_attempt_answers`, `submissions`, `submission_uploads`. |
| Kept, with the person set to null | `threads.created_by`, `threads.locked_by`, `posts.author_id`, `posts.hidden_by`, `post_events.actor_id`, `deck_contents.updated_by`. |
| Kept unchanged | `posts.author_name` and `posts.body`: the post stays and still shows the name it was written under. `post_events.old_body`: earlier versions of edited posts. `submission_grade_log`: it has no foreign keys, so its rows keep the student's id, file name, scores and feedback. |
| Blocks the deletion | `classes.teacher_id`, `decks.created_by`, `live_sessions.teacher_id`, `activities.created_by`, `submissions.graded_by`. All are `on delete restrict`. |

A student owns none of the blocking rows, so a student can always be deleted. A teacher who owns
a class, made a deck or an activity, presented live or graded a hand-in cannot be deleted while
those rows exist. The app has no page that deletes a class, so removing a teacher means removing
their classes and everything in them first. Plan that as its own job and take a backup before it.

### Steps for a student

1. Take a backup (section 7).
2. In the SQL Editor, find the account. Replace the email:

   ```sql
   select id, email from auth.users where email = lower('person@example.com');
   ```

3. List the stored files of their hand-ins before the rows are gone. Replace the id:

   ```sql
   select file_path from public.submissions
   where student_id = '<user id>' and file_path is not null
   union all
   select file_path from public.submission_uploads where student_id = '<user id>';
   ```

   Each path has the form `<class id>/<activity id>/<student id>/<upload id>` with a `.pdf` or
   `.docx` ending, in the `submissions` bucket.

4. Replace the name on their thread posts, because the posts stay:

   ```sql
   update public.posts set author_name = 'Former student' where author_id = '<user id>';
   ```

5. Delete the rows the cascade does not reach:

   ```sql
   delete from public.submission_grade_log where student_id = '<user id>';
   ```

6. Delete the account under Authentication, Users. The cascade removes the rows in the first
   line of the table above.
7. Remove the files from step 3 on the Storage page, in the `submissions` bucket. Files left
   behind are also deleted by `sweep_submissions` the next time it runs (section 9), but do not
   wait for that when a person asked for removal.
8. Check that nothing is left:

   ```sql
   select count(*) from public.profiles where id = '<user id>';
   select count(*) from storage.objects
   where bucket_id = 'submissions' and split_part(name, '/', 3) = '<user id>';
   ```

   Both must be 0.
9. Reply to the person that it is done.

What else holds that person:

- The text of their thread posts stays, without a link to the account. If they ask for the text
  to go as well, a teacher can hide a post in the app. Hiding does not delete it.
- **Every backup taken before the deletion still contains them**, including the one from step 1.
  Delete those files once you are sure, or accept that a restore brings the person back and
  delete them again.
- Gradebook CSV files that teachers exported. Ask them to delete their copies.
