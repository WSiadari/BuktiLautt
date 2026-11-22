# Hero beranda v4 · Sebelum dan sesudah

Tujuan: hero menunjukkan bahwa BuktiLaut juga membaca foto dan suara, bukan hanya tabel selisih. Tanpa fitur baru. Yang berubah hanya markup hero di `src/App.tsx` dan CSS hero di `src/theme.css`.

## Cara pengambilan

- Build produksi (`npm run build`), disajikan `npm start` di `127.0.0.1:8795` dengan `BUKTILAUT_ALLOWED_HOSTS=localhost,127.0.0.1`. Gemini mati (`VISION_ENABLED=false`). Database akun sintetis dari `evaluation/seed-synthetic.mjs`. Port bawaan 8787 sedang dipakai server pengembangan lain di mesin yang sama, jadi server uji memakai 8795. Kode dan build sama.
- Skrip: `../scripts/v4hero.mjs`. Viewport 320×700, 390×844, 768×1024, dan 1440×900, DPR 1, Chrome lokal lewat `playwright-core` 1.49.1.
- Sebelum: `../v4-before/` (commit `303a3ef`). Sesudah: folder ini. Nama berkas sama: `beranda-<ukuran>.png` untuk layar pertama dan `beranda-<ukuran>-penuh.png` untuk halaman penuh. Pada halaman penuh, tombol Ombak Pintar tergambar di posisi layar pertama.
- Hasil ukur mentah: `ukur.json` di kedua folder.
- Teks pembuka hero memakai `max-width: 34ch`. Chrome kadang menghitung `ch` dengan font cadangan sebelum Plus Jakarta Sans termuat dan tidak menghitung ulang, sehingga lebarnya berubah antar-muat (293 atau 398 px di 768 px). Skrip menunggu font lalu memaksa hitung ulang gaya teks itu. Dengan begitu, sebelum dan sesudah diukur dalam keadaan yang sama. Perilaku ini sudah ada sebelum v4 dan tidak diubah.

## Yang berubah

| Bagian | Sebelum | Sesudah |
| --- | --- | --- |
| Cahaya maskot | Tidak ada | Satu `radial-gradient` Ocean Blue `#268CB4` 18%, rata sampai setengah jari-jari lalu memudar ke tepi. Diameter 170% maskot. Statis, tanpa blur, cincin, atau orbit |
| Chip desktop (≥ 1024 px) | 3: Timbang 12 kg, Nota 10 kg, Selisih 2 kg | 5: ketiganya, ditambah **Foto nota terbaca · 2 baris** (ikon kamera) dan **Suara "Tongkol delapan kilo"** (ikon mikrofon) |
| Chip tablet (768–1023 px) | 3 | 4: tanpa chip suara. Satu chip di setiap sudut maskot |
| Chip HP (< 768 px) | 3, tersebar di kiri dan kanan maskot | 3 (12 kg, 10 kg, 2 kg), bertumpuk di kiri seperti hitungan. Maskot di kanan |
| Gerak chip | Naik-turun 8 px, 5 detik, durasi sama | Naik-turun 3 px, durasi 6–8 detik berbeda tiap chip. Mati total di `prefers-reduced-motion` |
| Pembaca layar | Panggung chip `aria-hidden`, tanpa ringkasan | Panggung tetap `aria-hidden`. Satu teks `sr-only`: "Contoh: Teri 12 kg di catatan timbang dan 10 kg di nota, selisih 2 kg. Angka bisa dibaca dari foto atau suara." |

Gaya chip baru sama dengan chip lama: putih, sudut membulat, bayangan tipis, ikon garis Deep Marine di atas Soft Sky. Hanya chip selisih yang amber. Tanpa ✨, tanpa kata "AI-powered", tanpa gradien pada chip. Kutipan suara memakai 15 px agar chip tidak melebar.

Semua angka mengikuti data **Buka contoh**: Teri 12 kg timbang dan 10 kg nota, nota dua baris (Teri, Tongkol), Tongkol 8 kg. Chip hijau opsional "Tongkol 8 kg · cocok" tidak dipakai karena desktop sudah mencapai batas lima chip.

## Ukuran

Diukur dengan `getBoundingClientRect`. "Wajah" adalah area putih wajah maskot (36–76% lebar, 30–60% tinggi gambar). "Tombol Ombak" dihitung saat halaman digulir per 20 px dari atas sampai hero habis.

| Ukuran | Tinggi hero sebelum → sesudah | Chip | Chip bertumpuk | Chip di wajah maskot | Chip di judul | Tombol Ombak menimpa chip/judul | Overflow horizontal |
| --- | ---: | ---: | ---: | --- | ---: | --- | --- |
| 320×700 | 876 → 876 px | 3 → 3 | 0 → 0 | **1 → 0** | 0 → 0 | **4 posisi gulir → 0** | tidak |
| 390×844 | 734 → 734 px | 3 → 3 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | tidak |
| 768×1024 | 728 → 728 px | 3 → 4 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | tidak |
| 1440×900 | 604 → 604 px | 3 → 5 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | tidak |

Di versi sebelum, pada 320×700 chip "Nota · Teri 10 kg" menutupi sisi kanan wajah maskot dan tertimpa tombol Ombak Pintar di posisi gulir 0–60 px. Di HP, kini chip hanya berada di lajur kiri. Lajur kanan tempat tombol mengambang tidak berisi chip. Maskot bisa lewat di bawah tombol saat digulir, tetapi chip dan judul tidak.

Ukuran peralihan juga diperiksa dengan `SIZES=360x640,375x667,414x896,767x1024,800x1280,900x800,1023x768,1024x768,1280x800,1920x1080`. Hasilnya sama: chip tidak bertumpuk, tidak ada chip di wajah atau judul, tombol Ombak tidak menimpa chip atau judul, tidak ada overflow, dan tidak ada galat.

Dengan `prefers-reduced-motion: reduce`, `animation-name` semua chip bernilai `none` di keempat ukuran.

## Pemeriksaan rilis

Skrip: `../scripts/v4rilis.mjs`. Hasil di `rilis/`.

| Pemeriksaan | Hasil |
| --- | --- |
| Klon bersih: `npm ci` | lulus, 198 paket |
| `npm run typecheck` | lulus |
| `npm run lint` | 0 error, 32 peringatan (sama dengan sebelum v4; `src/App.tsx` 0 peringatan) |
| `npm test` | 231/231 lulus |
| `npm run build` | lulus |
| `/`, `/masuk`, `/arsip` | 200 `text/html` |
| `/api/vision/status` | 200 `application/json` |
| `/api/tidak-ada`, `/.env` | 404 |
| Header `Host: evil.example` | 403 |
| Buka contoh → laporan, 390 dan 1440 px | Teri 12 kg / 10 kg, selisih awal 2 kg, tidak terjual 2 kg, sisa 0 kg. Tongkol 8 kg / 8 kg. Tanpa galat konsol atau halaman |
| Pratinjau cetak laporan | Header, action bar, tombol Ombak, dan ringkasan layar tersembunyi, tanpa overflow (`rilis/laporan-cetak-390.png`, `rilis/laporan-cetak-a4.pdf`) |
| Akun sintetis + Ombak Pintar | Masuk ke `/dashboard`. Pertanyaan "Berapa selisih berat bulan November 2026?" dijawab dalam mode Panduan dasar: timbang 20 kg, nota 18 kg, selisih 2 kg terbuka (`rilis/ombak-pintar-arsip-1440.png`) |

Detail: `rilis/rilis.log` (alur browser) dan `rilis/http.log` (rute HTTP). Rute HTTP juga diperiksa di port bawaan 8787 pada server `npm run api`, yang menjalankan perintah yang sama dengan `npm start`. Hasilnya sama.
