# Seminar Registration with QR Tickets

A Flask web app for registering seminar attendees and issuing QR code tickets by email.

## Features

- Registration form with event name, date, and venue
- Browser and server validation (required fields, email format, PH mobile numbers)
- Duplicate email check and contact number normalization to +639XXXXXXXXX
- Attendee codes in the format SEM-2026-0001
- CSRF protection on form submissions
- QR code ticket generated for every new registration, with download button
- Ticket emailed through Gmail SMTP with the QR shown inline and attached as a PNG

## Setup

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Fill in `.env` (at minimum `SECRET_KEY`, `EVENT_NAME`, `EVENT_DATE`, `EVENT_VENUE`).

## Running the app

```bash
flask --app app init-db
flask --app app run
```

Open http://127.0.0.1:5000 to see the registration form.

## QR tickets

Each new registration gets a PNG ticket at `instance/qrcodes/<attendee_code>.png`.
The QR code holds the check-in URL `{PUBLIC_BASE_URL}/checkin/<ticket_token>`.
Set `PUBLIC_BASE_URL` to an address phones can reach (for example your LAN IP).

If you change `PUBLIC_BASE_URL`, rebuild the images:

```bash
flask --app app regenerate-qr
flask --app app regenerate-qr --code SEM-2026-0001
```

## Email delivery

Tickets are sent through Gmail SMTP (`smtp.gmail.com:465`, SSL) right after the QR is generated.
Sending is synchronous with a 15-second timeout, so the confirmation page can show whether
the email went out.

1. Turn on 2-Step Verification for the Gmail account, then create an App Password at
   https://myaccount.google.com/apppasswords.
2. In `.env`, set `MAIL_ENABLED=true`, `SMTP_USER` (the Gmail address), `SMTP_APP_PASSWORD`
   (the 16-character App Password), and `MAIL_FROM_NAME`.

With `MAIL_ENABLED=false` the email is written to the log instead of being sent.

## Running tests

The QR decoding tests need OpenCV, which is only a development dependency:

```bash
pip install -r requirements-dev.txt
pytest
```
