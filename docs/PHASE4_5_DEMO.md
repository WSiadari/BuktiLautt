# Demonstrasi Ombak Pintar sebelum dan sesudah penyesuaian

Skenario demo Phase 4.5; hasil pengujiannya ada di [history/PHASE4_5_VALIDATION.md](history/PHASE4_5_VALIDATION.md). Sejak Phase 4.7 Ombak Pintar juga membaca arsip; kontrak terbaru ada di [PHASE4_7_AGENT.md](PHASE4_7_AGENT.md).

## Siapkan aplikasi

Pertahankan .env yang sudah digunakan, jangan menimpanya dengan contoh kosong. Restart API dan frontend dari source terbaru pada dua terminal: `npm run api`, lalu `npm run dev`. Jika port 5173 dipakai proses lama, tutup proses lama terlebih dahulu. Gunakan origin browser yang sama agar draf IndexedDB ditemukan. Tanpa kredensial server, gunakan Panduan dasar; respons ini tidak boleh dianggap jawaban Gemini.

## Sebelum penyesuaian

1. Buat pemeriksaan sintetis melalui foto `evaluation/01-clear-weighing.png` dan `evaluation/02-clear-receipt.png`, tinjau setiap usulan, tambahkan dan konfirmasikan kedua sumber. Pastikan Teri 12 kg pada timbang, Teri 10 kg pada nota, Tongkol 8 kg di kedua sumber. Konfirmasikan nilai potongan dan biaya 0 secara eksplisit untuk total Rp490.000.
2. Pada Pemeriksaan, konfirmasikan pasangan Teri dan Tongkol. Pastikan Teri menampilkan selisih awal 2 kg.
3. Buka Ombak Pintar pada Pemeriksaan. Pilih pintasan penjelasan temuan Teri atau kirim “Kenapa Teri selisih 2 kg?”. Tidak ada panggilan Gemini hanya karena membuka draf.
4. Jawaban harus mengacu pada ID temuan dan revisi aktif: 12 kg dari Catatan Timbang, 10 kg dari Nota Penjualan, 2 kg selisih terbuka. Sebabnya belum dicatat; jangan menganggap selisih membuktikan kerugian, pembayaran atau kecurangan.
5. Gunakan kontrol sumber untuk memeriksa bukti. Tombol menuju penyesuaian hanya membuka form; agen tidak mengisi atau menyimpannya sendiri.

## Sesudah penyesuaian

1. Melalui form penyesuaian yang sudah ada, masukkan Tidak terjual 2 kg beserta keterangan sintetis, misalnya Dibawa pulang. Simpan dan tunggu status tersimpan.
2. Kirim pertanyaan baru atau pilih penjelasan temuan yang sama. Periksa revisi terbaru: selisih awal 2 kg, penyesuaian tercatat 2 kg, sisa 0 kg. Berat asli 12 kg dan 10 kg tetap tampak.
3. Jawaban lama harus diberi label revisi terdahulu. Respons yang datang terlambat setelah ganti revisi/draf tidak boleh tampil sebagai jawaban saat ini.
4. Buka laporan dan simpan PDF. Total nota tetap Rp490.000; pertanyaan chat tidak mengubah draf, angka sumber, konfirmasi atau PDF. Penyesuaian berasal dari tindakan simpan pengguna.

## Pemulihan dan batas

- Saat server tidak tersedia, periksa galat dan tombol coba lagi; **Panduan dasar** tetap tersedia dan jelas terpisah dari Gemini.
- Dua baris bernama Teri harus dibedakan lewat ID/nomor temuan. Jangan menerima pemilihan salah satu baris tanpa konteks yang cukup.
- Pasangan belum dikonfirmasi/tanpa pasangan tidak boleh mendapat selisih pasti. Ikuti tautan menuju temuan dan konfirmasikan secara manual bila sesuai.
- Pada HP, periksa input, pengiriman, gulir panel, label revisi dan kontrol sumber/penyesuaian. Emulasi browser bukan bukti HP fisik.
- Chat menggunakan konteks minimum pemeriksaan aktif, bukan foto/audio/transkrip atau data pemeriksaan lain. Hanya alat baca yang tersedia; tidak ada alat tulis.

Uji live harus mencatat model, ID/revisi sintetis, jawaban dan nama tool yang dipanggil, tanpa mencatat API key. Keberhasilan provider mock tidak membuktikan koneksi Gemini nyata.
