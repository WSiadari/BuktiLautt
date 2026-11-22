# Phase 4.5.1: hasil perbaikan dan evaluasi

17 November 2026. Melanjutkan aplikasi Phase 4.5, tanpa perubahan kredensial/model, kalkulasi pemeriksaan, versi IndexedDB atau deployment.

## Ringkasan status

| Bagian | Bukti/status |
|---|---|
| Teri tidak ada di draf Tongkol | PASS tes domain dan browser: “Teri tidak ditemukan di pemeriksaan ini.” tanpa angka, kartu atau aksi Tongkol |
| Tongkol 8 kg ↔ 8 kg | PASS: sumber dan selisih 0 kg tetap tersedia |
| Pertanyaan umum/duplikat/satu sumber | PASS tes domain; browser mencakup umum dan pemilih dua Teri |
| Chat 360 px dan 393 px, 10 jenis ikan | PASS: chip permanen hilang, UUID/kode pasangan tidak tampak, percakapan bergulir dan composer di viewport |
| Vision Gemini live | 4 permintaan, seluruh HTTP200, tanpa retry, setelah persetujuan eksplisit pengguna |
| Hasil akhir tinjauan pengguna | PASS replay keluaran live yang direkam, pengisian 11 harga, pasangan/penyesuaian/refresh/PDF Rp2.206.300 |
| Dokumen asli | Tidak disediakan; seluruh dokumen evaluasi sintetis |
| Ponsel fisik dan Voice mikrofon nyata | Pending; tidak disamakan dengan emulasi browser |
| Gemini live untuk chat agen baru | Tidak diuji pada fase ini; guard/handler diuji dengan provider tiruan |

## Perubahan dan peran

1. Core: resolveFindingTargets memisahkan not_found, general, single, multiple dan unclear. Tidak ada fallback ikan spesifik ke semua temuan. Nama yang tidak cocok dengan selected ID tidak boleh dibelokkan ke pasangan lain. Varian nama tidak disamakan dengan ikan lain. Baris satu sumber tidak mendapat selisih pasti.
2. Frontend: seluruh strip chip permanen dihapus. ID tetap internal. Pilihan hanya muncul dalam pesan klarifikasi, dengan nama, baris timbang/nota dan berat. Sumber/form penyesuaian dan Panduan dasar tetap dapat diakses. Layout percakapan diperpanjang dan composer dipertahankan dalam viewport.
3. AI: daftar alat dipersempit menurut resolusi. Target tunggal hanya read_finding dengan enum ID tepat; not_found/unclear/multiple hanya list_findings. Pembacaan ikan lain, argumen tambahan, alat tulis dan hasil tidak valid ditolak. Narasi angka tetap dibangun dari engine. CLI perbandingan lokal dan evaluasi hasil live disediakan.
4. Storage/ops: pasangan dokumen kompleks, acuan Python Decimal independen, versi jelas/miring-bayangan dan pengujian lengkap. Draf, raw extraction, koreksi, lot berulang, baris tanpa pasangan serta laporan diperiksa. Orkestrator mengoordinasi empat panggilan live, pengujian konteks, integrasi dan paket akhir.

## Dokumen dan data acuan

Folder: evaluation/complex. Dataset BL-SINTETIS-KOMPLEKS-01 berisi 12 baris timbang dengan 10 jenis ikan dan 11 baris nota dari transaksi sintetis yang sama. Teri dan Tongkol masing-masing memiliki dua lot; Kerapu W10 1,75 kg tanpa pasangan. Teri W01 12 kg ↔ nota10 kg dapat diberi penyesuaian pengguna2 kg. Koma desimal, pengelompokan ribuan titik dan harga berbeda per lot tercetak.

Empat input utama:
- SINTETIS-catatan-timbang-clear.png
- SINTETIS-nota-penjualan-clear.png
- SINTETIS-catatan-timbang-tilt-shadow.png
- SINTETIS-nota-penjualan-tilt-shadow.png

Semua ditandai SINTETIS. PNG/JPG1489×2105≈3,13MP, di bawah4MB dan20MP. Sumber SVG/PDF tersedia untuk edit/cetak; unggahan aplikasi tetap JPG/PNG/WebP, bukan SVG/PDF. Versi variasi memakai rotasi ringan1,2° dan bayangan8%, bukan simulasi semua kondisi lapangan. groundtruth.json dan groundtruth-rows.csv dihitung dengan Python Decimal/ROUND_HALF_UP, tanpa mengimpor engine aplikasi.

## Hasil baca awal live dan hasil setelah koreksi

| Input | Baris sesuai/acuan | Waktu | Bidang awal |
|---|---:|---:|---|
| Timbang jelas |12/12|6,639s|36 bidang nama/berat/satuan sesuai|
| Timbang miring/bayangan |12/12|20,963s|36 bidang nama/berat/satuan sesuai|
| Nota jelas |11/11|4,949s|66 bidang sesuai;11 harga/kg yang dapat dipakai masih unknown|
| Nota miring/bayangan |11/11|11,280s|66 bidang sesuai;11 harga/kg yang dapat dipakai masih unknown|

Tidak ada baris hilang atau tambahan; lot berulang tetap terpisah. Pada nota, angka harga mentah benar tetapi stringnya tidak membawa /kg, sehingga normalisasi konservatif mempertahankan null. Header sumber menampilkan Harga/kg; pengguna perlu meninjau sumber dan mengisi11 harga. Tidak ada perubahan normalizer atau pengarang harga dari subtotal. Angka mentah dan angka yang siap dipakai adalah dua ukuran berbeda; tidak dibuat persentase akurasi agregat.

Subtotal baris Rp2.213.800, potongan Rp15.000, biaya Rp7.500 dan total tertulis Rp2.206.300 sesuai pada kedua nota. [Evaluasi awal terperinci](../../evaluation/complex/INITIAL-LIVE-OBSERVATIONS.md) memuat metode per bidang dan bukti asli yang tidak ditimpa nilai koreksi.

Dua alur browser dipisahkan:
- Mock: galat Kembung5,05→5,50 sengaja ditanam untuk menguji koreksi. Ini bukan galat OCR live.
- Replay hasil live: source hash cocok, raw hasil Gemini asli dipakai kembali; metadata request diikat ke draf uji baru. Seluruh11 harga yang semula kosong diisi melalui form dari dokumen. Tidak ada panggilan provider tambahan.11 pasangan dikonfirmasi, Kerapu tetap tanpa pasangan, penyesuaian2 kg disimpan, draf pulih identik setelah refresh. PDF3halaman menghasilkan Rp2.206.300. Halaman PDF dirender dan diperiksa oleh storage/ops.

Empat gambar sintetis yang terbaca tidak mewakili akurasi pada dokumen asli, tulisan tangan atau foto lapangan berat.

## Pengujian

-143/143 tes otomatis PASS,0gagal,0skip, termasuk pembanding evaluasi dan regresi Vision/Voice/matching/draf.
- Typecheck frontend/server PASS; production build PASS60modules.
- Lint tidak diklaim: repo tidak memiliki script lint.
- Browser lokal source workspace5176, provider dicegat pada uji antarmuka. Lima pertanyaan konteks; dua request per alur dokumen (mock dan replay). Tidak ada exception console pada run selesai. Respons live hanya empat request terpisah yang disetujui,0retry.
- Tidak ada perubahan kredensial/model, manipulasi commit atau deployment. Persetujuan otomatis awal menahan live karena preferensi lama tanpa panggilan berbayar; setelah pengguna menyetujui tepat4panggilan, pengujian dilaksanakan dalam batas itu.

Bukti relatif terhadap root workspace:
- outputs/Phase4-5-1-context/checks.json dan chat-360.png/chat-393.png
- outputs/Phase4-5-1-complex/checks.json dan complex-reviewed-report.pdf
- outputs/Phase4-5-1-live/SINTETIS-*.json dan initial-extraction-comparison.json
- outputs/Phase4-5-1-live-review/checks.json dan complex-reviewed-report.pdf
- evaluation/complex/METHOD-AND-QA.md pada folder aplikasi

## Mengulang di laptop

Pertahankan .env dan origin browser lama. Restart API serta frontend dari folder versi baru. Jangan menjalankan proses lama seolah sudah memuat perbaikan.

1. Buat draf manual Tongkol8kg timbang dan8kg nota, konfirmasikan sumber serta pasangan. Buka Ombak Pintar pada Pemeriksaan.
2. Tanyakan “Berapa selisih Teri?”: pesan tidak ditemukan, tanpa kartu/angka Tongkol. Lalu “Apakah ada selisih berat untuk Tongkol?”:8↔8, selisih0. Pertanyaan umum boleh menampilkan temuan aktif.
3. Unggah pasangan PNG jelas dari evaluation/complex. Bandingkan dengan groundtruth-rows.csv, tinjau harga/kg yang belum diketahui, dan konfirmasikan data secara eksplisit.
4. Pertahankan dua lot Teri/Tongkol sebagai baris berbeda. Biarkan Kerapu tanpa pasangan. Catat2kg Tidak terjual pada Teri12/10, simpan, refresh lalu ekspor PDF. Periksa subtotal/potongan/biaya/total dan nilai sumber asli.
5. Ulangi dengan versi miring/bayangan bila ingin uji tambahan; panggilan live tambahan memerlukan pengelolaan kuota/biaya sendiri. Empat permintaan fase ini sudah selesai dan tidak diulang otomatis.

Untuk membandingkan berkas respons lokal saja, gunakan perintah pada INITIAL-LIVE-OBSERVATIONS.md. CLI ini tidak memanggil Gemini.
