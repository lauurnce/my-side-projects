# Quadra

Quadra is a Flask web app for seminars and events: the landing page lists the upcoming events, people apply
for one on a form, staff accept or decline each application, accepted people get a QR code ticket
by email, and staff scan the tickets at the door to mark people as checked in. An event can also
accept everyone automatically.

It runs on a laptop with a SQLite file, and in production on Vercel with a Postgres database.

## Features by assignment part

| Part | What the app does | How it was verified |
| --- | --- | --- |
| 1. Registration Form | Landing page with every upcoming event, and a form per event. Browser and server validation, one registration per email per event, PH mobile numbers normalized to `+639XXXXXXXXX`, CSRF protection. Staff add, edit, publish, close and delete events from the dashboard, and accept or decline applications. A hidden trap field and a per-address limit slow down bots. | 326 automated tests. Three attendees registered through the form in Chrome. |
| 2. Database and QR Script | Each registration is saved to the database with an attendee code (`SEM-2026-0001`) and a random ticket token. A labeled QR ticket PNG is built in memory whenever it is shown, downloaded or emailed, so no ticket file is written to disk. | 64 automated tests (QR, database, migrations, time), including decoding each served QR back to its check-in URL. |
| 3. Automated Email | The ticket is emailed through Gmail SMTP when a person is accepted: QR shown in the body and attached as a PNG. A declined person gets a short email with no QR. Several emails go over one connection. Failures are recorded and never lose the registration or the decision. | 26 automated tests with a fake SMTP server. Real emails sent and received in a second Gmail account. |
| 4. Check-in Scanner | Each staff member signs in with their own email and password. Tickets are checked in by phone camera, laptop webcam, or USB barcode scanner. Admin dashboard with totals, search, manual check-in, resend email, and CSV export, each check-in marked with who did it. Owners invite and disable staff on a team page. | 239 automated tests (accounts, team, check-in, security headers, error pages). A ticket scanned with a phone camera, a webcam feed, and typed input. |

The full results are in [docs/TEST-REPORT.md](docs/TEST-REPORT.md).

## Architecture

```mermaid
flowchart LR
    attendee([Attendee browser]) -->|picks an event, fills form| routes[routes.py<br>landing, event pages]
    routes --> events[services/events.py]
    events --> db
    routes --> validation[validation.py]
    routes --> registration[services/registration.py]
    registration -->|insert row| db[(SQLite locally<br>Postgres in production)]
    routes -->|accepted at once| delivery[services/delivery.py<br>email batches]
    delivery --> mailer[services/mailer.py]
    mailer --> qr[services/qr.py<br>PNG built in memory]
    routes -->|GET /ticket/token.png| qr
    mailer -->|SMTP over SSL| gmail[Gmail]
    gmail -->|ticket email| inbox([Attendee inbox])

    inbox -.->|shows QR at the door| phone([Staff phone camera])
    phone -->|opens /checkin/token| staff[staff.py<br>scanner, admin]
    staff -->|who is signed in| accounts[accounts.py<br>login, team, passwords]
    accounts --> db
    accounts -->|invite and reset links| mailer
    laptop([Laptop webcam or USB scanner]) -->|POST /api/checkin| staff
    staff -->|accept, decline| review[services/review.py]
    review --> db
    staff -->|decision emails| delivery
    staff --> checkin[services/checkin.py]
    checkin -->|sets checked_in| db
    staff -->|totals, search, CSV| db
```

## Screenshots

Save your screenshots in `screenshots/` with these names and they will show up here.

| File | What to capture |
| --- | --- |
| `screenshots/01-registration-form.png` | The registration form |
| `screenshots/02-registration-confirmation.png` | The confirmation page with the QR ticket |
| `screenshots/03-database-row.png` | The attendee rows in the database |
| `screenshots/04-ticket-email.png` | The ticket email in the inbox |
| `screenshots/05-phone-checked-in.png` | The green check-in page on a phone |
| `screenshots/06-scanner-page.png` | The scanner page after a scan |
| `screenshots/07-admin-dashboard.png` | The admin dashboard |

![Registration form](screenshots/01-registration-form.png)
![Confirmation page](screenshots/02-registration-confirmation.png)
![Ticket email](screenshots/04-ticket-email.png)
![Phone check-in](screenshots/05-phone-checked-in.png)
![Admin dashboard](screenshots/07-admin-dashboard.png)

## Setup

Needs Python 3.11 or newer.

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

On Windows, activate with `venv\Scripts\activate` and copy with `copy .env.example .env`.

## The .env file

| Key | What it is for | Example |
| --- | --- | --- |
| `SECRET_KEY` | Signs the session cookie. Any long random text. | `f3a9...` |
| `PUBLIC_BASE_URL` | The address written into every QR code, invite and password link. Phones must be able to open it. | `http://192.168.1.23:5000` |
| `MAIL_ENABLED` | `true` sends real email. `false` writes the email to the log. | `true` |
| `SMTP_USER` | The Gmail address that sends the tickets. | `organizer@gmail.com` |
| `SMTP_APP_PASSWORD` | The 16-character Gmail App Password for that account. Spaces are fine. | `abcd efgh ijkl mnop` |
| `MAIL_FROM_NAME` | The sender name attendees see. | `Quadra` |
| `DATABASE_URL` | Postgres address for production. Leave empty to use the local SQLite file. | `postgresql://...` |
| `QUADRA_ENV` | Set to `production` on the live site. | `production` |
| `TRUSTED_PROXY_HOPS` | `1` on Vercel, otherwise leave empty. | `1` |
| `CONTACT_EMAIL` | Shown on the privacy notice as the address for privacy requests. Optional. | `organizers@example.com` |
| `GOOGLE_SITE_VERIFICATION` | The code Google Search Console gives you to prove you own the site. Optional. | `abc123...` |
| `EVENT_NAME` | Name of the first event, created by `init-db`. | `Tech Innovators Seminar 2026` |
| `EVENT_DATE` | Date of the first event, as `November 30, 2026` or `2026-11-30`. | `November 30, 2026` |
| `EVENT_VENUE` | Venue of the first event. | `PUP Main Campus, Manila` |

`.env` is ignored by git, so the mail password is never committed. Staff passwords are not in
`.env` at all: each person chooses their own and only a hash is stored in the database.

### Gmail App Password

1. Turn on 2-Step Verification for the Gmail account at https://myaccount.google.com/security.
2. Create an App Password at https://myaccount.google.com/apppasswords and copy the 16 characters.
3. Put the Gmail address in `SMTP_USER` and the App Password in `SMTP_APP_PASSWORD`.

## Running the app

```bash
flask --app app init-db
flask --app app run
```

Open http://127.0.0.1:5000 to see the landing page. `init-db` creates the first event from the
`EVENT_` keys in `.env`. It erases every event, attendee and staff account, so run it only once.

Nobody can sign in to the staff pages until the first owner exists:

```bash
flask --app app create-owner --email you@example.com --name "Your Name"
```

It prints a link that works once and lasts 72 hours. Open it to choose the password. See
[Staff accounts](#staff-accounts).

On macOS, AirPlay Receiver already uses port 5000. Add `--port 5001` to the run command and use
that port everywhere below.

| Command | What it does |
| --- | --- |
| `flask --app app init-db` | Creates the database and the first event. Erases existing data. |
| `flask --app app add-event --name "..." --date 2027-01-18 --venue "..."` | Adds another event that reviews applications. `--opens 2026-12-15` delays registration. `--accept-everyone` issues tickets at once instead. |
| `flask --app app create-owner --email you@example.com --name "Your Name"` | Creates an owner account and prints its one-time set-password link. Refuses an email that already has an account. |
| `flask --app app run` | Starts the app. |
| `flask --app app lan-url` | Prints the laptop's address on the local network. |
| `flask --app app resend-ticket --code SEM-2026-0001` | Emails one person their ticket, or their decline email, again. |

## Database and migrations

The app picks its database from one setting:

| `DATABASE_URL` | Database used |
| --- | --- |
| empty | SQLite file at `instance/seminar.db`. Nothing to install. |
| a Postgres address, e.g. `postgresql://user:password@host:6543/postgres` | That Postgres database, such as Supabase. |

The tables are built by numbered SQL files in `app/migrations/`, one folder per database:
`sqlite/0001_initial.sql` and `postgres/0001_initial.sql`. The `schema_migrations` table records
which files have already run.

| Command | What it does |
| --- | --- |
| `flask --app app migrate` | Runs the files that have not run yet and keeps every row. On a database with no events it also creates the first event from the `EVENT_` keys. Running it again changes nothing. |
| `flask --app app init-db` | Erases every table and rebuilds from the migrations. For a local SQLite file only: it stops with an error when `DATABASE_URL` is set. |
| `flask --app app init-db --force` | Erases the `DATABASE_URL` database too. |

For a hosted database, put its address in `DATABASE_URL` and run `migrate` once before the first
deploy and again after adding a migration. Never use `init-db` there.

To change the schema, add the next numbered file with the same name to both folders, for example
`0002_add_notes.sql`, then run `migrate`. Statements end with `;`. Never edit a file that has
already run.

Queries in the code use `%s` for values and plain SQL that both databases understand. Times are
saved in UTC as text like `2026-11-30T08:15:00+00:00` and shown in Manila time as
`Nov 30, 2026 4:15 PM`. Registration opens and closes by the Manila date.

On Postgres the migration turns on row level security for every table with no policies, so
Supabase's public API cannot read them. The app must connect as the role that ran `migrate`.

### Running the tests on Postgres

`pytest` uses a temporary SQLite file. To run the same tests on a real Postgres:

```bash
TEST_DATABASE_URL=pgserver pytest
```

`pgserver` comes with `requirements-dev.txt` and starts a throwaway Postgres for the run, so
nothing else needs installing. `TEST_DATABASE_URL` also accepts the address of a Postgres you
started yourself. Every test erases that database, so never point it at real data.

## Staff accounts

Every staff member has their own account and signs in at `/staff/login` with an email and a
password. There are two roles:

| Role | Can do |
| --- | --- |
| `admin` | Scan tickets, use the admin dashboard, add and manage events, change their own password. |
| `owner` | Everything an admin can, plus the team page. |

### The first owner

```bash
flask --app app create-owner --email you@example.com --name "Your Name"
```

The command creates the account without a password and prints a set-password link built from
`PUBLIC_BASE_URL`. The link works once and expires after 72 hours, so no password is ever typed
into a terminal or sent in a chat. If it expires, use "Forgot your password?" on the login page.
Run the command again with another email to add a second owner.

### Team management

Owners open `/staff/team` from the navigation bar. Admins who open it get a 403 page.

| Action | What happens |
| --- | --- |
| Invite an admin | Creates the account and emails a link that lasts 72 hours. The invited person sets their own name and password. |
| Resend invite | Emails a new link. The earlier link stops working. |
| Disable | The account is signed out on its next request and cannot sign in. Any unused link it had stops working. |
| Enable | The account can sign in again with its old password. |

An owner cannot disable their own account, and the last active owner cannot be disabled. Roles are
not changed from the page.

With `MAIL_ENABLED=false` on a laptop, the set-password link is written to the log so it can be
copied from there. The email body itself is never logged. In production mode (`QUADRA_ENV=production`)
with mail off, no invite or reset link is created at all, so a link never reaches the server
log: the team page says the invite could not be sent, and "Forgot your password?" gives its usual
answer. `create-owner` always prints its link, because that is the command's purpose.

### Passwords and sign-in rules

- Passwords need at least 10 characters and are stored as scrypt hashes.
- Emails are matched without regard to case.
- `/staff/account` changes your own password after asking for the current one. Changing it, or
  setting a new one from an emailed link, signs that account out everywhere else.
- "Forgot your password?" emails a link that works once and lasts 1 hour. The page answers the
  same way whether or not the email has an account, always takes at least 6 seconds to answer so
  the wait gives nothing away, and sends at most one email every 5 minutes per account.
- Only a hash of each link's token is stored. A used or expired link shows "This link no longer
  works".
- Five failed logins for an email from one network address lock that email for that address for
  15 minutes. Someone guessing from elsewhere cannot lock the real person out of their own
  connection. An IPv6 address counts as its whole /64 network, so one subscriber cannot dodge
  the limit by switching addresses.
- Twenty failed logins for an email within 15 minutes, counted across every address, lock that
  email everywhere for 15 minutes. Setting a new password from an emailed link clears the lock.
- Both locks apply whether or not the email has an account. A wrong password, an unknown email
  and a disabled account all get the same answer. The counts live in the database, so they hold
  across serverless instances and restarts, and rows older than 15 minutes are removed.
- Every staff request checks that the account still exists and is active.
- Logging out signs that account out on every device, so a copied session cookie stops working.

The dashboard table and the CSV export show who checked each attendee in, and the database
records who added each event and who last changed it.

## Managing events

Any signed-in staff account, owner or admin, manages events from `/admin`. Pick an event in the
switcher at the top: drafts and past events stay in the list, labelled `Draft` and `Past`. The
panel under it shows the event's state and these buttons:

| Button | What it does |
| --- | --- |
| Edit | Changes the name, venue, event date, the date registration opens, and whether applications are reviewed. Clearing the opening date opens registration right away. The rules are the same as for adding an event. The link `/events/<slug>` never changes, even when the name does. The page also shows who created the event and who last changed it. |
| View page / Preview page | Opens the public page. For a draft only signed-in staff can open it, and it carries a draft notice. |
| Publish / Unpublish | A draft is hidden from visitors: it is not on the landing page, and its page and its registration address answer 404. |
| Close registration / Reopen registration | A closed event still shows publicly, marked "Registration closed", with no form. Reopening hands control back to the dates. |
| Delete | Asks for confirmation on its own page. Only an event with no registrations can be deleted. Once anyone has registered, unpublish it or close registration instead. |

"Add an event" has two buttons: "Add and publish" and "Save as draft".

An event is in exactly one state. The first rule that matches wins:

| Order | State | When | Visitors can register |
| --- | --- | --- | --- |
| 1 | Ended | The event date has passed. | No |
| 2 | Draft | It is not published. | No, and they cannot see it |
| 3 | Registration closed | Staff closed registration. | No |
| 4 | Opens later | The opening date has not arrived. | No |
| 5 | Registration open | None of the above. | Yes |

Unpublishing or closing an event never touches the people already registered. Their tickets
still open, still scan, and still appear on the dashboard and in the CSV export.

## Reviewing applications

Each event either reviews applications or accepts everyone automatically. The choice is made in
"Add an event" and can be changed on the Edit page. New events review applications, including the
first event created from `.env` and events added with `add-event` (pass `--accept-everyone` for
the other mode). Events that existed before this feature keep accepting everyone.

| | Review applications | Accept everyone automatically |
| --- | --- | --- |
| After the form is sent | The application is `pending`. No ticket, no QR code and no email. | The registration is `accepted` at once and the ticket is emailed, as before. |
| What the applicant sees | "Application received", under review, and a private status link. | The ticket page with the QR code and the same private status link. |
| Who decides | A staff member, recorded with the time. | Nobody. The dashboard shows "Automatic". |

An application is in one of three states: `pending`, `accepted` or `declined`.

- Staff can accept or decline a pending application, accept a declined one later, and decline an
  accepted one later. Nothing goes back to pending.
- Accepting sends the ticket email. Declining sends a short decline email with no QR code.
- Declining an accepted application stops its ticket: the QR image answers 404 and every check-in
  path refuses it.
- Someone who is already checked in cannot be declined. They are in the room, so the attendance
  record stays as it is and the dashboard says they were left alone.
- Deciding the same way twice changes nothing and sends nothing, so two staff members clicking
  Accept on the same person produce one email.
- Switching an event between the two modes never changes a decision already made. Applications
  that are still pending when an event is switched to automatic stay pending until staff accept
  or decline them, and "Accept all pending" clears them in one click. Only people who register
  after the switch are accepted automatically.

### What the applicant sees

No email is sent when someone applies to a review event. Otherwise a stranger could use the form
to send mail to other people's addresses. The page shown after applying carries a private status
link, `/application/<token>`, with a random 43-character token that is separate from the ticket
token. It shows pending, accepted (with the ticket and its download) or declined, and it is
repeated in both decision emails. The "My registration" link in the navigation opens the same page
for the browser that applied.

### On the dashboard

For the selected event the dashboard shows how many applications are in each state, and each
count is a filter that combines with the search box. Each row has Accept and Decline buttons, and
ticking rows enables "Accept selected" and "Decline selected". "Accept all pending" and "Decline
all pending" decide every pending application of the event, not only the rows on screen. The
table shows who decided and when, and the CSV export has `state`, `decided_at` and `decided_by`
columns. Ticking rows and the buttons work without JavaScript. The select-all box needs it.

### Decision emails are sent in batches

Opening a connection to Gmail takes about 4 seconds, so a decision request opens one connection
and sends up to 25 emails over it (`EMAIL_BATCH_SIZE` in `app/services/delivery.py`). It also
stops starting new emails after 45 seconds (`EMAIL_BATCH_SECONDS`). Everything else stays marked
as waiting, and a bar on the dashboard shows how many emails are waiting and how many failed,
with "Send next batch" and "Retry failed" buttons. Accepting 40 people decides all 40 at once,
emails 25, and leaves 15 for the next click.

Each application's email is in one state: `none` (nothing owed), `pending` (waiting), `sending`,
`sent` or `failed`. Which email is owed follows the application's state: the ticket for accepted,
the decline email for declined.

- A batch first claims its emails in the database, then sends them. A second request arriving at
  the same moment finds nothing left to claim, so nobody gets the same email from two requests.
- A failure for one person is recorded for that person and the batch continues. If the connection
  itself fails, the whole batch is marked failed. The decision is saved before any email is tried
  and is never undone by a mail failure.
- Changing a decision resets that person's email to waiting and cancels any claim on it. The
  sender checks the claim again right before each email, so the email for the old decision is
  not sent, even in the middle of a batch.
- If the server is stopped in the middle of a batch, the emails it had claimed stay `sending`.
  After 10 minutes they count as failed and only "Retry failed" sends them, because the app
  cannot know whether Gmail already delivered them.
- "Resend email" on a row sends that person's current email again on purpose.

### Protection against form abuse

- The form has a hidden field that people never see and bots tend to fill. A submission with it
  filled in creates nothing and gets a general "could not submit" message.
- One client address may create 30 applications per hour across all events
  (`MAX_APPLICATIONS_PER_ADDRESS` and `APPLICATION_WINDOW` in `app/services/registration.py`).
  The count is kept in the database because instances share no memory, and it uses the same
  address rules as the login lock: IPv6 addresses are grouped by their /64 network. The next
  application gets a 429 page and creates nothing. Invalid and duplicate submissions do not count.

## Event day check-in

Staff sign in at `/staff/login` with their own account.

| Page | What it does |
| --- | --- |
| `/checkin/<ticket_token>` | Opens when a phone camera reads a ticket. Green means checked in, amber means already checked in, red means invalid ticket, black means not accepted. |
| `/scanner` | Scans with the laptop or tablet camera, and takes input from a USB barcode scanner. Shows the same four colours, and "not accepted" sounds three short beeps. |
| `/admin` | One event at a time: totals, search, accept and decline, manual check-in, resend email, CSV export. Also adds, edits, publishes, closes and deletes events. |

The first check-in time is kept. Scanning the same ticket again never overwrites it.

Only an accepted application can be checked in, on the ticket link, the scanner and the dashboard
button alike. A pending or declined ticket shows "NOT ACCEPTED" with the person's name and whether
the application is still under review or was declined, and it is not checked in.

### Option A: phones on the same Wi-Fi or hotspot

```bash
flask --app app lan-url
flask --app app run --host 0.0.0.0
```

`lan-url` prints the laptop's address, for example `http://192.168.1.23:5000`. Put it in
`PUBLIC_BASE_URL` and restart the app. Ticket images are built on request, so the confirmation
page and ticket downloads use the new address within five minutes. Tickets already emailed keep
the old address, so resend those:

```bash
flask --app app resend-ticket --code SEM-2026-0001
```

If the phone cannot open the address, allow incoming connections for Python in the firewall
(macOS: System Settings > Network > Firewall; Windows: allow Python on private networks).

On plain `http`, phone browsers block the camera, so `/scanner` works on the laptop only. Phones
can still check people in by scanning the ticket with the phone's own camera app.

### Option B: a tunnel, when the network blocks phone-to-laptop traffic

School and office Wi-Fi often isolate devices. Use a Cloudflare quick tunnel instead:

```bash
cloudflared tunnel --url http://localhost:5000
```

Set `PUBLIC_BASE_URL` to the `https://...trycloudflare.com` address it prints, restart the app,
then resend tickets as above. Over `https` the `/scanner` camera also works on a phone.

## Deploying

### Production settings

Set these wherever the app is hosted. Local development needs none of them.

| Key | Value | What it does |
| --- | --- | --- |
| `QUADRA_ENV` | `production` | Turns on production mode. The app refuses to start while `SECRET_KEY` is empty or still the built-in development key, the session cookie is marked `Secure`, and every response carries `Strict-Transport-Security`. |
| `SECRET_KEY` | Long random text, for example from `python -c "import secrets; print(secrets.token_urlsafe(48))"` | Signs the session cookie. |
| `TRUSTED_PROXY_HOPS` | `1` on Vercel, `0` (the default) when nothing sits in front of the app | How many proxies in front of the app may say who the visitor is. With `1`, the last `X-Forwarded-For` address and `X-Forwarded-Proto` are believed, so the login lock counts the real visitor's address and the app knows the request came over `https`. |
| `PUBLIC_BASE_URL` | The public `https://` address | Written into every QR code. |

Leave `TRUSTED_PROXY_HOPS` at `0` unless a proxy you control overwrites `X-Forwarded-For`. With a
number above zero and no such proxy, a visitor can send a made-up address and slip past the
per-address login lock. Vercel overwrites the header with the visitor's public address and does not pass
on values sent by the client, which is why `1` is safe there
([Vercel request headers](https://vercel.com/docs/headers/request-headers#x-forwarded-for)).

In every mode the session cookie is `HttpOnly` and `SameSite=Lax` and lasts 12 hours from the last
request, and every response carries `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
`Permissions-Policy` (camera for this site only) and a `Content-Security-Policy`. The policy allows
scripts from this site and `html5-qrcode` 2.3.8 on unpkg, styles from this site and Google Fonts,
fonts from Google Fonts, and images from this site. A page that loads anything else needs the
policy in `app/security.py` updated.

### Vercel

1. Import the repository in Vercel and set the project's Root Directory to `quadra`.
2. Keep the detected Flask preset. Vercel finds the `app` object in `wsgi.py`, installs
   `requirements.txt` and sends every request to the app, which also serves `/static`. There is no
   build command and no `vercel.json`.
3. Add the keys from the table above and the mail and event keys from the `.env` section as
   Environment Variables for Production.
4. With `DATABASE_URL` and `PUBLIC_BASE_URL` set to the production values on your laptop, run
   `flask --app app migrate` and then `flask --app app create-owner` once, and open the link it
   prints.

When a release adds a migration, run `flask --app app migrate` against the production database
before deploying the new code. The migrations only add columns and tables with defaults, so the
old code keeps working on the migrated database until the deploy finishes, while the new code
fails on a database that has not been migrated.

`.vercelignore` keeps the tests, docs, screenshots and `requirements-dev.txt` out of the upload, so
only the runtime packages are installed.

Platform limits that matter here:

- The filesystem is read-only apart from 500 MB of `/tmp`, which belongs to one instance and is
  lost when it stops. A SQLite file cannot live there, so the database needs hosted storage
  before the app can run on Vercel
  ([runtimes](https://vercel.com/docs/functions/runtimes#file-system-support)).
- A request may run for 300 seconds on the Hobby plan, far above the 15 second mail timeout
  ([limits](https://vercel.com/docs/functions/limitations#max-duration)).
- Outbound SMTP is open on ports 465 and 587 and blocked on port 25, so Gmail on 465 is allowed
  ([SMTP guide](https://vercel.com/kb/guide/serverless-functions-and-smtp)).
- Request bodies are limited to 4.5 MB, well above any form here
  ([limits](https://vercel.com/docs/functions/limitations#request-body-size)).
- An instance that has been idle starts cold, and a function unused for two weeks is archived and
  takes at least a second longer on its next request
  ([runtimes](https://vercel.com/docs/functions/runtimes#archiving)).
- Instances share no memory, so failed logins are counted in the database and the signed-in
  account is read from the database on every staff request.

## Search engines and privacy

### Being found

| What | Where | Notes |
| --- | --- | --- |
| Sitemap | `/sitemap.xml` | The landing page, the privacy notice, and every published event that has not ended. |
| Robots file | `/robots.txt` | Points to the sitemap and closes the staff, ticket and status pages. |
| Search snippet | every page | A title, a description and a canonical address built from `PUBLIC_BASE_URL`. |
| Share preview | every page | Title, description and one image (`app/static/share.png`) for link previews. |
| Event details | each event page | The name, date and venue as schema.org `Event` data. |

Staff pages, ticket images, private status pages and error pages carry `X-Robots-Tag: noindex`,
so they stay out of search results even if someone links to them.

To submit the site to Google:

1. Open Google Search Console and add the site as a URL-prefix property.
2. Choose the HTML tag method and copy the code inside `content="..."`.
3. Set `GOOGLE_SITE_VERIFICATION` to that code, deploy, and press Verify.
4. Under Sitemaps, submit `sitemap.xml`.

Google decides when pages appear. It usually takes days to weeks.

### Privacy notice and consent

`/privacy` says what is collected, why, who can see it and how to ask for a correction or
deletion. It is linked from every page. Set `CONTACT_EMAIL` so the notice names an address.

The registration form has a required box agreeing to that notice. The server refuses a
registration without it, and stores the time of agreement in `consented_at`, which the CSV
export includes. Registrations made before this was added have no time.

## Running tests

```bash
pip install -r requirements-dev.txt
pytest
ruff check .
```

There are 694 tests. They use a temporary database, never send real email and never wait.

## Project structure

```
quadra/
├── app/
│   ├── __init__.py          app factory
│   ├── config.py            settings read from .env
│   ├── db.py                SQLite or Postgres connection, migrate, init-db
│   ├── migrations/          numbered schema changes for each database
│   ├── clock.py             UTC timestamps shown in Manila time
│   ├── security.py          production mode, cookies, security headers
│   ├── errors.py            error pages
│   ├── seo.py               sitemap, robots file, share preview and structured data
│   ├── csrf.py              CSRF token check
│   ├── validation.py        form validation and phone normalization
│   ├── routes.py            landing page, event pages, status page, ticket image
│   ├── accounts.py          login, logout, password links, account page, team page
│   ├── staff.py             check-in, scanner, admin, review, event management, CSV export
│   ├── commands.py          resend-ticket, add-event, create-owner, lan-url
│   ├── services/
│   │   ├── events.py        events, dates, the five event states, edit and delete
│   │   ├── registration.py  create an application, applications-per-address limit
│   │   ├── review.py        accept and decline
│   │   ├── delivery.py      decision emails in batches, claims, retries
│   │   ├── qr.py            QR ticket image, built in memory
│   │   ├── accounts.py      staff accounts, passwords, lockout, one-time links
│   │   ├── mailer.py        ticket, decline, invite and password emails over Gmail SMTP
│   │   └── checkin.py       check-in, totals, search
│   ├── templates/           pages and the ticket, decline, invite and password emails
│   └── static/              stylesheet, form, event filter, select-all and scanner scripts
├── tests/                   pytest suite
├── docs/TEST-REPORT.md      verification results
├── screenshots/             screenshots for this README and the report
├── requirements.txt         runtime packages
├── requirements-dev.txt     test and lint packages
└── .env.example             the keys .env needs
```

## Known limitations

- `flask run` is Flask's development server and is for a laptop only. The public site runs on
  Vercel, which has not been deployed yet.
- On an event that accepts everyone, email is sent while the attendee waits, so registering
  takes about 4 seconds. A slow network can make it take up to 15.
- A free Gmail account can send about 500 emails a day. The app does not count them, so on a big
  event send decision emails over more than one day.
- Decision emails go out only when a staff member clicks. Nothing sends the waiting ones in the
  background, so check the email bar on the dashboard after a large batch.
- If the server stops between Gmail accepting an email and the app recording it, that email shows
  as failed after 10 minutes, and "Retry failed" then delivers a second copy.
- An applicant who loses the status link has no way to get it back before a decision, because no
  email is sent when applying. Staff can still see the application on the dashboard.
- A decision cannot be undone back to pending, and declining is not confirmed on a second page.
  "Decline all pending" emails every pending applicant with one click.
- A whole campus or mobile network can share one address, so the limit of 30 applications per
  hour per address can turn real people away during a rush. Raise
  `MAX_APPLICATIONS_PER_ADDRESS` if that happens.
- Attendees who registered before review existed with email switched off are not queued for a
  ticket email. "Resend email" sends theirs.
- A ticket sent to the sending Gmail account itself lands in Sent, not the inbox.
- The scanner page loads `html5-qrcode` 2.3.8 from unpkg, so the laptop needs internet access for
  camera scanning. The typed and USB scanner input works without it.
- Phone browsers only allow the camera over `https`, so `/scanner` on a phone needs the tunnel.
- Someone guessing from at least four addresses can still reach the twenty-failure limit and lock
  an email everywhere for 15 minutes. A password link from "Forgot your password?" lifts it.
- "Forgot your password?" always takes at least 6 seconds, and longer when the mail server needs
  more than that.
- Logging out on one device signs the same account out on the others.
- There is no two-step sign-in. Accounts can be disabled but not deleted, and roles cannot be
  changed from the team page. Another owner is added with `create-owner`.
- Check-ins and events from before staff accounts existed have no recorded person.
- A check-in cannot be undone from the dashboard.
- A registration cannot be deleted from the dashboard. A deletion request under the privacy
  notice has to be carried out in the database by the owner.
- The privacy notice is written in plain language and has not been reviewed by a lawyer.
- An event with registrations cannot be deleted, only unpublished or closed.
- The event link is set when the event is added and cannot be changed afterwards.
- Only the latest change to an event is recorded, not the full history.
- `add-event` on the command line always publishes the event.
- With `MAIL_ENABLED=false` decision emails are logged (recipient and subject only) and stay
  marked as waiting.
- The pages load their fonts from Google Fonts and fall back to system fonts offline.
