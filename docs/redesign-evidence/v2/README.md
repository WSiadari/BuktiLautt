# BuktiLaut v2 · "Ocean SaaS" (22 November 2026)

Rombak penuh tampilan. Fungsi, API, perhitungan, akun, dan arsip tetap sama.

## Yang berubah

| Area | v2 |
| --- | --- |
| Sistem desain | `src/theme.css` (semua aturan diawali `html.v2`). Font Plus Jakarta Sans. Kartu putih dengan sudut 20 px dan bayangan lembut. Header kaca. Aksen *seafoam* `#2FB8A4`. Amber khusus untuk selisih. Palet Deep Marine dan Ocean Blue tetap dipakai. |
| Maskot | `src/components/OmbakPintar.tsx` dibuat hidup: berkedip, mengambang dan bernapas, gelembung naik, serta pipi merona. Ekspresinya ikut suasana: melambai, berpikir dengan gelembung titik, melompat dengan kilau, menggeleng saat galat, dan mencondongkan badan saat meninjau. Ada reaksi *pop* singkat setiap suasana berganti. |
| Loading | `src/components/BootScene.tsx`. Ombak berganti ekspresi tiap 1,6 detik dengan orbit berputar, ombak bergerak, dan titik memantul. |
| Tombol chat | Kembali ke maskot mengambang seperti versi lama: lingkaran dengan cincin berdenyut dan balon "Tanya Ombak" yang sesekali muncul. Di tahap pemeriksaan, posisinya naik ke atas action bar. Panel chat tampil sebagai lembar bawah di HP dan laci kanan di desktop. |
| Beranda | Hero laut dengan ombak SVG bergerak. Maskot besar dikelilingi chip mengambang (Timbang 12 kg, Nota 10 kg, Selisih 2 kg). Dua tombol besar: **Mulai periksa** dan **Buka contoh**. Tiga langkah dengan ikon (Foto, Cocokkan, Laporan) dan pita "Coba contoh Teri". |
| Timbang dan Nota | Tab tersembunyi dihapus; urutannya selalu **1 · Ambil sumber**, lalu **2 · Periksa angka**. Area unggah berupa kamera besar, dengan mode Foto, Teks, dan Suara berikon. Draf baru langsung dibuka dalam mode Foto. Tombol **Baca dengan AI** bergradasi. Sumber di HP ditampilkan sebagai pratinjau ringkas. Stepper menjadi progres bersegmen. Action bar kaca menempel dengan tombol kembali berupa ikon. |
| Pasangan | Kartu besar dengan tiga angka (Timbang, Nota, Selisih). Selisih berwarna amber, dan ringkasan tampil di kartu laut gelap. |
| Laporan | Kartu total akhir, status selisih, dan tindakan berikutnya ditaruh di atas. |
| Masuk dan Daftar | Kartu tunggal di atas latar laut. Maskot mengintip dari tepi atas kartu dan berganti ekspresi: berpikir saat memproses, menggeleng saat ada galat. |
| Dasbor | Sapaan "Halo, {nama}". Kartu hero pemeriksaan berisi progres langkah dan maskot. Kartu Arsip dan Tim. Filter arsip dilipat di HP. |
| Gerak | Halaman, kartu, dan baris masuk dengan animasi lembut. Ada kilau pada tombol AI, orb kamera yang bernapas, dan tombol yang sedikit terangkat saat disentuh. Semua gerak berhenti bila `prefers-reduced-motion` aktif. |

## Bukti (folder ini)

- Lebar 320, 390, 768, dan 1440 px:
  - Layar alur: `{lebar}-home`, `-timbang`, `-nota`, `-pasangan`, `-laporan`, `-chat`, `-masuk`, `-daftar`, `-loading`.
  - Halaman akun: `-dashboard`, `-akun-menu`, `-arsip`, `-tim`.
  - Versi `-full` adalah halaman penuh. Pada versi ini header dan action bar dibuat statis dan tombol maskot disembunyikan khusus untuk tangkapan layar.
- Tidak ada overflow horizontal di 320–1440 px dan tidak ada galat JavaScript.
- Skenario Complex di `complex/` memakai server QA dengan Gemini mati dan data diisi dari `evaluation/complex/groundtruth-rows.csv`:
  - 12 baris timbang dan 11 baris nota.
  - 10 cocok, 1 perlu keputusan sampai penyesuaian dicatat, 1 tanpa pasangan.
  - Dua baris Teri tetap terpisah. Selisih 2 kg menjadi 0 kg. Penyesuaian 3 kg ditolak.
  - Total Rp2.206.300. PDF dibuat, arsip tersimpan, dan jawaban chat memakai Rp2.206.300.
- Fitur wajib (`fitur-*.png`): mode Foto, Teks, dan Suara; dialog persetujuan AI; daftar akun lalu keluar lalu masuk akun lain; arsip.
- Kontras teks kecil yang baru semuanya ≥4,5:1. Pengecualian hanya tombol nonaktif, yang memang dikecualikan WCAG.

## Tes

- `npm run typecheck` lulus.
- `npm run build` lulus.
- `npm test` lulus 224/225. Yang gagal tetap `server/frontend.test.ts` (konfigurasi host untuk deploy, sudah gagal sebelum redesign, `server/` tidak diubah).
- Satu tes konkurensi SQLite sempat gagal karena "database is locked" ketika beberapa server QA berjalan bersamaan. Tes itu lulus 3/3 saat diulang sendirian, dan lulus pada putaran akhir.

## Masih perlu dicek di perangkat nyata

- Animasi di HP murah (performa).
- Keyboard virtual saat lembar chat terbuka.
- Gemini live untuk scan foto.
- Mikrofon fisik.
- Google Fonts memerlukan koneksi. Bila offline, teks jatuh ke font sistem.
