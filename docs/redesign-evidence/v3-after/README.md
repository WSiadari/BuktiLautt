# Redesign v3 · Sebelum dan sesudah

Tujuan: beranda tidak lagi terasa seperti template, tanpa menambah fitur. Aturan hitung, alur, dan kepadatan informasi di layar kerja tidak berubah.

## Cara pengambilan

- Build produksi (`npm run build`), disajikan oleh `npm start` di `127.0.0.1:8791`. Gemini mati (`VISION_ENABLED=false`).
- Akun dan arsip memakai database sintetis dari `evaluation/seed-synthetic.mjs` (`demo@buktilaut.test`, satu transaksi contoh Teri 12 kg / 10 kg).
- Skrip: `docs/redesign-evidence/scripts/v3shots.mjs`, viewport 390×844 dan 1440×900, DPR 1, Chrome lokal lewat `playwright-core` 1.49.1.
- Folder sebelum: `../v3-before/`. Folder sesudah: folder ini. Nama berkas sama di kedua folder.
- Tidak ada galat halaman dan tidak ada overflow horizontal di kedua ukuran, sebelum maupun sesudah.

## Yang berubah

| Bagian | Sebelum | Sesudah |
| --- | --- | --- |
| Judul beranda | "Timbang & nota, **cocok dalam menit.**" dengan teks bergradien biru–hijau | Tagline resmi "Catat Hasil Timbang. Periksa Nota Penjualan." warna putih solid |
| Klaim waktu | "dalam menit" dan aria-label "dalam hitungan menit" | Dihapus |
| Penanda di atas judul | Badge pil "Untuk nelayan, pengepul & pencatat TPI" dengan titik berdenyut | Badge dihapus. Sasaran pengguna dipindah ke kalimat pembuka. Deretan centang di bawah tombol dipertahankan |
| Latar hero beranda dan dashboard | Tiga lapis gradien, dua bola cahaya kabur, tiga gelombang bergerak | Deep Marine `#103D65` solid dan satu gelombang statis sebagai batas bagian |
| Panggung maskot | Dua lingkaran dekoratif, salah satunya berputar, plus sorotan radial | Lingkaran dihapus. Maskot dan chip 12 kg / 10 kg / 2 kg tetap |
| Ikon tiga langkah | Biru, hijau toska, dan ungu, masing-masing bergradien dengan bayangan | Satu warna: ikon Deep Marine di atas Soft Sky `#DCEFFA` |
| Tombol utama | Gradien dan bayangan tebal | Deep Marine solid. Tombol AI memakai Ocean Blue yang digelapkan (`#1b7aa3`) agar kontras teks tetap ≥ 4,5:1 |
| Panel ringkasan (Nota, Pasangan, Laporan) | Gradien gelap dengan sorotan radial dan bayangan besar | Deep Marine solid tanpa bayangan |
| Kartu dan tombol Ombak Pintar | Bayangan bertingkat sampai blur 30 px dan cincin halo berdenyut | Bayangan 1–2 px, halo dihapus. Maskot tetap di posisi yang sama |
| Layar muat | Gradien dan dua orbit berputar | Deep Marine solid. Maskot, gelombang kecil, dan titik muat tetap |
| Token warna | `--marine #0f3a60`, `--ocean #2590ba`, `--ink #142a3f` | Disamakan dengan palet merek: `#103d65`, `#268cb4`, `#183047` |

Jumlah gradien di `src/theme.css` turun dari 45 menjadi 8. Empat sisanya bagian dari gambar maskot. Empat lainnya `mask-image` fungsional, yaitu efek pudar teks sumber dan gelombang layar muat.

### Perbaikan sesudah masukan: Ringkasan pemeriksaan tertutup pita putih

Action bar yang menempel di bawah memakai latar putih selebar layar (`box-shadow` 100vmax). Latar itu juga tergambar 30 px di atas bar, sehingga bagian bawah panel Ringkasan pemeriksaan (dan isi lain tepat di atas bar) tertutup pita putih. Kini latar putih dipotong tepat di tepi atas bar. Panel ringkasan yang menempel di desktop dibatasi setinggi ruang di atas bar dan bisa digulir sendiri di layar laptop yang pendek. Di HP, offset `top: 24px` sisa mode sticky dinetralkan; offset itu menggeser panel 24 px ke balik bar.

Diukur pada 1440×900, 1366×657, 1280×600, dan 390×844 dengan `getBoundingClientRect`: saat panel menempel atau halaman digulir sampai bawah, tidak ada bagian panel di bawah tepi atas bar. Screenshot tahap 1–4 di folder ini sudah diperbarui.

### Perbaikan sesudah penilaian: beranda

- Judul bagian "Tiga langkah, tanpa ribet." diganti judul polos **Cara pakai**. Label kecil "Cara pakai" di atasnya dihapus agar tidak dobel.
- Kalimat hero "lalu BuktiLaut mencocokkan beratnya" diganti: "BuktiLaut menyusun pasangan baris, Anda mengonfirmasinya, dan selisih tampil tanpa mengubah angka asli." Ini sesuai kode: pasangan disusun menurut nama ikan dengan status menunggu, lalu dikonfirmasi pengguna.
- Di HP (≤ 720 px) judul bagian menyisakan lajur kanan 84 px untuk tombol Ombak Pintar yang mengambang.

Diukur dengan `../scripts/beranda-fab.mjs` (`getBoundingClientRect` tombol `.ombak-fab` dan teks judul, 390×844, digulir per 20 px dari atas sampai bawah):

| | Sebelum | Sesudah |
| --- | ---: | ---: |
| Jarak horizontal terdekat teks judul ke tombol pada baris yang sama | 10 px | 177 px |

Tombol tidak menimpa teks judul di posisi gulir mana pun, baik sebelum maupun sesudah. Sebelumnya tombol menempel 10 px dari ujung judul yang panjang.

Screenshot: `390x844-beranda-cara-pakai.png`, `1440x900-beranda-cara-pakai.png`, serta versi halaman penuh `*-full.png`. Pada versi halaman penuh, tombol mengambang tergambar pada posisi layar pertama.

## Yang sengaja dipertahankan

- Maskot Ombak Pintar di beranda, dashboard, Masuk/Daftar, tombol bantuan, dan layar muat.
- Chip data 12 kg / 10 kg / 2 kg di hero dan banner amber "12 vs 10 · Coba contoh Teri". Latar banner kini amber solid `--amber-bg`.
- Kepadatan informasi di empat tahap pemeriksaan, laporan, dan arsip. Tata letak tidak berubah, hanya warna permukaan dan bayangan.
- Font tetap Plus Jakarta Sans. Tidak ada font baru.
- Aturan `@media print` tidak disentuh. Pratinjau cetak laporan (`390-4-laporan-cetak.png`, `laporan-cetak-a4.pdf`) berukuran sama dengan versi sebelum (390×1523 px). Tidak ada piksel yang berbeda lebih dari 40 level; selisih kecil berasal dari penyesuaian token warna.

## Pasangan screenshot utama

| Layar | Sebelum | Sesudah |
| --- | --- | --- |
| Beranda desktop | `../v3-before/1440-beranda-full.png` | `1440-beranda-full.png` |
| Beranda HP | `../v3-before/390-beranda-full.png` | `390-beranda-full.png` |
| Dashboard | `../v3-before/1440-dashboard.png` | `1440-dashboard.png` |
| Periksa pasangan | `../v3-before/1440-3-pasangan.png` | `1440-3-pasangan.png` |
| Laporan | `../v3-before/390-4-laporan.png` | `390-4-laporan.png` |
| Ombak Pintar | `../v3-before/390-ombak-pintar.png` | `390-ombak-pintar.png` |
| Masuk / Daftar | `../v3-before/1440-masuk.png`, `390-daftar.png` | `1440-masuk.png`, `390-daftar.png` |
| Arsip | `../v3-before/1440-arsip-full.png` | `1440-arsip-full.png` |

## Belum diuji

- HP fisik dan Safari iOS. Semua screenshot berasal dari Chrome desktop dengan viewport yang diperkecil.
- Mode gelap tidak tersedia di aplikasi ini, jadi tidak diuji.
