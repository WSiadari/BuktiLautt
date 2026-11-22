export const SIMULATION_DELAY = 1400;
export const SIMULATION_RESULT =
  "Simulasi selesai. Ini usulan dari data contoh, bukan pembacaan AI nyata. Tinjau setiap nilai.";
export type SimulationOutcome =
  "success" | "partial" | "empty" | "timeout" | "quota" | "invalid";
export function simulationMessage(outcome: SimulationOutcome): string {
  return {
    success: SIMULATION_RESULT,
    partial:
      "Simulasi hasil sebagian: beberapa nilai belum diketahui. Isian dan koreksi Anda tetap dipertahankan. Tinjau sumber, lalu lengkapi manual.",
    empty:
      "Simulasi tanpa baris terbaca. Tidak ada hasil baru yang diterapkan. Sumber dan isian Anda tetap tersedia; coba ulangi atau isi manual.",
    timeout:
      "Simulasi waktu tunggu habis. Tidak ada hasil baru yang diterapkan. Coba baca lagi atau lanjutkan isi manual.",
    quota:
      "Simulasi batas layanan tercapai. Tidak ada hasil baru yang diterapkan. Gunakan isi manual atau coba kembali nanti.",
    invalid:
      "Simulasi hasil tidak valid. Hasil ditolak dan isian Anda tetap utuh. Coba baca lagi atau isi manual.",
  }[outcome];
}
export type ScriptedContext = {
  weights: string;
  receipt: string;
  nextStep: string;
};
export function scriptedReply(
  question: string,
  context?: ScriptedContext,
): string {
  if (/selisih|berat|pasang|penyesuaian|sisa|kg/i.test(question) && context)
    return `${context.weights} ${context.nextStep} Saya hanya menjelaskan; perubahan dan konfirmasi tetap melalui form pemeriksaan.`;
  if (/harga|total|rupiah|potongan|biaya/i.test(question) && context)
    return `${context.receipt} Hitungan Rupiah terpisah dari selisih berat. ${context.nextStep}`;
  if (/selisih|2|berat/i.test(question) && !context)
    return "Selisih dihitung dari berat timbang dikurangi berat nota pada pasangan yang dikonfirmasi. Dalam contoh Teri: 12 − 10 = 2 kg. Jika 2 kg tidak terjual, catat penyesuaian beserta alasan Anda. Mengetik penyesuaian belum mengubah laporan sampai berhasil disimpan.";
  if (/ai|baca|manual/i.test(question))
    return "Pembacaan AI belum terhubung pada prototipe ini. Gunakan sumber foto atau teks dan isi manual. Data contoh memakai simulasi yang diberi label. Usulan selalu perlu Anda tinjau dan konfirmasikan.";
  return `${context ? context.nextStep + " " : "Mulai dari sumber asli, tinjau isian, lalu konfirmasikan setiap pasangan. "}Saya dapat membantu menjelaskan langkah, tetapi tidak mengubah atau mengonfirmasi data Anda. Periksa rincian melalui tombol Lihat sumber.`;
}
