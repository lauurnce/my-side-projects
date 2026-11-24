import re

MAX_LENGTHS = {
    "full_name": 100,
    "email": 254,
    "organization": 150,
}

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PH_MOBILE_RE = re.compile(r"^(?:09|\+639)\d{9}$")

LABELS = {
    "full_name": "Full name",
    "email": "Email address",
    "organization": "Organization",
    "contact_number": "Contact number",
}


def normalize_phone(raw):
    cleaned = re.sub(r"[\s\-()]", "", raw or "")
    if not PH_MOBILE_RE.match(cleaned):
        return None
    return "+63" + cleaned[1:] if cleaned.startswith("0") else cleaned


def validate_registration(form):
    data = {key: (form.get(key) or "").strip() for key in LABELS}
    data["full_name"] = re.sub(r"\s+", " ", data["full_name"])
    errors = {}

    for key, label in LABELS.items():
        if not data[key]:
            errors[key] = f"{label} is required."

    for key, limit in MAX_LENGTHS.items():
        if key not in errors and len(data[key]) > limit:
            errors[key] = f"{LABELS[key]} must be at most {limit} characters."

    if "email" not in errors:
        data["email"] = data["email"].lower()
        if not EMAIL_RE.match(data["email"]):
            errors["email"] = "Enter a valid email address, like name@example.com."

    if "contact_number" not in errors:
        phone = normalize_phone(data["contact_number"])
        if phone is None:
            errors["contact_number"] = (
                "Enter a PH mobile number: 09XXXXXXXXX or +639XXXXXXXXX."
            )
        else:
            data["contact_number"] = phone

    return data, errors
