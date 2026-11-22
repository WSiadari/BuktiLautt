# Pasangan dokumen kompleks sintetis

17 November 2026. Dataset `BL-SINTETIS-KOMPLEKS-01` dibuat untuk mengulang pemeriksaan pada sumber yang diketahui. Tidak ada dokumen asli pengguna yang diberikan. Seluruh nama unit, nomor referensi, lot dan transaksi pada dokumen ini adalah data latihan.

## Dokumen dan format

| Sumber | Versi jelas | Versi miring dan berbayang |
| --- | --- | --- |
| Catatan Timbang | `SINTETIS-catatan-timbang-clear` | `SINTETIS-catatan-timbang-tilt-shadow` |
| Nota Penjualan | `SINTETIS-nota-penjualan-clear` | `SINTETIS-nota-penjualan-tilt-shadow` |

Setiap nama tersedia sebagai SVG, PDF, PNG, dan JPG dalam direktori ini. SVG menyimpan teks dan bentuk vektor yang dapat disunting. PDF satu halaman A4 dibuat dari instruksi gambar yang sama. Versi kedua memutar kertas 1,2 derajat, mengecilkannya menjadi 94%, serta memberi bayangan sintetis ringan hingga 8%. Ini bukan foto kamera lapangan.

PDF dirender pada 180 dpi menjadi gambar 1489 × 2105 px, sekitar 3,13 megapiksel. Seluruh PNG/JPG berada di bawah 4 MB dan 20 megapiksel. Ukuran byte persis tercatat pada `manifest.json`. Gunakan PNG atau JPG untuk unggah aplikasi. SVG/PDF disertakan sebagai sumber sunting dan cetak, karena kontrol unggah saat ini menerima gambar JPEG/PNG/WebP.

Keempat PNG hasil render diperiksa secara visual. Kolom, nomor lot, angka desimal, harga, rekap dan label SINTETIS dapat dibaca. Kesalahan transparansi pada iterasi awal generator diperbaiki sebelum berkas dinyatakan siap untuk uji live. Berkas final mempertahankan bayangan ringan dan seluruh angka sumber.

## Data acuan independen

`generate.py` menghitung `groundtruth.json` dan `groundtruth-rows.csv` memakai Python `decimal.Decimal` dengan pembulatan Rupiah bulat HALF_UP per baris. Generator tidak mengimpor engine, parser, atau library perhitungan aplikasi BuktiLaut. Penghitungan ulang terpisah terhadap JSON memverifikasi jumlah perkalian dan total akhir.

Catatan Timbang memuat 12 baris dan 10 jenis ikan. Nota memuat 11 baris dan 9 jenis ikan. Teri dan Tongkol masing-masing muncul pada dua lot terpisah. Kerapu lot KU01 hanya berada pada Catatan Timbang.

| Lot | Ikan | Timbang kg | Nota kg | Harga/kg Rp | Subtotal Rp |
| --- | --- | ---: | ---: | ---: | ---: |
| T01 | Teri | 12,00 | 10,00 | 25.000 | 250.000 |
| TG01 | Tongkol | 8,00 | 8,00 | 30.000 | 240.000 |
| KB01 | Kembung | 5,50 | 5,50 | 32.000 | 176.000 |
| KP01 | Kakap | 3,25 | 3,25 | 75.000 | 243.750 |
| TN01 | Tuna | 6,75 | 6,75 | 68.000 | 459.000 |
| CK01 | Cakalang | 9,125 | 9,125 | 28.000 | 255.500 |
| SL01 | Selar | 4,80 | 4,80 | 26.000 | 124.800 |
| LY01 | Layang | 7,20 | 7,20 | 24.000 | 172.800 |
| KR01 | Kurisi | 2,65 | 2,65 | 38.000 | 100.700 |
| KU01 | Kerapu | 1,75 | Tanpa pasangan | Belum diketahui | Belum diketahui |
| T02 | Teri | 4,50 | 4,50 | 27.000 | 121.500 |
| TG02 | Tongkol | 2,25 | 2,25 | 31.000 | 69.750 |

Subtotal nota adalah Rp2.213.800. Potongan dokumen Rp15.000 dan biaya penanganan Rp7.500 menghasilkan total akhir Rp2.206.300. Total timbang 67,775 kg dan total nota 64,025 kg tetap menjadi dua angka sumber. Selisih Teri T01 sebesar 2 kg dapat dijelaskan melalui penyesuaian pengguna. Kerapu 1,75 kg tetap tanpa pasangan dan tidak diubah menjadi selisih nol.

## Hasil browser setelah tinjauan

Status IMPLEMENTED AND TESTED pada browser Chromium lokal yang melayani source workspace melalui port 5176. Harness `work/phase451-browser.mjs` berada di root workspace. Respons provider pada harness ini sepenuhnya tiruan dan tidak diteruskan ke Gemini.

1. Mengunggah kedua PNG jelas melalui kontrol Foto, menyetujui pemrosesan, dan mengimpor 12 serta 11 baris secara eksplisit.
2. Mock sengaja mengembalikan berat Kembung R03 sebesar 5,05 kg. Pengguna memperbaikinya menjadi 5,50 kg pada form. Hasil mentah tetap 5,05 kg dan asal nilai menjadi Dikoreksi pengguna. Galat buatan ini menguji jalur koreksi dan tidak menggambarkan akurasi OCR.
3. Seluruh nama, berat, harga dan subtotal sumber pada form akhir cocok dengan data acuan. Potongan dan biaya diisi berdasarkan dokumen. Dua Teri dan dua Tongkol tetap merupakan baris berbeda dengan harga masing-masing.
4. Sebelas pasangan dikonfirmasi satu per satu. Kerapu ditandai tanpa pasangan. Hubungan setiap lot diverifikasi melalui ID internal baris kedua sumber.
5. Mengetik penyesuaian 2 kg belum mengubah draf tersimpan. Setelah Simpan penyesuaian, Teri T01 tetap 12 kg timbang dan 10 kg nota, penyesuaian 2 kg, sisa 0 kg. Keterangan sintetis pengguna dipertahankan.
6. Setelah refresh, deep comparison seluruh draf identik dengan kondisi setelah penyimpanan. Foto sumber, hasil mentah, koreksi, keputusan dan penyesuaian tetap tersedia.
7. Laporan menunjukkan subtotal Rp2.213.800, potongan Rp15.000, biaya Rp7.500 dan total akhir Rp2.206.300. Kerapu tetap tercantum. Laporan tidak memiliki gulir horizontal pada 360 dan 393 px.

Laporan hasil aplikasi diekspor sebagai PDF tiga halaman. Teks PDF diperiksa terhadap nilai acuan dan ID SINTETIS. Ketiga halaman dirender serta diperiksa secara visual. Tidak ditemukan pemotongan baris atau angka. Susunan bagian menghasilkan ruang kosong pada halaman kedua, sementara aritmetika tetap utuh di halaman ketiga. Penyusunan ulang template cetak tidak termasuk pekerjaan ini.

Bukti relatif terhadap root workspace berada pada `outputs/Phase4-5-1-complex/checks.json`, `initial-mock.json`, `reviewed-draft.json`, tangkapan layar sebelum/sesudah koreksi, `complex-reviewed-report.pdf`, dan `report-page-1.png` sampai `report-page-3.png`. Proses akhir memakai ID `BL-SINTETIS-KOMPLEKS-01` agar laporan uji dapat dikenali.

## Pembacaan awal provider nyata

Orchestrator menjalankan empat panggilan Vision yang diizinkan pengguna, masing-masing satu kali tanpa retry, melalui Gemini `gemini-3.5-flash-lite`. Keempatnya menghasilkan HTTP 200 dengan jumlah baris 12/11/12/11 untuk pasangan jelas dan pasangan miring/berbayang. Respons aktual disimpan terpisah pada `outputs/Phase4-5-1-live`. Perbandingan per bidang terhadap data acuan dimiliki ai_processing dan tersedia pada `initial-extraction-comparison.json` di direktori bukti live.

| Bidang awal live | Hasil pasangan jelas dan miring/berbayang |
| --- | --- |
| Baris timbang | 12/12 pada masing-masing gambar, tanpa baris hilang atau tambahan. |
| Baris nota | 11/11 pada masing-masing gambar, tanpa baris hilang atau tambahan. |
| Nama, berat dan satuan | Cocok dengan data acuan; Teri/Tongkol berulang tetap dipisahkan. |
| Subtotal tiap baris | Cocok dengan data acuan pada kedua nota. |
| Potongan, biaya dan total tertulis | Rp15.000, Rp7.500 dan Rp2.206.300 sesuai pada kedua nota. |
| Harga mentah | Sebelas nominal pada setiap nota benar secara numerik, tetapi provider mengembalikan angka tanpa penanda `/kg` pada nilai harga. |
| Harga/kg siap pakai setelah normalisasi | 0/11 pada setiap nota. Seluruhnya tetap `null` karena dasar harga per kg belum tersurat pada nilai yang diterima parser. Ada 22 bidang harga yang perlu ditinjau pada dua nota live. |

Angka sumber yang terbaca benar tidak berarti seluruh hasil sudah siap untuk dihitung. Tidak ada klaim akurasi menyeluruh 100%. Galat berat 5,05 kg pada harness mock adalah injeksi pengujian terpisah dan tidak muncul pada pembacaan live.

## Tinjauan ulang keluaran live yang sudah direkam

`node --experimental-strip-types work/phase451-browser.mjs --replay-live` lulus pada port 5176. Harness memeriksa SHA256 kedua PNG jelas terhadap catatan panggilan live, kemudian memutar ulang raw output yang direkam. Metadata request disesuaikan dengan pemeriksaan browser yang baru. API browser dicegat sehingga tidak ada panggilan Gemini tambahan dan berkas raw live tidak diubah.

Sebelum koreksi, kedua belas baris timbang dan sebelas baris nota beserta beratnya benar, tetapi seluruh harga/kg pada form nota kosong. Sebelas harga diisi secara eksplisit dari kolom Harga/kg pada dokumen asli sintetis. Potongan dan biaya diisi lalu dikonfirmasi. Sebelas pasangan, satu Kerapu tanpa pasangan, penyesuaian Teri 2 kg dan pemulihan setelah refresh lulus. PDF tiga halaman menghasilkan total Rp2.206.300 sesuai acuan Decimal. Semua halaman PDF final dirender dan diperiksa. Hasil ini membuktikan alur setelah tinjauan pengguna pada keluaran live yang direkam.

Bukti terpisah berada pada `outputs/Phase4-5-1-live-review/checks.json`, `initial-live-replay.json`, `reviewed-draft.json`, tangkapan layar harga awal kosong, dan `complex-reviewed-report.pdf`. Dua request aplikasi pada harness dicegat secara lokal. Keempat panggilan live pertama tetap merupakan satu-satunya panggilan provider pada evaluasi ini.

Tidak ada panggilan provider tambahan dari storage_ops. Dokumen asli, ponsel fisik, serta Voice dengan mikrofon nyata tetap belum diuji pada tugas ini. Empat dokumen sintetis yang dapat dibaca tidak mewakili ketelitian umum pada seluruh nota lapangan.

## Mengulang di laptop

Jalankan versi aplikasi terbaru sesuai README sambil mempertahankan konfigurasi dan origin browser yang digunakan untuk draf. Unggah pasangan PNG jelas dari direktori ini. Bandingkan setiap bidang dengan tabel atau CSV sebelum konfirmasi, terutama Cakalang 9,125 kg, kedua lot Teri/Tongkol, seluruh harga/kg, potongan Rp15.000 dan biaya Rp7.500. Jika harga/kg masih kosong seperti pada pengujian live ini, isi sebelas nominal berdasarkan kolom Harga/kg dokumen. Biarkan Kerapu tanpa pasangan. Catat 2 kg Tidak terjual untuk Teri 12/10 dengan keterangan pengguna, simpan, refresh, lalu ekspor PDF. Versi miring/berbayang memakai data acuan yang sama.

Untuk membuat ulang sumber, jalankan `python evaluation/complex/generate.py` dari folder aplikasi pada lingkungan dengan ReportLab, Pillow dan Poppler. Mengulang harness mock memerlukan browser helper lokal yang ditunjuk dalam skrip. Panggilan Gemini live mengikuti izin pengguna dan batas penggunaan provider secara terpisah.
