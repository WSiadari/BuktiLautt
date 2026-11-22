# Bukti Redesign Mobile-First · 22 November 2026

Semua path relatif terhadap folder proyek. Pengujian browser memakai Chrome lokal lewat `playwright-core` 1.49.1, DPR 1, tanpa Gemini. Kondisi pengujian disebut di setiap bagian.

## 1. Tinggi tahap Nota (390 px, dua baris nota)

Metode yang sama untuk sebelum dan sesudah (`scripts/capture.mjs`):
- Viewport 390×844.
- Beranda → **Buka contoh** → **Konfirmasi catatan timbang** → tahap Nota.
- Tab **Data pemeriksaan** aktif. Semua `<details>` dalam keadaan bawaan.
- Ukuran yang dicatat adalah `document.documentElement.scrollHeight` setelah `scrollTo(0,0)`.

| Keadaan | Sebelum | Sesudah | Perubahan |
| --- | ---: | ---: | ---: |
| Berat Teri masih kosong (keadaan awal contoh) | 2.956 px | 1.802 px | −39% |
| Teri diisi 10 kg | 2.930 px | 1.716 px | −41% |
| 1440×900, keadaan awal | 2.232 px | 1.464 px | −34% |

Pada sesudah, panel **Nominal dokumen dan tinjauan** tertutup kecuali ada temuan nominal. Juri mencatat sekitar 2.981 px pada versi yang diaudit. Pembanding utama memakai versi aktif: 2.956 px.

## 2. Status nominal dan format Rupiah

| Status | Bukti |
| --- | --- |
| Belum diketahui (kosong), dengan tombol **Isi Rp0** | `complex/complex-02a-status-belum-diketahui-dan-rp0-isian.png`, `complex/complex-log.txt` |
| Rp0 · isian, belum dikonfirmasi (tombol Isi Rp0 hilang) | file yang sama, kolom Biaya |
| Rp0 · terkonfirmasi | `after/after-390-nota-rp0-terkonfirmasi.png`, `after/after-print-preview-a4.png` |

Format Rupiah sekarang memakai satu fungsi, `src/lib/format.ts` (`formatRupiah`), dan menghasilkan "Rp2.206.300" tanpa spasi. Format ini dipakai di Pasangan, Laporan, Arsip, dan chat. Kesamaannya diuji di Arsip dan chat: `complex/complex-log.txt` baris `[arsip]` dan `[chat]`.

## 3. Posisi Ombak Pintar

- Tombol mengambang dihapus. Ombak Pintar kini ada di **header** (semua halaman) dan di **action bar yang menempel** pada tahap Timbang, Nota, Pasangan, dan Laporan.
- Pada 390 px, dock (x 16–64) dan tombol **Konfirmasi nota** (x 224–374) tidak bertumpuk. Lihat `scripts/extra.mjs` dan `after/after-390-nota-viewport.png`.
- Uji Tab (`scripts/focus-obscured.mjs`) pada 77–78 kontrol di Nota dan Pasangan, untuk ukuran 390×844, 1440×900, dan 390×508. Tidak ada elemen fokus yang tertutup penuh oleh header atau action bar.
- Fokus kembali ke tombol **Buka bantuan Ombak Pintar** setelah panel ditutup dengan Esc.
- Keyboard virtual **disimulasikan** dengan memperkecil tinggi viewport dari 844 ke 508 px setelah kolom ketik difokuskan. Pada 390 px, area pesan naik dari 156 menjadi 358 px. Kolom ketik dan tombol kirim berada di y 441–489, di dalam layar 508 px. Lihat `before/before-390-chat-keyboard.png` dan `after/after-390-chat-keyboard.png`. Meta `interactive-widget=resizes-content` ditambahkan agar `dvh` mengikuti keyboard di Chrome Android. Hal ini **belum diuji di HP fisik**.

## 4. Skenario Complex (`complex/`)

Kondisi: build produksi (`vite preview` :4173). Server QA :8788 memakai `VISION_ENABLED=false` dan basis data sintetis di folder sementara. Foto sumber `SINTETIS-*-clear.png` diunggah, lalu baris **diisi manual dari `groundtruth-rows.csv`** (fixture, bukan pembacaan Gemini).

Hasil (`complex/complex-log.txt`):
- 12 baris timbang dan 11 baris nota.
- 11 pasangan dikonfirmasi dan 1 tanpa pasangan (Kerapu).
- Teri baris 1 berpasangan dengan nota baris 1 (12 vs 10 kg). Teri baris 11 berpasangan dengan nota baris 10 (4,5 vs 4,5 kg). Keduanya tetap terpisah.
- Selisih awal Teri 2 kg. Penyesuaian 3 kg ditolak (tombol simpan nonaktif). Setelah 2 kg tidak terjual dicatat, sisa selisih 0 kg.
- Subtotal Rp2.213.800 dan total akhir **Rp2.206.300**.
- Laporan tetap menampilkan 12 kg dan 10 kg asli.
- Ekspor PDF: `complex/complex-laporan.pdf` (2 halaman A4).
- Arsip tersimpan sebagai transaksi terkonfirmasi dan menampilkan Rp2.206.300.
- Ombak Pintar (Panduan dasar, karena Gemini mati) menjawab total arsip Rp2.206.300.

## 5. Tes otomatis

| Perintah | Hasil | Log |
| --- | --- | --- |
| `npm run typecheck` | Lulus | `typecheck.log` |
| `npm test` | 224/225 lulus | Log mentah tidak disimpan |
| `npm run build` | Lulus (CSS 142 kB, JS 459 kB) | `build.log` |

Tes yang gagal adalah `server/frontend.test.ts`, "built site and authenticated API share the configured host", dengan status 403. Tes ini sudah gagal sebelum redesign:
- Tes dan `server/frontend.ts` bertanggal 20 Nov dan menguji `BUKTILAUT_ALLOWED_HOSTS`.
- `server/app.ts` (19 Nov) masih menolak host selain localhost. Ini temuan juri nomor 1 tentang deploy.
- Redesign tidak mengubah `server/`. Deployment di luar cakupan tahap ini.

## 6. Aset maskot

Ukuran tampilan maksimum maskot sekitar 290 px (halaman masuk). Browser kini memuat `public/ombak-main-640.webp` sebesar **43.774 B**, menggantikan `ombak-main-transparent.webp` sebesar 649.486 B (−93%).
- Perbandingan pada 2× ukuran tampilan: `mascot-compare-2x.png` (kiri asli, kanan baru). PSNR 38,3 dB, tanpa perbedaan yang terlihat.
- Berkas asli tetap ada di `public/`, tetapi tidak lagi dimuat.

## 7. Masih perlu HP fisik, Gemini live, atau mikrofon

- Keyboard virtual nyata (Chrome Android dan Safari iOS), termasuk perilaku `interactive-widget`.
- Pembacaan foto Complex oleh Gemini live. Pada uji ini baris diisi dari fixture.
- Jawaban Ombak Pintar mode Gemini. Pada uji ini yang menjawab Panduan dasar.
- Rekam pertanyaan dengan mikrofon fisik. Kontrol rekam kini tampil di dalam panel chat yang sama, tetapi belum direkam dengan suara nyata.
- Cetak dari dialog cetak browser asli. PDF di sini dibuat dengan `page.pdf()` headless.

## 8. Menjalankan ulang skrip

Skrip di `scripts/` membutuhkan `playwright-core` dan Chrome terpasang. Contoh:

```
npm i --no-save playwright-core@1.49.1
node docs/redesign-evidence/scripts/capture.mjs <folder-keluaran> after
```
