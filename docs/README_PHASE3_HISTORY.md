# BuktiLaut · interactive prototype

Catatan historis Phase 3, saat BuktiLaut masih prototipe tanpa backend. Kondisi sekarang ada di [README proyek](../README.md).

Pembaruan aset: maskot utama landing page memakai PNG transparan hasil penghapusan latar melalui imagegen bawaan. Pose lain tetap memakai board pengguna. Asal dan perubahan aset tercatat di [ASSET-EDIT.md](../ASSET-EDIT.md).

Preview lokal: `http://127.0.0.1:5173/`. Lihat [hasil verifikasi](history/VALIDATION.md) untuk build, 15 pengujian, alur browser, screenshot, dan batas prototype. Implementasi dibantu OpenAI Codex dan empat agen proyek; library tercatat di package.json/package-lock.json, aset logo dan Ombak Pintar disediakan pengguna, dan referensi visual memakai UX Excellence V2. Tidak memakai template dashboard eksternal.

Prototipe React/TypeScript lokal dari rancangan UX Excellence V2. Tidak ada backend, akun, panggilan penyedia AI, atau deployment produksi.

## Menjalankan

Memerlukan Node.js 24 (untuk pengujian TypeScript langsung) dan npm.

```sh
npm install
npm run dev
```

Buka URL lokal yang dicetak Vite (umumnya `http://127.0.0.1:5173`). `npm run build` memeriksa TypeScript dan menghasilkan `dist/`; `npm run preview` menyajikan hasil build lokal. `npm test` menguji aritmetika dan pemulihan draf. Tidak ada kunci API yang diperlukan.

## Menelusuri contoh

1. Pilih **Buka contoh**. Semua data bertanda **Data contoh (sintetis)**. Catatan timbang Teri 12 kg dan Tongkol 8 kg tetap menjadi sumber asli.
2. Tinjau dan konfirmasikan catatan timbang. Pada nota, berat Teri sengaja kosong. Buka sumber, isi **10**, lalu konfirmasikan nota. Harga Rp25.000/kg dan Rp30.000/kg menghasilkan Rp490.000.
3. Konfirmasikan pasangan Teri dan Tongkol secara terpisah. Laporan sudah bisa dibuka dengan temuan Teri 2 kg yang masih terbuka.
4. Kembali ke pemeriksaan dan pilih **Jelaskan selisih**. Isi 2 kg, alasan Tidak terjual, keterangan **Dibawa pulang.** Pratinjau menjadi 0 kg, tetapi hasil tersimpan masih 2 kg.
5. **Simpan penyesuaian** baru menerapkan perubahan setelah penulisan penyimpanan browser berhasil. Laporan mempertahankan 12/10 kg, penyesuaian 2 kg, dan sisa 0 kg. Cetak memakai halaman A4 dengan margin 15 mm tanpa navigasi/chat/maskot.

**Mulai pemeriksaan** membuka alur manual untuk sumber teks atau foto JPG/PNG/WebP hingga 4 MB. Foto pengguna tidak menghasilkan fixture ikan. Tombol pembacaan AI menjelaskan bahwa AI belum tersedia. Nama dan berat perlu diisi; harga, potongan, atau biaya kosong tetap berarti belum diketahui, bukan nol. Keputusan tanpa pasangan dicatat pada kedua sumber.

## Pemulihan dan kejujuran status

- Draf pengguna `buktilaut.prototype.draft.v1` dan demo `buktilaut.prototype.demo.v1` disimpan terpisah. Membuka contoh tidak mengganti draf pengguna. Saat halaman dimuat ulang, masing-masing dipulihkan melalui **Lanjutkan draf** atau **Lanjutkan contoh tersimpan**. Buka contoh memulai ulang contoh saja.
- Sumber foto berupa data URL disimpan bersama draf bila ruang browser cukup. Kegagalan akses/kuota tampil jelas. Jangan tutup halaman jika ada perubahan belum tersimpan. Gagal menyimpan penyesuaian mempertahankan editor dan hasil sebelumnya.
- Draf yang rusak atau berbeda format ditolak dengan pemberitahuan; pembacaan tidak menghapus data lama. Memulai pemeriksaan baru memerlukan konfirmasi penggantian.
- Mengedit sumber/isian membatalkan keputusan turunan. Salinan keputusan terakhir menyimpan angka, keterangan persis pengguna, revisi, dan rujukan sumber tanpa menggandakan foto. Salinan ini bertanda **Perlu ditinjau ulang**, tidak menjadi hitungan/laporan aktif, dan tidak ditimpa oleh ketikan berikutnya setelah keputusan dibatalkan. Ini satu salinan tinjauan terakhir, bukan audit historis backend. Laporan dan cetak memakai keputusan pada revisi saat ini. Konfirmasi pengguna tidak sama dengan verifikasi pihak luar.
- Menu Keadaan pembacaan contoh memperagakan hasil sebagian/kosong/tidak valid/timeout/batas layanan. Ini simulasi berlabel; retry mempertahankan sumber dan koreksi. Respons yang terlambat diabaikan setelah perubahan sumber/isian/mode/langkah atau pemilihan manual.
- Ombak Pintar memakai jawaban terskenario dan label Respons simulasi. Percakapan tidak menulis, mengonfirmasi, atau menyimpan data pemeriksaan.

## Struktur integrasi berikutnya

`src/lib/examination.ts` memuat perhitungan deterministik dengan presisi gram dan pembulatan Rupiah per baris. `src/types.ts` memuat model draf; `src/data/demo.ts` fixture eksplisit. `src/services/storage.ts` memvalidasi pemulihan draf; `src/services/simulation.ts` memisahkan simulasi dari UI. `src/App.tsx` mengatur form dan langkah; `src/styles.css` memuat Marine Blue, reflow, motion/reduced motion, dan cetak. Penyambungan backend/provider kelak perlu adapter nyata, status permintaan, versioning sumber, dan persistensi server; prototipe ini tidak berpura-pura sudah terhubung.

Aset logo di `public/brand/`. Gambar `public/ombak-board.png` mempertahankan papan karakter yang disetujui tanpa suntingan; CSS memotong tampilan karakter agar judul dan caption papan tidak menjadi UI. Maskot dekoratif disembunyikan dari pembaca layar; status tersedia sebagai teks. Font menggunakan IBM Plex Sans bila terpasang, lalu Segoe UI/Arial; tidak ada permintaan font eksternal.

## Penyempurnaan Phase 3.1

- `components/OmbakPintar.tsx` memetakan mood bertipe ke lima ekspresi dari satu papan asli: idle, sambutan, berpikir/tinjauan, memproses, dan undangan kosong. Galat memakai pose tinjauan dengan indikator amber; pengakuan positif memakai sambutan setelah tindakan berhasil. Gambar hero tetap `ombak-main-transparent.png`, dimuat malas dengan ukuran tetap. Tidak ada lima berkas transparan baru atau karakter baru.
- `components/AIVisionProcessing.tsx` memperlihatkan preview sumber, scan yang terpotong pada dokumen, indikator tak tentu, maskot memproses, dan skeleton. Isian lama tetap bisa diperiksa dan diedit; tidak ada hasil baru yang diterapkan oleh animasi. Jeda 1.400 ms hanya milik adapter **Simulasi AI Vision**. Foto pengguna tetap memakai jalur manual karena AI belum terhubung.
- `components/Chat.tsx` memakai ekspresi reaktif, indikator tiga titik, percakapan terskenario berlabel, retry pertanyaan terakhir tanpa duplikasi, serta pembatalan timer saat galat/ditutup. Penjelasan selisih dan total menggunakan ringkasan read-only dari hasil perhitungan aktif; pasangan yang belum dikonfirmasi tetap belum diketahui. Chat tidak menulis data.
- `components/ui.tsx` memusatkan tombol status/icon/dialog. Dialog menjaga trap Tab, Escape dan fokus kembali, dengan exit singkat; reduced motion menutup langsung. Penyimpanan sinkron tidak memakai timer simpan palsu: pengakuan positif muncul setelah penulisan lokal berhasil.
- `motion.css` memuat durasi/easing, transisi langkah/pasangan/temuan, scan/skeleton/typing, pengurangan gerak, dan ukuran baca ponsel. Progres ponsel menampilkan label langkah aktif dan nomor langkah lain, sambil mempertahankan nama aksesibel lengkap. Teks status tetap tersedia ketika gerak dimatikan. Laporan cetak tidak memuat maskot atau animasi.

Jalankan `npm run build` dan `npm test` setelah perubahan. Tinjauan browser/motion Phase 3.1 dan bukti perbandingan disimpan terpisah oleh pemeriksa; deklarasi animasi sendiri tidak membuktikan kelancaran pada semua perangkat.

## Batas verifikasi

Build dan pengujian otomatis adalah pemeriksaan berbeda dari QA browser. Bukti desktop/ponsel, fokus dialog, reduced motion, cetak, dan masalah tersisa dicatat oleh pemeriksa pada folder `outputs/Phase3-browser` di arsip kerja tim (tidak disertakan di repo). Prototipe belum di-merge atau di-deploy. Penyimpanan lokal bukan cadangan lintas perangkat.

Validasi Phase 3.1: [PHASE3_1_VALIDATION.md](history/PHASE3_1_VALIDATION.md). Bukti Phase 3.1 tersedia pada ZIP di outputs/Phase3-1-browser, terpisah dari bukti Phase 3 sebelumnya.
