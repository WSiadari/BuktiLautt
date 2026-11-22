# Catatan aset

Asal, alat, dan perubahan setiap aset gambar di `public/`. Semua aset dipilih tim BuktiLaut. Aset yang dibuat atau disunting dengan alat gambar generatif disebut demikian.

## Logo BuktiLaut

- **Asal:** desain tim, dibuat dengan bantuan alat gambar generatif.
- **Alat:** alat gambar generatif; berkas akhir berupa SVG berisi path vektor, tanpa gambar raster tertanam.
- **Perubahan:** versi horizontal berwarna, versi horizontal putih polos untuk latar gelap, dan ikon persegi untuk favicon.
- **Berkas hasil:** `public/brand/buktilaut-horizontal.svg` (header, footer, Masuk/Daftar, laporan), `public/brand/favicon.svg` (favicon), `public/brand/buktilaut-horizontal-white.svg` (cadangan, belum dirujuk kode).

## Papan maskot Ombak Pintar

- **Asal:** desain maskot pilihan tim, dibuat dengan alat gambar generatif. Satu papan memuat pose utama dan beberapa variasi.
- **Alat:** alat gambar generatif.
- **Perubahan:** salinan WebP untuk ukuran unduh yang lebih kecil.
- **Berkas hasil:** `public/ombak-board.png` dan `public/ombak-board.webp` (1536×1024). Disimpan sebagai acuan; tidak dimuat aplikasi.

## Maskot utama transparan

- **Asal:** maskot utama di sisi kiri papan maskot (area sekitar x 43, y 191, 538×477 px).
- **Alat:** penyuntingan gambar generatif (imagegen) untuk menghapus latar.
- **Perubahan:** latar putih, label, teks, dan pose lain dihapus. Bentuk, warna, ekspresi, headset, dan percikan air dipertahankan. Bayangan biru muda di bawah maskot dibuat semi-transparan. Karena disunting secara generatif, hasilnya bukan salinan identik per piksel dari papan.
- **Pemeriksaan:** keempat sudut ber-alpha 0; tidak ada kotak putih di tampilan 1440 px dan 390 px.
- **Berkas hasil:** `public/ombak-main-transparent.png` (1332×1181, alpha) dan `public/ombak-main-transparent.webp` (WebP lossless; alpha dan RGB setiap piksel terlihat sama dengan PNG). Menjadi sumber versi tampilan di bawah; tidak dimuat langsung.

## Maskot ukuran tampilan

- **Asal:** maskot utama transparan.
- **Alat:** pengubahan ukuran dan konversi WebP.
- **Perubahan:** diperkecil ke 640×567 px untuk ukuran tampilan maksimum sekitar 290 px. Ukuran berkas turun dari 649.486 B menjadi 43.774 B. PSNR 38,3 dB terhadap asli pada 2× ukuran tampilan ([perbandingan](docs/redesign-evidence/mascot-compare-2x.png)).
- **Berkas hasil:** `public/ombak-main-640.webp`. Dipakai semua tampilan maskot (`OmbakPintar.tsx`, `VoiceMascot.tsx`).

## Ilustrasi foto pesisir

- **Asal:** gambar generatif bergaya foto: penimbangan ikan di dermaga. Bukan foto lokasi, orang, atau transaksi nyata.
- **Alat:** alat gambar generatif.
- **Perubahan:** disimpan sebagai WebP 1050×1312 px.
- **Berkas hasil:** `public/brand/timbang-pesisir.webp`. Belum dirujuk kode saat ini.

## Dokumen uji sintetis

- **Asal:** dibuat tim untuk pengujian; semua nama, angka, dan transaksi adalah data latihan.
- **Alat:** skrip lokal dengan Pillow dan font Windows (`evaluation/*.png`), serta `evaluation/complex/generate.py` dengan ReportLab dan Pillow.
- **Berkas hasil:** `evaluation/` dan `evaluation/complex/`. Rincian metode: [evaluation/complex/METHOD-AND-QA.md](evaluation/complex/METHOD-AND-QA.md).
