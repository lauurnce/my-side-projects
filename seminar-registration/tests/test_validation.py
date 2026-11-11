import pytest

from app.validation import normalize_phone


@pytest.mark.parametrize("raw", ["09171234567", "+639171234567", "0917 123 4567", "(0917) 123-4567"])
def test_normalize_phone_accepts_local_and_international_formats(raw):
    assert normalize_phone(raw) == "+639171234567"
