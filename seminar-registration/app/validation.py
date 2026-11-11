import re

MAX_LENGTHS = {
    "full_name": 100,
    "email": 254,
    "organization": 150,
}

LABELS = {
    "full_name": "Full name",
    "email": "Email address",
    "organization": "Organization",
    "contact_number": "Contact number",
}


def validate_registration(form):
    """Trim and validate form input. Returns (clean_data, errors)."""
    data = {key: (form.get(key) or "").strip() for key in LABELS}
    data["full_name"] = re.sub(r"\s+", " ", data["full_name"])
    errors = {}

    for key, label in LABELS.items():
        if not data[key]:
            errors[key] = f"{label} is required."

    for key, limit in MAX_LENGTHS.items():
        if key not in errors and len(data[key]) > limit:
            errors[key] = f"{LABELS[key]} must be at most {limit} characters."

    return data, errors
