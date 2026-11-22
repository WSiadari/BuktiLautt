# Phase 4.2 — perbaikan dan verifikasi

13 November 2026 · branch `feature/buktilaut-phase4-2-bugfix`.

Semua tujuh perbaikan di bawah berstatus **FIXED AND TESTED** dalam cakupan regresi yang dicatat. Pengguna melaporkan ekstraksi Gemini nyata sudah berhasil sebelum fase ini. Regresi Phase 4.2 memakai respons tiruan atau fixture sintetis; panggilan Gemini tidak diulang. Isi `.env` tidak ditampilkan atau disunting; kode konfigurasi/provider dipertahankan. Tidak ada deployment, library baru, atau animasi maskot baru.

## Hasil tujuh perbaikan

| Bug | Perbaikan dan bukti |
| --- | --- |
| 1. Raw JSON di UI normal | Disclosure dihapus, diganti keterangan statis tentang pembacaan AI dan konfirmasi. Browser memeriksa tombol/elemen JSON tidak ada pada kedua jenis dokumen. Raw extraction tetap tersimpan di IndexedDB, terpisah dari koreksi dan snapshot konfirmasi. |
| 2. Impor duplikat | Identitas `(requestId, extractionItemIndex)` disimpan pada baris. Status diturunkan dari baris yang masih ada. Yang sudah masuk ditandai Sudah ditambahkan, tidak bisa dipilih lagi, dan hitungan hanya memuat pilihan eligible. Klik cepat berulang, impor parsial, refresh dan nama ikan identik diuji. Aksi hilang saat semua butir masuk. |
| 3. Stale palsu | Validitas usulan mengikuti identitas sumber/jenis dokumen, bukan revisi seluruh draf. Impor dan koreksi form tidak mematikan sisa usulan. Penggantian sumber sungguhan tetap membuat hasil lama tidak bisa diterapkan; token, AbortController dan pemeriksaan respons terlambat dipertahankan. |
| 4. Subtotal dan total akhir | `subtotalRupiah` berasal dari helper deterministik yang sama dengan total. Empat permukaan — review nota, ringkasan pemeriksaan, laporan dan cetak — memakai label terpisah. Nilai kosong tidak menjadi nol. Dua aksi nol eksplisit tersedia. Nominal tidak valid ditandai; biaya tidak valid menahan konfirmasi, sedangkan subtotal item yang sudah diketahui tetap terlihat. |
| 5. Provenance seperti tombol | Diganti panel statis Asal data dan koreksi. Berat terbaca AI, isian saat ini, koreksi nyata dan konfirmasi dibedakan. Nilai yang sama tidak diberi label seolah-olah berat berubah; informasi terlihat tanpa klik. Pembacaan AI tidak diklaim sebagai fakta angka asli dokumen. |
| 6. CTA laporan ganda | Tombol Buka laporan pada ringkasan dihapus. Satu Lihat laporan tetap di area navigasi utama dengan aturan disabled lama. Navigasi langkah dan aksi cetak tetap ada. |
| 7. Latar maskot putih | Menggunakan aset utama transparan yang sudah disetujui sebagai fallback bersih untuk semua mood, dengan permukaan komponen transparan. Tidak menghapus bagian putih sah dari tubuh/karakter, tidak membuat pose atau animasi baru. Status teks dan antarmuka mood tetap modular. |

## Perilaku hapus dan data lama

Baris impor yang dihapus menjadi eligible lagi dan harus dipilih secara eksplisit untuk reimport. Penghapusan satu-satunya baris AI menyisakan satu form kosong agar skema draf tetap valid; sumber dan raw AI tidak dihapus. Reimport tidak menambah placeholder sebagai duplikat. Uji browser mencakup kasus terakhir ini.

Baris Phase 4 lama tanpa indeks tetap diterima. Asosiasi hanya dibuat jika request ID serta tuple rawText/rawWeight/rawUnit menemukan satu butir sumber secara unik, bukan dari nama atau berat yang sudah dikoreksi. Asosiasi ditambahkan pada penyimpanan normal berikutnya. Metadata ambigu diberi peringatan dan kandidat terkait dibatasi; butir lain yang jelas tetap tersedia. Jika metadata tidak cukup, aplikasi meminta tinjauan/pembacaan ulang alih-alih menebak. Duplikat lama tidak dihapus otomatis. Ini pembatasan keselamatan yang disengaja, bukan migrasi destruktif.

## Pengujian aktual

- Baseline: 44 tes lulus sebelum perbaikan. Akhir: **61/61 tes lulus**, typecheck frontend/server dan production build lulus. Lint tidak terkonfigurasi, sehingga tidak dinyatakan lulus.
- Enam tes domain tambahan memeriksa subtotal diketahui saat biaya kosong, nol eksplisit, diskon/biaya positif, harga/berat hilang atau invalid, pembulatan desimal, nilai besar dan overflow. Contoh dua item menghasilkan subtotal Rp490.000 dengan total akhir belum diketahui sampai kedua komponen biaya dipastikan.
- Sembilan tes visionReview memeriksa identitas sumber, kedua jenis dokumen, klik/impor berulang, nama ikan berulang, legacy unik/ambigu/duplikat dan provenance numerik. Tes IndexedDB menambah regresi impor parsial, refresh, koreksi dan penghapusan/reimport pada kedua dokumen.
- Browser perjalanan utama memakai mock berlabel: impor satu lalu dua dari tiga ikan, percobaan klik cepat berulang, refresh, hapus/reimport dan selesaikan impor; tidak ada stale palsu. Nota dikoreksi dari hasil AI 9 kg menjadi 10 kg, raw 9 tetap tersimpan. Timbang 12/nota 10/penyesuaian 2 tetap terpisah. Sisa menjadi 0 setelah penyimpanan; pratinjau belum disimpan tidak mengubah hasil tersimpan.
- Fixture tiga item: subtotal Rp600.000 dengan total akhir Belum diketahui saat potongan/biaya kosong; setelah aksi nol eksplisit total Rp600.000. Ringkasan, laporan dan PDF konsisten. Kedua PDF tiga item yang dirender setelah perbaikan spasi cetak berjumlah **satu halaman A4**; seluruh isi dan margin 15 mm dipertahankan. Ini bukan jaminan satu halaman untuk data sembarang.
- Browser tambahan memeriksa dua item Teri identik tetap menjadi dua butir sah, penghapusan baris AI terakhir dan reimport satu kali, teks provenance tanpa disclosure, serta label konfirmasi baru muncul setelah penyimpanan konfirmasi berhasil.
- Browser nominal: harga hilang tidak menghasilkan subtotal; harga invalid menghasilkan penjelasan invalid; biaya invalid mempertahankan subtotal tapi menahan konfirmasi/total akhir. Subtotal Rp585.000 dengan potongan Rp10.000 dan biaya Rp2.500 menghasilkan Rp577.500; angka Rupiah besar tetap terkandung pada lebar 320 px.
- Empat tampilan × enam lebar (320/375/390/768/1280/1440) = **24 probe tanpa overflow halaman**. Screenshot mobile/desktop diperiksa langsung. Emulasi browser tidak sama dengan pengujian perangkat fisik atau audit WCAG menyeluruh.
- Jumlah CTA utama Lihat laporan tepat satu; raw JSON tidak ada pada UI normal; sumber diganti sungguhan memblokir penerapan hasil lama. Pemeriksaan browser tidak mencatat exception JavaScript yang tidak tertangani.
- Hash file server/provider, client Vision, kontrak Vision, implementasi IndexedDB, package.json dan package-lock.json dibandingkan dengan snapshot awal dan tetap sama. Tidak ada Rive/Lottie/dependensi baru. Skema database/version tidak diubah; validator hanya menerima metadata baris opsional tambahan.

## Bukti sebelum/sesudah

Berkas berada di `outputs/Phase4-2-browser` pada paket ZIP.

- **BEFORE:** `before/receipt-raw-review.png` dan versi mobile adalah screenshot Phase 4 yang sudah direkam sebelum fase ini; memperlihatkan disclosure teknis dan daftar usulan sebelumnya. Data contoh sebelum/sesudah berbeda: sebelum dua item, sesudah tiga untuk menguji impor parsial.
- **AFTER impor:** `after/weighing-partial-desktop.png`, `after/weighing-partial-mobile.png` memperlihatkan dua Sudah ditambahkan dan satu yang masih bisa dipilih.
- **AFTER angka:** `after/receipt-unknown-final-desktop.png`, versi mobile, dan `after/report-unknown-final.png` memisahkan subtotal dari total akhir.
- **AFTER laporan:** `after/report-final-desktop.png`, `after/report-final-mobile.png`, `after/report-final.pdf` serta `after/report-unknown-final.pdf`. `*-page-1.png` adalah hasil render PDF.
- `before/print-orphan-before-fix.png` mencatat catatan kaki yang sempat tersisa di halaman kedua pada iterasi uji; PDF akhir sudah diperiksa kembali dan tidak memiliki halaman yatim itu.
- `after/journey.json`, `after/supplement.json` memuat pemeriksaan browser nyata dengan provider tiruan; `after/tests.txt`, `typecheck.txt`, `build.txt` memuat perintah yang benar-benar dijalankan. `after/file-audit.json` mencatat file dan batas konfigurasi yang dipertahankan.

## File aplikasi yang diubah

1. `src/App.tsx` — alur penerapan usulan, metadata legacy, panel provenance, nominal/validasi, nol eksplisit dan CTA.
2. `src/types.ts` — indeks butir ekstraksi opsional.
3. `src/vision.css` — panel informasi, status impor, nominal dan spasi cetak; tanpa animasi baru.
4. `src/components/VisionProposal.tsx` — eligible/applied/blocked, hitungan, completion dan keterangan statis pengganti JSON.
5. `src/components/RowProvenance.tsx` — komponen baru pengganti disclosure provenance.
6. `src/components/OmbakPintar.tsx` — fallback aset transparan lama.
7. `src/lib/visionReview.ts` — identitas impor, asosiasi legacy, idempotensi dan provenance berat.
8. `src/lib/visionReview.test.ts` — regresi usulan/impor/provenance.
9. `src/lib/examination.ts` — keluaran subtotal dari aritmetika deterministik yang sama, tanpa mengganti aturan matching/penyesuaian/total akhir.
10. `src/lib/examination.test.ts` — regresi nominal.
11. `src/services/storage.ts` — validasi indeks butir opsional, tetap kompatibel draf lama.
12. `src/services/storage.test.ts` — batas metadata dan kompatibilitas.
13. `src/services/indexedDb.test.ts` — persistensi impor/koreksi/legacy/reimport.

Dokumentasi yang diperbarui/ditambahkan: `buktilaut-interactive-prototype/README.md`, `buktilaut-interactive-prototype/PHASE4_2_FIX_REPORT.md`, `README.md`, `BUKTILAUT_MASTER_CONTEXT.md`, dan `docs/PHASE4_2_BRIEF.md`. Helper dan screenshot QA berada di work/outputs; bukan perubahan API produksi.

## Batas tersisa

Tidak ada bug dari tujuh butir yang masih berstatus NOT FIXED dalam cakupan di atas. Pose transparan berbeda per emosi dan sistem animasi baru sengaja tidak dibuat; fallback satu aset adalah pilihan yang diizinkan brief. Legacy yang tidak bisa diasosiasikan dengan aman memerlukan tindakan pengguna. Live Gemini tidak diulang, perangkat fisik/screen reader tidak diuji pada fase ini. Keterbatasan IndexedDB lintas tab/perangkat dari Phase 4 tetap berlaku.

Untuk pembaruan instalasi yang sudah berjalan, **pertahankan .env Anda**. ZIP tidak menyertakan API key. Jangan menimpa konfigurasi lama dengan .env.example. Tidak dilakukan deployment atau penulisan ulang riwayat Git.
