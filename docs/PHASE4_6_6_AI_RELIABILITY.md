# AI Vision — Phase 4.6.6

## Perubahan

- Pembacaan foto dan teks melalui `/api/vision` mencoba ulang maksimal dua kali setelah Gemini memberi HTTP 500/502/503/504 atau mengalami gangguan koneksi. Jeda bertahap 1 lalu 2 detik.
- Jika penyedia memberi `Retry-After` lebih dari 3 detik atau HTTP 429, aplikasi menghentikan percobaan otomatis dan meneruskan status untuk penanganan pengguna.
- Pembatalan atau batas waktu server menghentikan percobaan. Pemeriksaan tetap menyimpan sumber dan isian pengguna yang sudah ada.
- Terminal API menampilkan status HTTP penyedia dan nama model yang digunakan. Kunci API, isi dokumen, dan respons mentah penyedia tidak dicatat.
- Pesan kegagalan di form menjelaskan bahwa layanan Gemini sedang tidak tersedia atau gagal memproses sumber.

## Uji lokal

Jalankan `npm run typecheck`, `npm test`, dan `npm run build`. Tes mencakup pemulihan setelah kegagalan pertama dan kedua, kegagalan yang tetap terjadi setelah tiga panggilan, penghormatan `Retry-After`, pembatalan, koneksi terputus, dan alur HTTP `/api/vision` dari awal sampai akhir. Tes memakai respons Gemini tiruan dan tidak mengirim dokumen atau memanggil layanan berbayar.

Untuk uji langsung, mulai ulang `npm run api`, buka BuktiLaut di origin yang sama, lalu coba `evaluation/01-clear-weighing.png` dan `evaluation/complex/SINTETIS-catatan-timbang-clear.png`. Bandingkan 12 baris dari 10 jenis ikan dan dua lot Teri/Tongkol secara manual sebelum mengonfirmasi. Lanjutkan dengan nota kompleks.

Jika Gemini masih mengembalikan HTTP 503 setelah semua percobaan, gunakan pengisian manual atau `Buka contoh` untuk mendemonstrasikan pemeriksaan deterministik, pasangan, arsip, dan laporan. Tandai simulasi sebagai data sintetis. Pembacaan AI langsung tetap perlu diuji kembali dan tidak dijamin berhasil oleh perubahan ini.

## Konfigurasi dan pembaruan

- Pertahankan `.env` dan database `.data/accounts.sqlite` pada folder proyek yang sedang dipakai.
- Untuk memberi waktu lebih panjang pada pembacaan dokumen kompleks, atur `VISION_TIMEOUT_MS=60000` di `.env` dan restart server API. Batas ini juga berlaku untuk permintaan AI lain yang menggunakan layanan sama.
- Setiap klik pemindaian dapat memicu maksimal tiga permintaan ke Gemini. Evaluasi penggunaan kuota sebelum demo.
- OAuth, alur login, perhitungan, arsip, dan izin akses ruang kerja tidak diubah.

## Verifikasi yang belum dilakukan

Tes baru menjalankan provider tiruan. Hasil Gemini live, biaya aktual, kondisi jaringan saat kompetisi, dan HP fisik perlu diverifikasi oleh operator.
