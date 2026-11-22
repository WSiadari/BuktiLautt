# BuktiLaut

**Catat Hasil Timbang. Periksa Nota Penjualan.**

Nelayan, pengepul, dan pencatat TPI sering memegang dua catatan untuk satu penjualan: catatan timbang dan nota dari pembeli. Bila beratnya berbeda, selisih itu sulit dijelaskan tanpa bukti. BuktiLaut membaca kedua dokumen, menyusun pasangan baris untuk dikonfirmasi pengguna, lalu membuat laporan yang menyimpan berat asli, penyesuaian, dan selisih yang masih terbuka.

## IT RUSH 2026

| | |
| --- | --- |
| Subtema | Ekonomi dan Pemberdayaan Masyarakat |
| Tim | Yumi (Wahyu Siadari, Michelle Clarissa Watung) |
| Website | [ISI: URL publik] |
| Repo | [ISI: URL publik] |

## Coba alur pemeriksaan

Tidak perlu akun atau kunci AI. Data contoh bersifat sintetis.

1. Di Beranda, pilih **Buka contoh**.
2. **Catatan timbang:** periksa baris Teri 12 kg dan Tongkol, lalu konfirmasi.
3. **Nota penjualan:** berat Teri sengaja kosong. Buka sumber, isi **10 kg**, lalu konfirmasi nota.
4. **Periksa pasangan:** konfirmasi pasangan Teri dan Tongkol. Teri menunjukkan **12 kg timbang**, **10 kg nota**, dan **2 kg selisih**.
5. Catat penyesuaian, misalnya 2 kg tidak terjual, atau biarkan selisih tetap terbuka.
6. **Laporan:** berat asli, penyesuaian, dan sisa selisih tampil terpisah. Laporan bisa dicetak atau disimpan sebagai PDF.

## Fitur utama

- **Baca foto, teks, atau suara.** Gemini mengusulkan isi baris dari foto catatan dan nota, teks tempelan, atau rekaman suara. Sumber dikirim hanya setelah pengguna setuju, dan usulan masuk ke form hanya bila dipilih.
- **Pasangan yang dikonfirmasi.** BuktiLaut menyusun pasangan baris timbang–nota menurut jenis ikan. Setiap pasangan harus dikonfirmasi pengguna. Selisih berat dan total nota dihitung kode.
- **Penyesuaian beralasan.** Berat tidak terjual dicatat terpisah beserta alasannya, tanpa menimpa angka sumber.
- **Laporan.** Memuat berat asli, penyesuaian, selisih terbuka, serta perbandingan total tertulis di nota dengan total hitungan.
- **Akun, ruang kerja, dan arsip.** Arsip privat atau tim tersimpan di server. Setiap simpan menjadi revisi baru dengan nomor referensi transaksi. Masuk dengan email atau Google.
- **Ombak Pintar.** Asisten baca-saja untuk pemeriksaan aktif dan arsip. Model hanya memilih satu dari 9 alat baca, server menjalankannya pada data berizin dan menyusun angka jawaban. Bila tanggal atau maksud belum jelas, Ombak Pintar meminta klarifikasi. Pertanyaan bisa diketik atau direkam.
- **Analitik penjualan.** Lewat Ombak Pintar: total Rupiah dan kg terjual, per jenis ikan dengan harga rata-rata per kg, per pembeli, per hari, dan selisih timbang–nota, termasuk perbandingan dengan periode sebelumnya. Dihitung dari revisi terkonfirmasi terbaru.
- **Draf di perangkat.** Tanpa akun, draf dan foto sumber tersimpan di IndexedDB browser.

## Keputusan desain

AI membaca dan memahami, kode menghitung uang, dan pengguna memutuskan. Gemini hanya mengusulkan isi baris dari foto, teks, atau suara. Selisih berat dan nominal nota dihitung fungsi TypeScript yang diuji, dan usulan baru masuk ke form setelah dipilih pengguna. Sumber asli, hasil baca AI, dan isian yang dikonfirmasi disimpan terpisah di draf, sehingga setiap angka di laporan bisa ditelusuri ke asalnya. Penyesuaian seperti berat tidak terjual dicatat terpisah beserta alasannya dan tidak menimpa berat timbang maupun berat nota. Nilai yang belum diketahui tetap tertulis "belum diketahui", bukan nol. Ombak Pintar hanya membaca data ruang kerja yang berizin; bila tanggal, transaksi, atau maksud pertanyaan belum jelas, ia meminta klarifikasi alih-alih menebak.

## Arsitektur

```
Browser (React + Vite, src/)  ──fetch /api/*──►  API Node (server/, satu proses)
  draf tanpa akun di IndexedDB                     ├─► Gemini API: membaca sumber, memilih alat Ombak Pintar
                                                   └─► SQLite (node:sqlite): akun, ruang kerja, arsip revisi
```

Aturan hitung ada di `src/lib/` dan diuji dengan `node --test`. Peta folder dan letak aturan penting: [ARCHITECTURE.md](ARCHITECTURE.md). Kontrak Ombak Pintar: [docs/PHASE4_7_AGENT.md](docs/PHASE4_7_AGENT.md).

## Menjalankan lokal

Gunakan Node.js 24, versi yang dipakai CI.

```bash
npm ci
npm run api   # terminal 1: API di http://127.0.0.1:8787
npm run dev   # terminal 2: website di http://127.0.0.1:5173
```

Vite meneruskan `/api` ke port 8787. Bila API memakai port lain, jalankan `npm run dev` dengan `BUKTILAUT_API_PORT` berisi port tersebut.

Untuk menyajikan website dan API dari satu alamat: `npm run build && npm start`. Server membaca `dist/` dan melayani keduanya di port yang sama.

Salin `.env.example` ke `.env` untuk konfigurasi. Kunci hanya dibaca server. Variabel untuk deploy:

| Variabel | Fungsi |
| --- | --- |
| `BUKTILAUT_HOST` | Alamat listen. Isi `0.0.0.0` bila hosting meneruskan trafik dari luar kontainer |
| `BUKTILAUT_ALLOWED_HOSTS` | Nama host yang boleh dilayani; host lain ditolak 403 |
| `VISION_ALLOWED_ORIGINS` | Origin yang boleh memanggil API, misalnya `https://domain-anda` |
| `BUKTILAUT_COOKIE_SECURE` | `true` untuk domain HTTPS di belakang reverse proxy |
| `VISION_PORT` / `PORT` | Port server. Bila `VISION_PORT` kosong, dipakai `PORT` dari hosting (bawaan 8787) |
| `BUKTILAUT_ACCOUNT_DB_PATH` | Lokasi database SQLite (bawaan `.data/accounts.sqlite`) |
| `VISION_ENABLED`, `VISION_DATA_PROCESSING_ACKNOWLEDGED`, `GEMINI_API_KEY` | Mengaktifkan Gemini. Tanpa ini, isian dilakukan manual |
| `GOOGLE_OAUTH_CLIENT_ID`, `_SECRET`, `_REDIRECT_URI` | Opsional, untuk masuk dengan Google |

Arsip demo terpisah: `node evaluation/seed-synthetic.mjs <path-absolut>/demo.sintetis.sqlite` (path harus absolut dan berakhiran `.sintetis.sqlite`; folder tujuan harus sudah ada; berkas yang sudah ada dilewati), lalu jalankan API dengan `BUKTILAUT_ACCOUNT_DB_PATH` menunjuk berkas itu. Akun sintetisnya `demo@buktilaut.test` dengan kata sandi `Demo-Sintetis-48!`. Saat memperbarui instalasi, pertahankan `.env` dan database lama ([panduan penyimpanan](docs/PHASE4_7_STORAGE_MIGRATION.md)).

## Pengujian

```bash
npm run typecheck   # tsc untuk browser dan server
npm run lint        # ESLint
npm test            # 232 tes node --test dengan provider AI tiruan
npm run build
```

CI GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) menjalankan keempatnya di Node 24 pada setiap push dan pull request. Tes tidak memanggil Gemini dan tidak membutuhkan kunci API.

## Penggunaan AI, library, dan aset

- **Di aplikasi:** Gemini membaca foto, teks, dan suara menjadi usulan baris, serta memilih alat baca Ombak Pintar. Angka dihitung kode, keputusan diambil pengguna.
- **Dalam pengembangan:** OpenAI Codex dan Claude Code membantu menulis kode, tes, refaktor, dan dokumentasi. Skill `frontend-design` dan `ui-ux-pro-max` dipakai saat meninjau UI. Semua perubahan ditinjau dan diuji tim.
- **Aset:** logo BuktiLaut dan maskot Ombak Pintar dibuat dan disunting dengan alat gambar generatif. Ilustrasi foto pesisir juga generatif. Asal dan perubahan tiap berkas ada di [ASSET-EDIT.md](ASSET-EDIT.md). Dokumen uji di `evaluation/` sintetis.
- **Library:** React, React DOM, Vite, `@vitejs/plugin-react`, TypeScript, Sharp, dan google-auth-library. Untuk pengembangan: fake-indexeddb, ESLint, typescript-eslint, dan eslint-plugin-react-hooks. Font Plus Jakarta Sans dari Google Fonts. Versi terkunci di `package-lock.json`; lisensi mengikuti paket asal.

Pengembangan sebelum repo git ini dibuat tercatat per fase di [docs/history/](docs/history/).
