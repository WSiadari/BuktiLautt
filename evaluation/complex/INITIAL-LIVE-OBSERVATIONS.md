# Hasil baca awal Gemini — Phase 4.5.1

Empat gambar **sintetis** dipanggil satu kali per gambar, tanpa retry, setelah izin eksplisit pengguna. Semua respons HTTP 200, model tercatat `gemini-3.5-flash-lite`. Tidak ada dokumen asli yang disediakan. Ini pengamatan pada empat gambar, bukan ukuran akurasi umum OCR.

| Dokumen | Baris acuan / hasil | Waktu | Hasil awal |
| --- | --- | --- | --- |
| Catatan Timbang jelas | 12 / 12 | 6,639 detik | Nama, berat, dan satuan seluruh baris sesuai |
| Catatan Timbang miring/bayangan | 12 / 12 | 20,963 detik | Nama, berat, dan satuan seluruh baris sesuai |
| Nota Penjualan jelas | 11 / 11 | 4,949 detik | Nama, berat, satuan, angka harga mentah, dan subtotal sesuai; 11 harga per kg ternormalisasi belum diketahui |
| Nota Penjualan miring/bayangan | 11 / 11 | 11,280 detik | Nama, berat, satuan, angka harga mentah, dan subtotal sesuai; 11 harga per kg ternormalisasi belum diketahui |

Tidak ada baris hilang atau tambahan. Semua pasangan baris ke acuan memakai kode lot yang tertulis; Teri dan Tongkol yang berulang tetap terpisah. Kerapu W10 hanya ada di Catatan Timbang. Klasifikasi aktual kedua catatan adalah `weighing`, kedua nota `sales_receipt`; semuanya dilaporkan `readable` oleh provider.

Pada kedua nota, 11 angka harga mentah benar, tetapi provider mengembalikan string seperti `25.000`, tanpa `/kg`. Normalizer yang konservatif tidak menganggap satuan berat sebagai bukti satuan harga. Akibatnya **11 nilai `unitPriceRupiah` per nota tetap null**, meskipun sumber menampilkan kolom harga/kg. Pengguna perlu memeriksa basis harga pada sumber dan mengisi 11 harga sebelum menganggap nilai harga per kg sudah diketahui. Ini keterbatasan hasil yang dapat dipakai aplikasi, bukan salah baca angka mentah. Normalizer dan hasil provider tidak diubah untuk memperbaiki angka evaluasi.

Subtotal per baris seluruhnya sesuai. Penjumlahan independen subtotal hasil baca adalah Rp2.213.800; potongan tertulis Rp15.000, biaya Rp7.500, dan total tertulis Rp2.206.300 juga sesuai pada kedua nota. Tidak ada potongan per baris yang tercetak; semua potongan per baris dikembalikan null. Total tertulis yang benar tidak menggantikan tinjauan harga per kg yang masih null.

Perbandingan mencatat 36 bidang sesuai per gambar timbang. Per nota, 66 bidang sesuai dan 11 belum diketahui; empat pemeriksaan nominal dokumen juga sesuai. Bidang nota meliputi nama, berat, satuan, angka harga mentah, harga per kg yang dapat dipakai, subtotal, dan ketiadaan potongan per baris. Tidak ada persentase agregat karena harga mentah dan harga ternormalisasi mengukur hal berbeda.

Alur aplikasi **mock setelah koreksi manusia** dilaporkan terpisah oleh pengujian browser: kesalahan Kembung 5,05 → 5,50 adalah kesalahan mock yang sengaja ditanam, bukan pengamatan dari empat respons live. Alur itu memverifikasi lot berulang, Kerapu tanpa pasangan, penyesuaian Teri 2 kg, refresh, dan PDF dengan total Rp2.206.300. Alur lengkap juga lulus melalui pemutaran ulang respons live yang direkam: 11 harga pada nota diisi lewat form berdasarkan kolom Harga/kg, kemudian pairing, penyesuaian, refresh dan PDF diverifikasi. Request browser pada replay dicegat; tidak ada panggilan Gemini tambahan. Bukti ada di outputs/Phase4-5-1-live-review pada root workspace. Hasil awal live tidak ditulis ulang menggunakan nilai acuan. Uji Voice dengan mikrofon fisik tetap pending.

## Bukti dan pengulangan lokal

- Gambar dan acuan independen: folder ini, `groundtruth.json`, serta empat `SINTETIS-*.png`.
- Respons asli dan identitas SHA-256: `../../../outputs/Phase4-5-1-live/SINTETIS-*.json`.
- Perbandingan bidang: `../../../outputs/Phase4-5-1-live/initial-extraction-comparison.json`.
- `compare-live.ts` hanya membaca berkas lokal; tidak memanggil provider. Error layanan dilaporkan terpisah dari kesalahan bidang OCR. Lot dipakai dahulu; nama berulang tanpa lot memerlukan tinjauan dan tidak masuk hitungan bidang yang telah terasosiasi pasti.

Dari direktori aplikasi, jalankan kembali perbandingan lokal dengan PowerShell:

```powershell
$responseFiles = Get-ChildItem '../outputs/Phase4-5-1-live' -File -Filter 'SINTETIS-*.json' | Select-Object -ExpandProperty FullName
node --experimental-strip-types evaluation/complex/compare-live.ts evaluation/complex/groundtruth.json @responseFiles
```

Regresi terfokus: 19/19 tes lulus, mencakup penolakan pembacaan ikan lain, ID alat tunggal yang dibatasi enum, nama duplikat, batas respons/jumlah alat, keamanan argumen, origin HTTP, serta pemisahan angka harga mentah dari harga per kg yang belum diketahui. Pemeriksaan tipe server lulus. Tidak ada panggilan provider tambahan dari peninjau ini.
