# Seminar Registration with QR Tickets

A Flask web app for registering seminar attendees and issuing QR code tickets by email.

## Features

- Registration form with event name, date, and venue
- Browser and server validation (required fields, email format, PH mobile numbers)
- Duplicate email check and contact number normalization to +639XXXXXXXXX
- Attendee codes in the format SEM-2026-0001
- CSRF protection on form submissions
