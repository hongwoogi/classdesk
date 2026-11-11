#!/usr/bin/env python3
"""Draw the original ClassDesk book/chalkboard mark (GPL-3.0).

No upstream icon, font, external image, or trademark asset is used.
Requires Pillow; writes host/ClassDesk.ico at multiple Windows resolutions.
"""
from pathlib import Path
from PIL import Image, ImageDraw

image = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((12, 12, 244, 244), radius=48, fill="#12675d")
draw.rounded_rectangle((30, 32, 226, 184), radius=20, fill="#d7b07b")
draw.rounded_rectangle((40, 42, 216, 174), radius=12, fill="#153f3a")
draw.line((62, 72, 151, 72), fill="#d7e9dd", width=8)
draw.line((62, 95, 124, 95), fill="#a9cbb8", width=7)
draw.line((171, 138, 193, 115), fill="#fff3cc", width=8)
# Open book: the center fold and asymmetric page edges are the identifying mark.
draw.polygon(((55, 139), (87, 131), (128, 143), (128, 215), (88, 202), (55, 209)), fill="#fff5dc")
draw.polygon(((128, 143), (169, 131), (201, 139), (201, 209), (168, 202), (128, 215)), fill="#ffe1a1")
draw.line((128, 145, 128, 212), fill="#c79a60", width=5)
draw.line((69, 155, 101, 150), fill="#acb9a4", width=4)
draw.line((69, 170, 108, 166), fill="#acb9a4", width=4)
draw.line((150, 155, 187, 150), fill="#c7a76a", width=4)
draw.line((150, 171, 187, 166), fill="#c7a76a", width=4)
output = Path(__file__).resolve().parents[1] / "host" / "ClassDesk.ico"
image.save(output, format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(output)
