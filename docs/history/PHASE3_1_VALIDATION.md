# Phase 3.1 — validasi dan penyerahan

13 November 2026. Penyempurnaan dilakukan pada aplikasi React/Vite yang sudah ada. Figma dan aplikasi produksi tidak diubah pada fase ini.

## Perubahan utama

| Sebelumnya | Sekarang | Alasan |
|---|---|---|
| Maskot kurang mengikuti status tugas | Komponen OmbakPintar bertipe: sambutan, idle, proses, tinjauan, galat, positif, kosong; lima pose board dipakai ulang | Bantuan visual mengikuti kejadian sebenarnya |
| Pembacaan contoh memakai indikator sederhana | Preview sumber, scan terpotong, skeleton dan indikator tak tentu, label Simulasi AI Vision | Menjelaskan proses tanpa persentase palsu |
| Umpan balik alur belum terpusat | Durasi/easing bersama, transisi langkah/dialog, penegasan pasangan dan pratinjau belum disimpan | Menunjukkan perubahan tanpa mengesankan seluruh transaksi terverifikasi |
| Chat sederhana | Pose reaktif, typing, error/retry, pembatalan jawaban pada pergantian revisi, ringkasan perhitungan read-only | Menghindari jawaban usang dan penulisan data oleh chat |
| Label langkah ponsel terlalu kecil | Label langkah aktif dengan nomor langkah lainnya; label form/status diperbesar | Meningkatkan keterbacaan pada lebar 320 px |
| App memuat seluruh detail tampilan | OmbakPintar, AIVisionProcessing, Chat dan ui dipisahkan; motion.css terpusat | Memudahkan pemeliharaan tanpa mengganti kontrak pemeriksaan |

Hero tetap memakai PNG transparan yang disetujui. Ekspresi lainnya merupakan crop lima pose dari papan asli, bukan lima PNG transparan baru. Logo dipertahankan. Draf pengguna dan contoh tetap terpisah; data sumber asli tidak diganti penyesuaian.

## Bukti pemeriksaan aktual

- `npm test`: 18 pengujian lulus, termasuk hitungan, pemulihan penyimpanan, dan konteks simulasi.
- `npm run build`: TypeScript dan build produksi lulus. Tidak menambah dependensi runtime.
- Browser Chrome lokal: 13 pemeriksaan alur utama, 10 skenario pemulihan, 3 pemeriksaan keyboard dan 4 kelompok pemeriksaan motion/chat lulus; tidak ada exception JavaScript yang dicatat pada skenario tersebut.
- Lima tahap/form × enam lebar (320, 375, 390, 768, 1280, 1440): tidak ada overflow halaman; landing juga diperiksa pada keenam lebar.
- Transform scan dibandingkan pada dua waktu berbeda, bukan hanya membaca deklarasi CSS. Mode reduced-motion menyembunyikan scan dan menghentikan animasi titik.
- Pembatalan pembacaan mempertahankan koreksi 11 kg. Chat gagal membatalkan respons tertunda; retry tidak menggandakan pertanyaan. Foto pengganti yang selesai saat chat aktif membatalkan jawaban dari konteks lama.
- Dialog memiliki nama aksesibel, menahan Tab di dalam, Escape menutup dan mengembalikan fokus ke tombol pemicu.
- Uji penyimpanan gagal mempertahankan editor dan hasil tersimpan lama. Perubahan sumber membatalkan keputusan turunan serta mempertahankan catatan tinjauan sebelumnya.
- PDF browser dirender dengan Poppler dan diperiksa: satu halaman A4 untuk contoh dua ikan; angka asli 12/10 kg, penyesuaian 2 kg, sisa 0 kg dan Rp490.000 terlihat; navigasi/chat/maskot tidak dicetak. Ini bukan jaminan jumlah halaman untuk data arbitrer.

Bukti berada di `outputs/Phase3-1-browser/before` dan `after` pada ZIP. JSON memuat probe dan hasil aktual; PNG adalah screenshot aplikasi berjalan. `final-regression.json` mencatat perbaikan maskot ponsel dan perubahan konteks chat. Helper browser menggunakan path lokal penulis; sesuaikan impor helper dan lokasi aset sebelum menjalankannya pada komputer lain.

## Motion dan aksesibilitas

Token dasar: feedback 140 ms, perubahan status 220 ms, langkah 260 ms; exit dialog 140 ms. Scan/skeleton/typing hanya aktif selama proses terkait. Penyimpanan sinkron tidak diberi waktu tunggu buatan. Simulasi pembacaan 1.400 ms berada di adapter demo, bukan layanan AI produksi.

Batas kontrol diperkuat (#698399 pada putih; bidang belum pasti #967027 pada ivory). Tombol hapus terukur 44 × 44 px; pilihan sumber minimum 44 px. Berat 0 dan harga tidak valid mendapat aria-invalid serta pesan terhubung melalui aria-describedby; diverifikasi pada 320 px.

Semua informasi penting tersedia sebagai teks. Status tidak hanya mengandalkan warna. Reduced-motion meniadakan gerak dekoratif dan menutup dialog langsung. Pemeriksaan ini bukan audit WCAG menyeluruh atau uji pengguna nelayan.

## Kinerja dan batas

Lihat `after/metrics.json` dan `before/metrics.json` untuk ukuran mentah/gzip dan hash aset. JS gzip berubah dari 84.154 menjadi 86.350 byte; CSS gzip dari 9.816 menjadi 12.413 byte. Hash kedua PNG maskot tidak berubah. Perbandingan ZIP baseline juga membuktikan examination.ts, storage.ts, types.ts dan package-lock.json tetap sama. Bundle bertambah karena fitur tampilan; tidak ada klaim peningkatan kecepatan, skor Lighthouse atau FPS. Papan maskot sekitar 1,74 MB dan hero transparan 1,16 MB masih menjadi kandidat optimasi WebP/AVIF berikutnya, dengan pembandingan visual sebelum penggantian. Tidak ada library animasi baru atau permintaan font eksternal.

P0/P1: tidak ada kegagalan tersisa yang ditemukan dalam cakupan pengujian ini setelah perbaikan akhir. Batas produk: AI Vision dan chat tetap simulasi berlabel; foto nyata memakai input manual. Backend, autentikasi, penyimpanan lintas perangkat, integrasi AI nyata dan deployment belum dikerjakan pada fase visual ini.

P2: optimasi aset maskot dengan geometri/alpha yang diperiksa; pengujian pembaca layar dan perangkat fisik; pengukuran performa perangkat kelas rendah; pengujian cetak data panjang. Tidak mengklaim semua perangkat atau seluruh kriteria aksesibilitas telah terverifikasi.

## Menjalankan

Ekstrak ZIP, buka folder `buktilaut-interactive-prototype`, jalankan `npm ci`, lalu `npm run dev`. Buka alamat yang dicetak terminal. Tidak memerlukan API key. Untuk menjalankan pengujian native TypeScript gunakan Node.js 22.18+.
