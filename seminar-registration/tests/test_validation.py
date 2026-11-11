import pytest

from app.validation import normalize_phone


@pytest.mark.parametrize("raw", ["09171234567", "+639171234567", "0917 123 4567", "(0917) 123-4567"])
def test_normalize_phone_accepts_local_and_international_formats(raw):
    assert normalize_phone(raw) == "+639171234567"


@pytest.mark.parametrize("raw", ["", None, "9171234567", "639171234567", "+63917123456", "0917123456a"])
def test_normalize_phone_rejects_invalid_numbers(raw):
    assert normalize_phone(raw) is None
