const terms: Record<string, string> = {
  documentTotal: "total tertulis pada dokumen", documentTotalRupiah: "total tertulis pada dokumen",
  deduction: "potongan", deductionRupiah: "potongan", charges: "biaya tambahan", chargesRupiah: "biaya tambahan",
  itemName: "jenis ikan", weightValue: "berat", weightUnit: "satuan berat", weightKg: "berat dalam kg",
  unitPrice: "harga satuan", unitPriceRupiah: "harga per kg", subtotalRupiah: "subtotal baris",
  discountRupiah: "potongan baris", extractedDate: "tanggal dokumen",
};
const fieldName = new RegExp("\\b(" + Object.keys(terms).join("|") + ")\\b", "g");

// Translate derived messages at display time so old results and raw evidence stay intact.
export function reviewLanguage(message: string) {
  return message.replace(fieldName, key => terms[key]);
}
