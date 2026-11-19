# Quadra runbook

How to release, back up, restore, roll back and respond to alerts on the live site
(https://quadra-swart.vercel.app, Vercel + Supabase Postgres). Every command runs from the
`quadra/` folder with the virtual environment active.

Two words used below:

- **The production terminal**: a terminal where `DATABASE_URL` holds the production address.
  Open one with `export DATABASE_URL='postgresql://...'` and close it when you are done. Every
  `flask` command in it acts on real people's data.
- **A local terminal**: a terminal where the commands start with `DATABASE_URL=` (empty), which
  forces the SQLite file in `instance/` even if `.env` holds a production address.

## 1. Releasing

Order: **back up, migrate, deploy**. The migration always runs before the code that needs it.

1. In the production terminal, take a backup (section 2):
   ```bash
   flask --app app backup
   ```
2. Apply the migrations. Running it when there is nothing to apply is harmless:
   ```bash
   flask --app app migrate
   ```
3. Deploy only if step 2 succeeded:
   ```bash
   vercel deploy --prod
   ```
4. Check the result:
   ```bash
   curl -s https://quadra-swart.vercel.app/ready
   ```
   It must print `{"database":"ok","schema":"current","status":"ok"}`. Then open the landing
   page and `/admin`.

Steps 2 and 3 as one line, so the deploy cannot happen after a failed migration:

```bash
flask --app app migrate && vercel deploy --prod
```

### If the code is deployed before the migration

The app compares the migration files it ships with against the `schema_migrations` table, once
per server instance. While any are missing:

- every page answers **503** with "We will be right back" instead of a raw error. `/api/` paths
  get the same message as JSON. No page or form runs, so nothing is half-saved.
- `/health` still answers 200 (the code is running). `/ready` answers 503 with
  `"schema":"behind"`.
- the log gets a `CRITICAL` line starting `DATABASE IS BEHIND THE CODE` that names the missing
  files, and the alert address gets one email (section 6).

Fix: run `flask --app app migrate` in the production terminal. Each instance looks again at most
every 10 seconds, so the site comes back by itself within about 10 seconds. No redeploy is needed.

## 2. Backups

### What Supabase does for you

Nothing, on the free plan. Supabase's backup page says "We automatically back up all Pro, Team,
and Enterprise Plan projects on a daily basis" and recommends "that free tier plan projects
regularly export their data" and keep off-site backups
([Supabase: Database Backups](https://supabase.com/docs/guides/platform/backups), read
2026-11-24). The page does not list the Free plan among the plans with automatic backups, and
Point-in-Time Recovery is a paid add-on. So the only backups of this site are the ones you take.
The same page notes that on paid plans daily backups do not store the passwords of custom roles,
which would include the role this app connects as.

### Taking a backup

Take one before every migration, before every restore, and after every event day.

1. In the production terminal:
   ```bash
   flask --app app backup
   ```
2. It prints the file it wrote, for example
   `instance/backups/quadra-20261124-081500.json`. Use `--to some/path.json` to choose the place.
   It never overwrites a file.
3. Copy the file somewhere that is not this laptop, for example an encrypted USB drive.

The file is one JSON document read in a single database snapshot, so it is consistent even while
people are registering:

| Key | Holds |
| --- | --- |
| `format`, `version` | `quadra-backup`, `1` |
| `created_at` | when it was taken, UTC |
| `source` | `postgres` or `sqlite` |
| `migrations` | the applied migration files |
| `last_ids` | the last id handed out for accounts, events and attendees |
| `tables` | every table except `schema_migrations`, as a list of rows, each row a column-to-value map |

**The file contains names, emails, phone numbers, ticket tokens and password hashes.** It is
written readable only by your user (mode 600) into `instance/`, which git and Vercel both ignore.
Never commit it, never attach it to an issue, and never upload it to the GitHub repository, which
is public. Delete backups you no longer need: a person removed under section 7 is still inside
every older backup.

### Rehearsing a restore on the laptop

Do this once now and again after any change to the schema, so the first real restore is not the
first attempt.

1. In a local terminal, build an empty local database at the current migrations:
   ```bash
   DATABASE_URL= flask --app app init-db --no-event
   ```
2. Load the production backup into it:
   ```bash
   DATABASE_URL= flask --app app restore instance/backups/quadra-20261124-081500.json
   ```
3. Run the app on it and look around: sign in with your real password, open `/admin`, open a
   ticket's status link.
   ```bash
   DATABASE_URL= MAIL_ENABLED=false flask --app app run --port 5001
   ```
4. Erase the local copy afterwards, because it is real data:
   ```bash
   DATABASE_URL= flask --app app init-db --no-event
   ```

### Restoring for real

`restore` refuses unless the database has exactly the migrations the backup lists and has no rows
in any table. It loads everything in one transaction, so it either finishes or changes nothing,
and it sets the id counters so new registrations continue after the last code handed out.

1. Take a backup of whatever is there now, even if it is damaged.
2. Stop the damage first if a bad deploy caused it (section 3).
3. If the tables are missing entirely (a new Supabase project), build them without the starter
   event, as the role the app connects with:
   ```bash
   flask --app app migrate --no-event
   ```
4. Load the backup. If the database still has rows, `--force` erases them first, inside the same
   transaction:
   ```bash
   flask --app app restore path/to/backup.json --force
   ```
   If `QUADRA_ENV=production` is set in that terminal the command also needs `--production`.
5. `curl -s https://quadra-swart.vercel.app/ready`, then sign in and check `/admin`.

A backup older than the latest migration: check out the commit that was live when it was taken,
run `migrate --no-event` on an empty database, `restore` it, check out `main` again and run
`migrate`. `--force` also skips the migration check, but then the changes later migrations made to
existing rows are not replayed.

Everything registered after the backup was taken is lost by a restore. Restoring is the last
resort, not a way to undo a release.

## 3. Rolling back a bad deploy

From Vercel's documentation, read 2026-11-24
([Instant Rollback](https://vercel.com/docs/instant-rollback),
[`vercel rollback`](https://vercel.com/docs/cli/rollback),
[`vercel promote`](https://vercel.com/docs/cli/promote),
[Rolling back a production deployment](https://vercel.com/docs/deployments/rollback-production-deployment)):

- A rollback points the production domain at an earlier deployment without rebuilding and takes
  effect within seconds.
- "Hobby users can roll back to the immediately previous deployment." Going further back gives the
  error "To rollback further than the previous production deployment, upgrade to pro."
- The rolled-back deployment keeps the environment variables it was built with. Changes made in
  the project settings since then are not applied to it.
- "After a rollback, Vercel turns off auto-assignment of production domains", and promoting a
  deployment turns it back on.

With the CLI:

1. List the production deployments and copy the address of the one before the bad one:
   ```bash
   vercel list --environment production
   ```
2. Roll back to it and confirm:
   ```bash
   vercel rollback <previous-deployment-url>
   vercel rollback status
   ```
3. Check `https://quadra-swart.vercel.app/ready` and the landing page.
4. Fix the code, then release as in section 1. If the site still shows the old version after
   `vercel deploy --prod`, promote the new deployment, which also ends the rolled-back state:
   ```bash
   vercel promote <new-deployment-url>
   ```

In the dashboard: open the project, click **Instant Rollback** on the Production Deployment tile,
pick the deployment, check the listed domains, and click **Confirm Rollback**. To end the
rolled-back state later, click **Manage** on the same tile and promote a deployment.

### When a rollback is safe, and when it is not

- **Safe:** the bad release added a migration that follows the policy in section 4. The old code
  ignores the new tables and columns. Leave the migration in place. Do not try to undo it.
- **Not safe:** a secret was rotated since the older deployment was built (section 8). The older
  deployment still holds the old value, so it cannot reach the database or Gmail. Deploy a fix
  forward instead.
- **Not safe:** a migration broke the policy by renaming, dropping or changing the meaning of
  something the old code uses. Rolling back the code would then fail on every page. Fix forward,
  or restore the pre-migration backup and accept losing what was registered since.
- **Not possible:** the good version is more than one production deployment back, on the Hobby
  plan. Check out that commit and deploy it with `vercel deploy --prod`.

A rollback never changes the database. Never restore a backup only to make the data match older
code.

## 4. Migration policy: additive and forward-only

1. A migration may add a table, add a column that is nullable or has a default, or add an index.
2. A migration may not rename or drop a table or column, tighten a constraint on existing data,
   or change what an existing value means, in the same release as the code change. Do it in a
   later release, once no deployed code uses the old shape.
3. There are no down migrations. A file that has run is never edited. A mistake is corrected by
   the next numbered file.

Why: the migration runs while the old code is still live (section 1), so the old code has to keep
working on the new schema. That same property is what makes a code rollback safe (section 3).
Undoing a migration would mean deleting data people entered after it ran.

## 5. Watching the site

| Address | Touches the database | Meaning |
| --- | --- | --- |
| `/health` | No | The code is deployed and running. Stays 200 during a database outage. |
| `/ready` | Yes | The database answers and has every migration the code ships with. |

`/ready` answers 200 `{"status":"ok","database":"ok","schema":"current"}`, or 503 with
`"schema":"behind"` (migrations missing) or `"database":"unreachable"`. It carries no other
detail, is marked `noindex`, and each server instance asks the database at most once every 15
seconds however often it is called.

Point an uptime monitor at `https://quadra-swart.vercel.app/ready`, expecting status 200, every
5 minutes. That covers what email alerts cannot: the site being down so completely that it cannot
send an email.

## 6. Alerts

Set `ALERT_EMAIL` on Vercel to the address that should get them, then redeploy. Leave it empty to
switch alerts off. `MAIL_ENABLED` must be `true` for them to be sent.

An alert email holds: what failed (the error's type, the method and the route pattern such as
`GET /checkin/<token>`), the time in Manila, a reference, and how many more times it happened
since the last alert about it. It never holds names, emails, form values, cookies, tokens, the
real path, the error's message or a traceback. The same reference is on the error page the
visitor saw and in the log line `Unhandled error reference=...`.

At most one email per kind of problem per hour, and at most five emails per hour in total. The
rest are counted in the `error_alerts` table and reported in the next email. When that table
cannot be used, for example while the database is down, each server instance sends at most one
email per hour and says the repeats were not counted. Sending waits at most 6 seconds, and a
failure to send is logged and never shown to the visitor.

| Subject after `[Quadra alert]` | What to do |
| --- | --- |
| `The database is missing migrations the code needs (...)` | Run `flask --app app migrate` in the production terminal. The site recovers within about 10 seconds. See section 1. |
| `OperationalError on ...` | The database could not be reached or refused the connection. Check `/ready`. In Supabase, check that the project is running and not paused, and that the connection limit is not used up. If the role's password was changed, see section 8. |
| `UndefinedColumn on ...` or `UndefinedTable on ...` | The schema does not match the code. Run `flask --app app migrate`. If it says the database is up to date, roll back the deploy (section 3). |
| Anything else, for example `ValueError on POST /events/<slug>/register` | A bug. Copy the reference, open the project in Vercel, go to Logs, and search for it to see the traceback. If it started right after a deploy and people are affected, roll back (section 3), then fix. |
| The same subject every hour | The count in the email says how many people hit it. Treat it as an outage of that page. |

From the CLI, the recent failed requests:

```bash
vercel logs requests --environment production --query 'httpStatus >= 500 AND httpStatus < 600' --since 30m
```

If no email arrives while the site is clearly broken: Gmail may be refusing the app password
(the log says `The alert email was not sent.`), or the failure happens before the app runs at
all. The uptime monitor in section 5 is the backstop.

## 7. Deleting a person's data on request

The privacy notice promises deletion on request. Confirm the request comes from the email address
that registered, then:

1. Take a backup (section 2).
2. In the Supabase SQL editor, look at what would go. Replace the slug and the email:
   ```sql
   SELECT a.id, a.attendee_code, a.full_name, a.email, a.state, a.checked_in
   FROM attendees a JOIN events e ON e.id = a.event_id
   WHERE e.slug = 'the-event-slug' AND a.email = lower('person@example.com');
   ```
3. Delete exactly that row:
   ```sql
   DELETE FROM attendees
   WHERE email = lower('person@example.com')
     AND event_id = (SELECT id FROM events WHERE slug = 'the-event-slug');
   ```
   It must report one row. The same email under another event is a separate registration and a
   separate request.
4. Reply to the person that it is done.

What else holds that person:

- No other table refers to an attendee row, so nothing blocks the delete and nothing is left
  dangling. The attendee row itself points at the event and at the staff accounts that checked it
  in or decided it. Those stay.
- Their ticket and status links stop working at once. Their attendee code is not given to anyone
  else.
- `application_attempts` holds only a network address and a count, and clears itself after an hour.
- **Every backup taken before the deletion still contains them.** Delete those files, including
  the one from step 1 once you are sure, or accept that a restore brings the person back and
  delete them again.
- The ticket or decline email in the sending Gmail account's Sent folder. Delete it there.
- CSV exports that staff downloaded. Ask them to delete their copies.

## 8. Secrets

Every secret lives in two places only: the Vercel project's Environment Variables (Production),
and, when you need it, your laptop's `.env` or the production terminal. None is in git.
A deployment keeps the values it was built with: "Any change you make to environment variables
are not applied to previous deployments, they only apply to new deployments"
([Vercel: Environment variables](https://vercel.com/docs/environment-variables)). So every
rotation ends with a redeploy, and after it a rollback to an older deployment brings the old
value back (section 3).

To change a value on Vercel, use Settings, Environment Variables in the dashboard, or:

```bash
vercel env rm NAME production
vercel env add NAME production
vercel deploy --prod
```

| Secret | Rotate it by | What rotation breaks |
| --- | --- | --- |
| `SECRET_KEY` | 1. `python -c "import secrets; print(secrets.token_urlsafe(48))"`. 2. Replace the value on Vercel. 3. Redeploy. | Every staff member is signed out and signs in again. Visitors lose the "My registration" shortcut in their browser, and a form that was open must be reloaded. Tickets, status links, invite and password links keep working, because they are stored in the database and not signed with this key. |
| Database role password (inside `DATABASE_URL`) | 1. Pick a quiet time and take a backup. 2. In the Supabase SQL editor: `ALTER ROLE the_app_role WITH PASSWORD 'new-long-random-password';`. 3. Put the new password into `DATABASE_URL` on Vercel. 4. Redeploy. 5. Update your laptop's copy. | From step 2 until the redeploy finishes, every page that needs the database fails and `/ready` says `unreachable`, usually for a minute or two. Do steps 2 to 4 without pausing. Older deployments can no longer connect, so they are not rollback targets. |
| Gmail app password (`SMTP_APP_PASSWORD`) | 1. At https://myaccount.google.com/apppasswords create a new app password. 2. Replace the value on Vercel. 3. Redeploy. 4. Delete the old app password at the same address. | Nothing, if the old one is deleted last. If it is deleted first, emails fail until the redeploy: decision emails show as failed on the dashboard and are sent with "Retry failed", invites must be resent, and alerts are not delivered. |

If a secret may have leaked, rotate it now and accept the breakage. For the database password,
also read through recent rows for changes you did not make, and for the Gmail password check the
account's Sent folder.
