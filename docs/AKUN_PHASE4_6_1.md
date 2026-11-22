# Halaman akun BuktiLaut Phase 4.6.3

- **Masuk** membuka `/masuk`. Pilih **Daftar sekarang** untuk membuka `/daftar`.
- Login dan pendaftaran berhasil membuka `/dashboard`. Klik **Arsip Transaksi** untuk membuka `/arsip` atau **Ruang kerja tim** untuk membuka `/tim`.
- Dari alur pemeriksaan, gunakan **Simpan pemeriksaan aktif** untuk mengarsipkan pemeriksaan. Ini memakai database dan pilihan tanggal yang sudah ada pada Phase 4.6.
- Di layar kecil, tombol menu berada di kanan header. **Masuk** juga tersedia di header bagi pengunjung. Saat sudah masuk, gunakan tombol **Kembali ke Dashboard** di halaman Pemeriksaan, Arsip Transaksi, Ruang kerja tim, atau Beranda.
- Ombak Pintar berkedip dengan kedua mata, lalu mengedipkan satu mata saat halaman masuk atau daftar dibuka. Efek mengikuti pengaturan pengurangan gerakan pada perangkat.

## Jalankan di laptop

Gunakan Node.js 24. Jalankan `npm ci` sekali. Jalankan `npm run api` dan `npm run dev` di dua terminal dari folder aplikasi. Pakai origin dan lokasi database yang sama saat memperbarui instalasi agar akun, arsip, dan draf bisa ditemukan kembali.

## Aktifkan opsi Google

Buat OAuth Client **Web application** di Google Cloud. Tambahkan redirect URI berikut pada **Authorized redirect URIs**:

`http://127.0.0.1:5173/api/account/google/callback`

Isi tiga nilai berikut di file `.env` pada folder aplikasi. Simpan lalu hentikan dan jalankan kembali `npm run api`.

```env
GOOGLE_OAUTH_CLIENT_ID=client-id-dari-google
GOOGLE_OAUTH_CLIENT_SECRET=client-secret-dari-google
GOOGLE_OAUTH_REDIRECT_URI=http://127.0.0.1:5173/api/account/google/callback
```

Buka aplikasi melalui `http://127.0.0.1:5173` untuk contoh konfigurasi ini. Cocokkan host dan port di URL aplikasi, redirect URI Google Cloud, dan `VISION_ALLOWED_ORIGINS`. Jika konfigurasi OAuth masih dalam mode pengujian, gunakan akun yang ditambahkan sebagai pengguna uji di Google Cloud. Untuk deployment, daftarkan callback HTTPS yang sesuai dan izinkan origin aplikasi melalui konfigurasi server. [Dokumentasi Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)

Jika tombol Google masih nonaktif, pesan di bawah tombol membedakan konfigurasi yang belum diisi, alamat aplikasi yang berbeda, dan API yang belum dapat dihubungi.

Akun baru dapat dibuat dengan Google dari halaman Daftar, dan identitas Google yang terdaftar bisa dipakai masuk kembali. Jika email sudah punya akun BuktiLaut, masuk dulu dengan kata sandi, pilih **Hubungkan akun Google** di Dashboard, lalu gunakan akun Google dengan alamat yang sama. Ini menjaga arsip lama tetap terkait ke akun yang benar.
