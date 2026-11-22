# Verifikasi prototipe — 13 November 2026

Status: siap untuk review lokal pemilik. Tidak di-merge atau di-deploy. Ini frontend React/TypeScript/Vite dengan kalkulasi demo deterministik, bukan engine produksi atau AI backend.

## Hasil yang dijalankan

| Pemeriksaan | Hasil |
| --- | --- |
| `npm run build` — TypeScript dan Vite | Lulus. Hasil di `dist/`. |
| `npm test` — Node 24 | 15/15 lulus: aritmetika, unknown, konfirmasi, pembulatan, schema dan pemulihan penyimpanan. |
| Landing, Chrome nyata | 320/375/390/768/1280/1440 px; tidak ada overflow halaman, gambar rusak, atau exception pada pengujian. |
| Lima tahap × enam lebar | 30 probe timbang, nota, pasangan, dialog penyesuaian, dan laporan; lebar dokumen tidak melebihi viewport. |
| Alur utama browser | Timbang 12 → koreksi nota menjadi 10 → konfirmasi dua pasangan → laporan terbuka 2 → preview 0 belum tersimpan → batal tidak berubah → simpan 2 → laporan sisa 0. Sumber dan Rp490.000 tetap. |
| Pemulihan browser | Draf korup tidak crash/dihapus; contoh tidak menimpa draf pengguna; draf manual dan contoh dapat dilanjutkan setelah refresh. |
| Perlindungan async | FileReader ditunda di pengujian; mengganti mode dan teks mencegah foto lama menimpa sumber terbaru. |
| AI simulasi gagal | Timeout contoh mempertahankan koreksi 10 kg; manual dapat melanjutkan konfirmasi. |
| Gagal simpan | Storage sengaja dibuat melempar QuotaExceededError; penyesuaian tetap belum tersimpan dan editor dipertahankan. Coba lagi setelah pemulihan berhasil. |
| Revisi | Konfirmasi ulang nota tanpa perubahan mempertahankan penyesuaian. Perubahan sumber membatalkan pasangan aktif dan mempertahankan penjelasan dalam tinjauan sebelumnya. |
| Keyboard | Skip link dapat difokuskan; dialog bernama; 18 langkah Tab berada di dialog; Escape menutup dan mengembalikan fokus ke launcher. |
| Reduced motion | Preferensi reduce diterima browser; animasi workspace menjadi 0,000001 detik. Fitur tetap berjalan. |
| Chat | Pesan terskenario berlabel; membuka/menutup dan menjawab; tidak mengubah catatan. |
| Cetak | Chrome menghasilkan laporan demo satu halaman A4. Poppler merendernya untuk pemeriksaan visual: sumber, penyesuaian, total dan footer terbaca; tanpa navigasi/chat/maskot. |
| Kontras terpilih | Placeholder kosong pada latar krem diukur dari CSS browser: #5A6F80 / #FFFBEF ≈ 5,05:1. Bukan sertifikasi seluruh UI. |

Skrip browser lokal dan hasil JSON/screenshot berada di `../work/phase3-browser-*.mjs` dan `../outputs/Phase3-browser/final`. Skrip memakai helper Chrome DevTools dari skill lokal; tidak menjadi dependency aplikasi. Gambar merupakan hasil browser aplikasi yang berjalan, bukan SVG pengganti.

## Perubahan penting dari papan V2

- Lima tahap menjadi alur klik dan input nyata, bukan frame yang terpisah.
- Form sumber/review dipakai ulang untuk timbang dan nota; data contoh, tipe, kalkulasi, serta simulasi dipisahkan dari komponen.
- Penyesuaian memakai dialog dengan sumber tetap, status belum disimpan, dan commit hanya setelah storage berhasil.
- Ponsel memakai kartu laporan dengan semua nilai penting terlihat, bukan kolom tabel tersembunyi.
- Logo dan maskot menggunakan aset yang disediakan. Maskot diambil lewat crop CSS dari board asli tanpa menggambar karakter baru.
- Motion CSS mencakup masuk halaman, feedback tombol, dialog, pemrosesan, konfirmasi, dan reduced motion. Durasi simulasi bukan kecepatan AI nyata.

## Batas dan pemeriksaan yang belum dilakukan

- Lint khusus ESLint belum dikonfigurasi; pemeriksaan statis memakai TypeScript strict dan build. Source telah diformat dengan Prettier sebagai alat sementara, bukan dependency runtime.
- Tidak ada backend, autentikasi, provider AI, OCR sungguhan, database, PDF service, atau autonomous agent. Tidak ada data dikirim ke layanan AI.
- Penyimpanan hanya localStorage per peramban. Kuota atau mode privat dapat menggagalkan penyimpanan foto. Satu tinjauan sebelumnya bukan audit historis lengkap.
- Pembulatan demo adalah Rupiah utuh per baris, half-up. Kontrak presisi produksi masih perlu disepakati dengan engine nyata.
- Belum diuji pada perangkat fisik, Safari/Firefox, keyboard layar ponsel, pembaca layar, printer fisik, koneksi lambat, atau pengguna nelayan nyata.
- Tidak ada klaim Lighthouse, 60 FPS, atau kepatuhan WCAG menyeluruh. Video motion belum direkam; motion diuji lewat interaksi dan preferensi browser.

## Integrasi berikutnya

Pertahankan `types.ts` sebagai batas data UI. Ganti adapter simulasi dengan service AI yang mengikat hasil ke versi sumber dan token permintaan; jangan menerapkan respons lama. Ganti utility demo dengan adapter engine yang mengembalikan hasil terstruktur tanpa mengubah sumber. Ganti localStorage dengan repository persisten yang mempunyai revisi dan kegagalan eksplisit. Backend laporan harus memakai revisi yang sama dengan tampilan. Chat nyata tetap tidak boleh menulis konfirmasi/penyesuaian tanpa alur persetujuan terpisah.

## Pengungkapan penggunaan

Implementasi dan verifikasi dibantu OpenAI Codex beserta agen frontend_ux, core_engine, ai_processing, dan storage_ops. React, React DOM, TypeScript, Vite, plugin React, dan type definitions tercantum pada package.json/package-lock.json. Tidak memakai template dashboard eksternal atau library animasi tambahan. Logo/board Ombak Pintar disediakan pengguna dan dipertahankan identitasnya. Referensi UI adalah paket BuktiLaut UX Excellence V2 dari fase sebelumnya. Pengungkapan ini perlu dibawa ke README/proposal kompetisi final.
