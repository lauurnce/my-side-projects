import qrcode
from flask import current_app
from PIL import Image, ImageDraw, ImageFont
from qrcode.constants import ERROR_CORRECT_Q

BOX_SIZE = 10
BORDER = 4  # quiet zone in modules, the minimum the QR spec asks for
LABEL_FONT_SIZE = 32
LABEL_PADDING = 16
FONT_NAMES = ("DejaVuSans-Bold.ttf", "arialbd.ttf", "Arial Bold.ttf")


def checkin_url(ticket_token):
    """Return the URL encoded in an attendee's ticket QR code."""
    base = current_app.config["PUBLIC_BASE_URL"].rstrip("/")
    return f"{base}/checkin/{ticket_token}"


def build_qr_image(data):
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_Q, box_size=BOX_SIZE, border=BORDER)
    qr.add_data(data)
    qr.make(fit=True)
    return qr.make_image(fill_color="black", back_color="white").convert("RGB")


def load_font(size=LABEL_FONT_SIZE):
    for name in FONT_NAMES:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow older than 10.1
        return ImageFont.load_default()


def add_label(image, text):
    """Return a new image with the text centered under the QR code."""
    font = load_font()
    left, top, right, bottom = ImageDraw.Draw(image).textbbox((0, 0), text, font=font)
    text_width, text_height = right - left, bottom - top
    canvas = Image.new("RGB", (image.width, image.height + text_height + LABEL_PADDING * 2), "white")
    canvas.paste(image, (0, 0))
    x = (image.width - text_width) // 2 - left
    y = image.height + LABEL_PADDING - top
    ImageDraw.Draw(canvas).text((x, y), text, fill="black", font=font)
    return canvas
