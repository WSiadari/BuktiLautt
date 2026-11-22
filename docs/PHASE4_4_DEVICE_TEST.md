# Uji perangkat Phase 4.4

## Menjalankan pembaruan

Pertahankan .env yang sudah dipakai dan origin browser lama agar draf tetap ditemukan. Jangan menyalin contoh kosong di atas kredensial. Jalankan `npm ci`, lalu restart `npm run api` dan `npm run dev` pada dua terminal di folder aplikasi. Voice memakai server yang sudah diperbarui, bukan proses Phase 4.3 yang masih berjalan.

## Android fisik tanpa deployment

Mikrofon browser membutuhkan secure context: HTTPS atau localhost. Membuka alamat IP laptop melalui HTTP biasa tidak cukup. Rujukan: [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

1. Jalankan aplikasi pada laptop, frontend 127.0.0.1:5173 dan API 8787.
2. Sambungkan Android dengan kabel USB, aktifkan Developer options dan USB debugging, lalu izinkan laptop tersebut.
3. Di Chrome laptop buka `chrome://inspect/#devices`, pilih **Port forwarding**, tambahkan port perangkat 5173 → `localhost:5173`, lalu aktifkan port forwarding.
4. Di Chrome HP buka `http://localhost:5173`. Permintaan API diteruskan Vite ke laptop; jangan menjalankan API key di HP.
5. Untuk langkah debug khusus perangkat lihat [panduan resmi Chrome](https://developer.chrome.com/docs/devtools/remote-debugging/local-server). Jika perangkat tidak muncul, periksa otorisasi USB dan driver; jangan menonaktifkan aturan keamanan browser.

Untuk iPhone/Safari gunakan origin HTTPS dengan sertifikat yang dipercaya perangkat dan server/API origin yang dikonfigurasi pengelola. Fase ini tidak men-deploy situs atau memasang sertifikat di HP. Pembuktian Android tidak menggantikan pengujian Safari.

## Suara dan Ombak Pintar

1. Mulai pemeriksaan baru, pilih **Suara** pada Catatan Timbang. Teks/Foto tetap tersedia.
2. Tekan **Mulai rekam**, izinkan mikrofon. Ucapkan: “Teri dua belas kilo, Tongkol delapan kilo.” Periksa label Merekam, waktu berjalan dan gerakan lembut Ombak Pintar.
3. Hentikan rekaman; indikator mikrofon harus berhenti. Putar klip, atau rekam ulang jika tidak jelas. Batal/berpindah halaman juga harus menghentikan mikrofon.
4. Kirim hanya setelah menyetujui pengiriman rekaman. Periksa label Memproses rekaman dan animasi yang berakhir saat hasil atau error muncul; tidak ada persen progres palsu.
5. Tinjau transkrip terhadap suara. Harapan dari ucapan contoh: Teri 12 kg dan Tongkol 8 kg. Jika hasil berbeda, koreksi; jangan menganggap hasil model pasti benar. Nama/bobot ambigu tetap perlu ditinjau.
6. Pilih usulan lalu tambahkan ke form. Tekan dua kali dan pastikan baris tidak ganda. Edit nilai, refresh dan pastikan transkrip/usulan/koreksi pulih; klip pemutaran hanya hidup pada sesi aktif.
7. Konfirmasi Catatan Timbang melalui tombol yang sudah ada. Usulan tidak boleh otomatis mengonfirmasi sumber/pasangan.
8. Ulangi dengan izin mikrofon ditolak dan suara tidak jelas. Teks/Foto harus tetap bisa dipakai; tidak ada baris tebakan. Saat proses berlangsung, berpindah sumber lalu pastikan respons lama tidak diterapkan.
9. Aktifkan pengurangan gerak pada sistem/peramban. Informasi status tetap terbaca tanpa loop animasi.

## Nota, nominal dan PDF

1. Pilih Foto pada Nota Penjualan, unggah `evaluation/02-clear-receipt.png`, setujui AI, tinjau lalu tambahkan Teri 10 kg × Rp25.000 dan Tongkol 8 kg × Rp30.000. Koreksi bila perlu.
2. Sebelum mengisi biaya dan potongan, periksa ringkasan **Belum diketahui**. Isi 0 secara eksplisit: ringkasan harus Rp0. Ubah potongan menjadi 1000: ringkasan harus **Potongan · Rp1.000**, langsung mengikuti input.
3. Kembalikan potongan 0 dan biaya 0 untuk skenario total Rp490.000. Konfirmasi nota. Total tertulis bukan bukti biaya yang tidak tertulis bernilai 0.
4. Konfirmasi pasangan Teri dan Tongkol. Teri harus 12 kg ↔ 10 kg dengan selisih awal 2 kg. Catat tidak terjual 2 kg beserta alasan lalu simpan: sisa 0 kg; berat sumber tetap 12 dan 10 kg. Tongkol 8 kg ↔ 8 kg.
5. Buka laporan, periksa total Rp490.000, lalu **Cetak laporan** → Simpan PDF. Periksa sumber asli/penyesuaian terpisah dan maskot tidak masuk cetakan.
6. Pada form nota dan sidebar pemeriksaan, periksa Rp240.000 dan Rp490.000 pada layar sempit; digit tidak boleh terpotong/terpisah atau membuat halaman bergulir horizontal. Label boleh turun baris.

## Status bukti

Pengujian dengan provider tiruan menguji perilaku aplikasi, bukan akurasi suara Gemini. Isi status live Gemini/perangkat fisik dari laporan validasi terbaru. Catat model, browser, dan OS, apakah klip nyata atau sintetis, transkrip aktual, koreksi dan PDF; jangan mencatat API key. Satu contoh lulus tidak membuktikan semua aksen atau kondisi lapangan.
