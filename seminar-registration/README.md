# Seminar Registration with QR Tickets

A Flask web app for registering seminar attendees and issuing QR code tickets by email.

## Features

- Registration form with event name, date, and venue
- Browser and server validation (required fields, email format, PH mobile numbers)
- Duplicate email check and contact number normalization to +639XXXXXXXXX
- Attendee codes in the format SEM-2026-0001
- CSRF protection on form submissions
- QR code ticket generated for every new registration, with download button

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

## Running tests

```bash
pytest
```
