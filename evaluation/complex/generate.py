"""Create labeled synthetic source documents and Decimal-only reference data."""
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from xml.sax.saxutils import escape
import csv
import json
import subprocess

from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = Path(__file__).resolve().parent
WIDTH, HEIGHT = 794, 1123
D = Decimal
pdfmetrics.registerFont(TTFont("FieldArial", "C:/Windows/Fonts/arial.ttf"))
pdfmetrics.registerFont(TTFont("FieldArialBold", "C:/Windows/Fonts/arialbd.ttf"))

ROWS = [
    ("W01", "T01", "Teri", "12", "10", "25000"),
    ("W02", "TG01", "Tongkol", "8", "8", "30000"),
    ("W03", "KB01", "Kembung", "5.5", "5.5", "32000"),
    ("W04", "KP01", "Kakap", "3.25", "3.25", "75000"),
    ("W05", "TN01", "Tuna", "6.75", "6.75", "68000"),
    ("W06", "CK01", "Cakalang", "9.125", "9.125", "28000"),
    ("W07", "SL01", "Selar", "4.8", "4.8", "26000"),
    ("W08", "LY01", "Layang", "7.2", "7.2", "24000"),
    ("W09", "KR01", "Kurisi", "2.65", "2.65", "38000"),
    ("W10", "KU01", "Kerapu", "1.75", None, None),
    ("W11", "T02", "Teri", "4.5", "4.5", "27000"),
    ("W12", "TG02", "Tongkol", "2.25", "2.25", "31000"),
]


def kg(value):
    number = D(value)
    places = max(2, -number.as_tuple().exponent)
    return f"{number:.{places}f}".replace(".", ",")


def rp(value):
    return f"{int(value):,}".replace(",", ".")


weighing = []
receipt = []
pairs = []
for row_id, lot, name, weighed, sold, price in ROWS:
    weighing.append({"rowId": row_id, "lot": lot, "name": name, "weightKg": weighed, "printedWeight": kg(weighed), "unit": "kg"})
    if sold is None:
        continue
    receipt_id = f"R{len(receipt) + 1:02}"
    subtotal = (D(sold) * D(price)).quantize(D("1"), rounding=ROUND_HALF_UP)
    receipt.append({"rowId": receipt_id, "weighingRowId": row_id, "lot": lot, "name": name, "weightKg": sold, "printedWeight": kg(sold), "unit": "kg", "unitPriceRupiah": price, "subtotalRupiah": str(subtotal)})
    initial = D(weighed) - D(sold)
    adjustment = D("2") if row_id == "W01" else D("0")
    pairs.append({"weighingRowId": row_id, "receiptRowId": receipt_id, "lot": lot, "name": name, "initialDifferenceKg": str(initial), "userAdjustmentKg": str(adjustment), "remainingDifferenceKg": str(initial - adjustment)})

subtotal = sum((D(row["subtotalRupiah"]) for row in receipt), D("0"))
discount, fee = D("15000"), D("7500")
final = subtotal - discount + fee
groundtruth = {
    "datasetId": "BL-SINTETIS-KOMPLEKS-01", "synthetic": True,
    "originalDocumentsProvided": False, "date": "2026-11-17",
    "computation": "Python decimal.Decimal only; no application engine imported. Whole-Rupiah ROUND_HALF_UP per line.",
    "weighing": weighing, "receipt": receipt, "pairs": pairs,
    "unmatchedWeighingRows": ["W10"], "unmatchedReceiptRows": [],
    "distinctSpecies": 10,
    "totalWeighedKg": str(sum((D(row["weightKg"]) for row in weighing), D("0"))),
    "totalReceiptKg": str(sum((D(row["weightKg"]) for row in receipt), D("0"))),
    "subtotalRupiah": str(subtotal), "documentDiscountRupiah": str(discount),
    "documentFeeRupiah": str(fee), "documentFinalRupiah": str(final),
    "adjustmentExplanation": "Keterangan sintetis pengguna: 2 kg Teri lot T01 dibawa pulang.",
    "mockFaults": [{"document": "receipt", "rowId": "R03", "field": "weightKg", "mockValue": "5.05", "referenceValue": "5.5", "purpose": "Deliberate mock error to verify explicit human correction. Not an OCR observation."}],
}
ROOT.mkdir(parents=True, exist_ok=True)
(ROOT / "groundtruth.json").write_text(json.dumps(groundtruth, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
with (ROOT / "groundtruth-rows.csv").open("w", newline="", encoding="utf-8-sig") as stream:
    writer = csv.writer(stream)
    writer.writerow(["weighing_row", "receipt_row", "lot", "fish", "weighed_kg", "sold_kg", "price_rupiah", "line_subtotal_rupiah", "initial_difference_kg", "user_adjustment_kg", "remaining_difference_kg"])
    for row in weighing:
        sold = next((item for item in receipt if item["weighingRowId"] == row["rowId"]), None)
        pair = next((item for item in pairs if item["weighingRowId"] == row["rowId"]), None)
        writer.writerow([row["rowId"], sold["rowId"] if sold else "", row["lot"], row["name"], row["weightKg"], sold["weightKg"] if sold else "", sold["unitPriceRupiah"] if sold else "", sold["subtotalRupiah"] if sold else "", pair["initialDifferenceKg"] if pair else "", pair["userAdjustmentKg"] if pair else "", pair["remainingDifferenceKg"] if pair else ""])


class SourceDocument:
    def __init__(self, stem, variant=False):
        self.stem = stem
        self.variant = variant
        self.pdf = canvas.Canvas(str(ROOT / f"{stem}.pdf"), pagesize=A4)
        self.pdf.setTitle("SINTETIS - " + stem)
        self.pdf.setAuthor("BuktiLaut synthetic evaluation dataset")
        self.pdf.scale(A4[0] / WIDTH, A4[1] / HEIGHT)
        self.parts = []
        if variant:
            self.rect(0, 0, WIDTH, HEIGHT, "#dce3e8")
            self.rect(27, 31, 745, 1068, "#b1bcc4")
            self.pdf.saveState()
            self.pdf.translate(WIDTH / 2, HEIGHT / 2)
            self.pdf.rotate(1.2)
            self.pdf.scale(.94, .94)
            self.pdf.translate(-WIDTH / 2, -HEIGHT / 2)
            self.parts.append(f'<g transform="translate({WIDTH / 2} {HEIGHT / 2}) rotate(-1.2) scale(.94) translate({-WIDTH / 2} {-HEIGHT / 2})">')
        self.rect(0, 0, WIDTH, HEIGHT, "#ffffff")

    def rect(self, x, y, width, height, color):
        self.pdf.setFillColor(color)
        self.pdf.rect(x, HEIGHT - y - height, width, height, stroke=0, fill=1)
        self.parts.append(f'<rect x="{x}" y="{y}" width="{width}" height="{height}" fill="{color}"/>')

    def line(self, x1, y1, x2, y2, color="#c9d1d7", weight=.8):
        self.pdf.setStrokeColor(color)
        self.pdf.setLineWidth(weight)
        self.pdf.line(x1, HEIGHT - y1, x2, HEIGHT - y2)
        self.parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{weight}"/>')

    def text(self, x, y, value, size=16, bold=False, color="#172c3d", align="start"):
        self.pdf.setFillColor(color)
        self.pdf.setFont("FieldArialBold" if bold else "FieldArial", size)
        draw = self.pdf.drawRightString if align == "end" else self.pdf.drawString
        draw(x, HEIGHT - y, str(value))
        self.parts.append(f'<text x="{x}" y="{y}" font-family="Arial, sans-serif" font-size="{size}" font-weight="{700 if bold else 400}" fill="{color}" text-anchor="{align}">{escape(str(value))}</text>')

    def finish(self):
        if self.variant:
            for index in range(32):
                self.pdf.setFillColor("#23313a")
                self.pdf.setFillAlpha(.0025 * index)
                self.pdf.rect(550 + index * 7, 0, 7, HEIGHT, stroke=0, fill=1)
            self.pdf.setFillAlpha(1)
            self.parts.append('<rect x="550" y="0" width="244" height="1123" fill="url(#shadow)"/>')
            self.pdf.restoreState()
            self.parts.append('</g>')
        self.pdf.showPage()
        self.pdf.save()
        definitions = '<defs><linearGradient id="shadow"><stop offset="0" stop-color="#23313a" stop-opacity="0"/><stop offset="1" stop-color="#23313a" stop-opacity=".08"/></linearGradient></defs>'
        (ROOT / f"{self.stem}.svg").write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123" viewBox="0 0 794 1123">{definitions}' + "\n".join(self.parts) + '</svg>\n', encoding="utf-8")
        subprocess.run(["pdftoppm", "-r", "180", "-png", "-singlefile", str(ROOT / f"{self.stem}.pdf"), str(ROOT / self.stem)], check=True, capture_output=True)
        image = Image.open(ROOT / f"{self.stem}.png").convert("RGB")
        image.save(ROOT / f"{self.stem}.jpg", quality=91, optimize=True)
        for extension in ("png", "jpg"):
            path = ROOT / f"{self.stem}.{extension}"
            assert path.stat().st_size < 4 * 1024 * 1024
            assert image.width * image.height <= 20_000_000


def header(doc, title, subtitle):
    doc.rect(42, 40, 710, 10, "#103d65")
    doc.text(42, 87, title, 30, True)
    doc.rect(609, 62, 143, 36, "#fcece7")
    doc.text(623, 87, "SINTETIS", 21, True, "#8e332b")
    doc.text(42, 120, subtitle, 15, color="#526574")
    doc.line(42, 141, 752, 141)
    doc.text(42, 174, "No. referensi  SYN-PL-20261117-01", 16, True)
    doc.text(752, 174, "Tanggal  17/11/2026", 16, align="end")
    doc.text(42, 204, "Unit latihan  Meja Pesisir A | Transaksi uji yang sama", 15)
    doc.text(42, 232, "Berat dicatat dalam kilogram. Setiap lot merupakan baris terpisah.", 15)


def footer(doc):
    doc.line(42, 1007, 752, 1007)
    doc.text(42, 1038, "SINTETIS - Dokumen latihan. Bukan transaksi nyata.", 16, True, "#8e332b")
    doc.text(42, 1067, "Dibuat untuk evaluasi BuktiLaut. Tidak memakai data orang atau usaha nyata.", 13, color="#526574")
    doc.text(752, 1090, "1 / 1", 12, align="end")


for variant in (False, True):
    suffix = "tilt-shadow" if variant else "clear"
    doc = SourceDocument(f"SINTETIS-catatan-timbang-{suffix}", variant)
    header(doc, "CATATAN TIMBANG", "Pencatatan hasil timbang | Set latihan kompleks 01")
    doc.rect(42, 265, 710, 43, "#e8eef3")
    for x, value in [(55, "No."), (103, "Lot"), (200, "Jenis ikan"), (594, "Berat (kg)")]:
        doc.text(x, 292, value, 16, True)
    for index, item in enumerate(weighing):
        y = 337 + index * 39
        doc.text(55, y, index + 1, 16)
        doc.text(103, y, item["lot"], 16)
        doc.text(200, y, item["name"], 17)
        doc.text(709, y, item["printedWeight"], 17, align="end")
        doc.line(42, y + 13, 752, y + 13)
    doc.rect(42, 822, 710, 58, "#edf3f7")
    doc.text(58, 858, "TOTAL BERAT TIMBANG", 17, True)
    doc.text(729, 858, kg(groundtruth["totalWeighedKg"]) + " kg", 21, True, align="end")
    doc.text(42, 916, "Jumlah 12 baris | 10 jenis ikan | Teri dan Tongkol berasal dari dua lot.", 15)
    doc.text(42, 945, "Catatan petugas: pertahankan kode lot saat menyalin atau membandingkan nota.", 14)
    footer(doc)
    doc.finish()

    doc = SourceDocument(f"SINTETIS-nota-penjualan-{suffix}", variant)
    header(doc, "NOTA PENJUALAN", "Rincian penjualan | Set latihan kompleks 01")
    doc.rect(42, 265, 710, 51, "#e8eef3")
    for x, value, align in [(51, "No.", "start"), (91, "Lot", "start"), (168, "Jenis ikan", "start"), (442, "Kg", "end"), (591, "Harga/kg (Rp)", "end"), (738, "Subtotal (Rp)", "end")]:
        doc.text(x, 295, value, 14, True, align=align)
    for index, item in enumerate(receipt):
        y = 345 + index * 39
        for x, value, align in [(51, index + 1, "start"), (91, item["lot"], "start"), (168, item["name"], "start"), (442, item["printedWeight"], "end"), (591, rp(item["unitPriceRupiah"]), "end"), (738, rp(item["subtotalRupiah"]), "end")]:
            doc.text(x, y, value, 15, align=align)
        doc.line(42, y + 13, 752, y + 13)
    for y, label, value in [(815, "Subtotal item", subtotal), (851, "Potongan dokumen", discount), (887, "Biaya penanganan", fee)]:
        doc.text(365, y, label, 16)
        doc.text(738, y, "Rp" + rp(value), 17, align="end")
    doc.rect(346, 910, 406, 54, "#edf3f7")
    doc.text(365, 945, "TOTAL AKHIR", 19, True)
    doc.text(738, 945, "Rp" + rp(final), 22, True, align="end")
    doc.text(42, 988, "11 baris penjualan | Total berat nota " + kg(groundtruth["totalReceiptKg"]) + " kg", 14)
    footer(doc)
    doc.finish()

assets = []
for path in sorted(ROOT.glob("SINTETIS-*")):
    metadata = {"file": path.name, "bytes": path.stat().st_size, "synthetic": True}
    if path.suffix in (".png", ".jpg"):
        with Image.open(path) as image:
            metadata.update(width=image.width, height=image.height, megapixels=round(image.width * image.height / 1_000_000, 3))
    assets.append(metadata)
(ROOT / "manifest.json").write_text(json.dumps({"datasetId": groundtruth["datasetId"], "assets": assets}, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"weighingRows": len(weighing), "receiptRows": len(receipt), "species": 10, "subtotalRupiah": str(subtotal), "finalRupiah": str(final), "assets": len(assets)}))
