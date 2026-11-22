# Dashboard — Phase 4.6.5

Redesign langsung pada repositori Phase4.6.4. Area Pemeriksaan menjadi area kerja utama, Arsip Transaksi sebagai area kedua, dan Ruang kerja tim sebagai panel pendukung. Tidak ada dependensi baru, perubahan backend, perhitungan, atau deployment.

## Desain dan data

- Header ringkas dengan pemilih ruang kerja aktif. Menu **Akun** menampilkan identitas, aksi Keluar dan Hubungkan akun Google bila layanan tersedia. Menu mendukung Enter/Escape dan fokus keyboard.
- Pemeriksaan memakai dua cuplikan antarmuka sumber: catatan timbang dan nota. Bila ada draf, nama/berat dan status tinjauan berasal dari draf tersebut. Tanpa draf, cuplikan hanya menjelaskan isi sumber, tanpa angka atau status konfirmasi rekaan.
- Arsip tetap diambil saat membuka `/arsip`. Dashboard tidak mengambil daftar transaksi atau mengklaim arsip kosong. Tombol **Buka arsip transaksi** dipertahankan; teks menjelaskan sumber, penyesuaian dan revisi yang bisa ditemukan di sana.
- Nama ruang kerja dan peran berasal dari sesi. Tidak ada jumlah anggota, grafik, total transaksi atau aktivitas rekaan. Draf lokal dilabeli **Draf pada perangkat ini**, sedangkan salinan arsip dilabeli **Salinan arsip akun**.
- Marine Blue, logo dan gaya kontrol mengikuti Masuk/Daftar Phase4.6.4. Desktop memakai kolom Pemeriksaan yang lebih besar dan dua area pendukung. HP memakai satu kolom; aksi utama berada sebelum cuplikan sumber.

Setelah meninjau render pertama, teks cuplikan diperbesar dan alur tiga tahap disusun vertikal pada HP. Ini menjaga keterbacaan tanpa memampatkan seluruh alur ke satu baris kecil.

Referensi yang dipelajari, tanpa memasang atau menyalin template:

- [shadcn Dashboard](https://ui.shadcn.com/blocks/dashboard): pembagian area dan hierarki kontrol.
- [Tremor dashboard](https://github.com/tremorlabs/template-dashboard-oss): pengelompokan informasi dan status yang mudah dipindai. Angka contoh template tidak digunakan.
- [Carbon empty states](https://www.carbondesignsystem.com/building-blocks/core/patterns/empty-states): penjelasan konteks serta tindakan yang jelas ketika belum ada data.

## Perubahan alur Pemeriksaan

| Aksi | Perilaku |
|---|---|
| Mulai pemeriksaan baru, tanpa draf | Membuka **Catatan timbang**, dengan draf baru |
| Mulai pemeriksaan baru, ada draf | Memakai dialog konfirmasi yang sudah ada. Dashboard tetap terbuka sampai penggantian disetujui |
| Batalkan penggantian | Tetap pada Dashboard; sumber, baris, pasangan dan penyesuaian draf tidak berubah |
| Lanjutkan draf, timbang belum dikonfirmasi | Label dan tujuan **Catatan timbang** |
| Lanjutkan draf, timbang dikonfirmasi | Label dan tujuan **Nota penjualan** |
| Lanjutkan draf, kedua sumber dikonfirmasi | Label dan tujuan **Periksa pasangan** |
| Lanjutkan salinan arsip | Mempertahankan konteks arsip akun; tidak mengubahnya menjadi draf lokal |
| Buka arsip transaksi | Menuju `/arsip`; pilih transaksi → Buka pemeriksaan → Catatan timbang untuk melihat data lama |

`goInspection` kini terpisah dari aksi membuat draf baru. `begin` berpindah ke rute pemeriksaan setelah keputusan penggantian, sehingga pembatalan tidak memindahkan pengguna atau mengubah draf. Label dan tujuan lanjut memakai helper `inspectionProgress` yang sama. Kegagalan memulihkan draf tidak membuat draf kosong dianggap bisa dilanjutkan.

## Verifikasi yang dijalankan

- **180/180 tes lulus**, termasuk tujuan lanjut ketika salah satu sumber belum dikonfirmasi dan regresi domain/arsip/autentikasi/OAuth.
- `npm run typecheck` dan `npm run build` lulus. Build 71 modul, JS443,16kB dan CSS111,03kB sebelum gzip.
- Chrome pada320/390/768/1440px, kondisi tanpa draf dan dengan draf. Tidak ada overflow horizontal. Aksi pemeriksaan baru terlihat tanpa scroll pada viewport yang diuji.
- Register/login memakai API lokal nyata, sesi setelah refresh, logout, serta Kembali ke Dashboard diuji.
- Tanpa draf, aksi baru dibuka dengan keyboard dan menuju Catatan timbang. Draf timbang selesai menunjukkan dan membuka Nota penjualan. Kedua sumber selesai menunjukkan dan membuka Periksa pasangan.
- Pembatalan penggantian draf dibandingkan seluruh payload tersimpannya, termasuk sumber, pasangan dan penyesuaian: tetap sama. Persetujuan penggantian menghasilkan identitas baru pada Catatan timbang.
- Dashboard → Arsip → detail → Buka pemeriksaan → Catatan timbang menampilkan **Teri12kg** dan teks sumber identik dengan arsip sintetis. Melanjutkan dari Dashboard tetap mempertahankan salinan arsip akun.
- Arsip kosong diuji. Ruang tim dibuat melalui UI. Tim tidak menampilkan transaksi pribadi; setelah kembali ke ruang pribadi, hanya transaksi pribadi yang tampil. Nama dan peran pemilik di Dashboard mengikuti sesi.
- Keyboard: aksi pemeriksaan baru, Arsip, Kelola ruang kerja, pemilih ruang kerja, menu Akun, Escape dan Keluar. Tidak ada exception runtime pada pengujian.
- Detector desain pada komponen Dashboard dan CSS mengembalikan `[]`. Ini pemeriksaan mekanis tambahan, bukan sertifikasi aksesibilitas.

Pengujian menggunakan frontend5190/API8796, dokumen sintetis, database privat terpisah dan **tanpa panggilan provider**. Bukti ada di arsip kerja tim (tidak disertakan di repo): `outputs/Phase4-6-5-dashboard/checks.json`, `tests.log`, screenshot kosong/draf320/390/768/1440, kondisi tim dan menu Akun. Harness: `work/dashboard-redesign-qa.mjs` (arsip yang sama); memakai pustaka CDP lokal penulis, bukan syarat menjalankan aplikasi.

## Berkas yang berubah

- `src/components/AccountArea.tsx`: komposisi, menu akun, ruang kerja dan aksi Dashboard.
- `src/components/DashboardInspection.tsx`: area kerja serta cuplikan sumber dari draf sebenarnya.
- `src/dashboard.css`, `src/main.tsx`: gaya Dashboard yang terisolasi dari autentikasi dan halaman lainnya.
- `src/account-pages.css`: menghapus gaya tiga kartu Dashboard lama yang sudah tidak dipakai.
- `src/App.tsx`: membedakan pembuatan baru dan melanjutkan draf.
- `src/lib/inspectionProgress.ts` serta tesnya: tujuan lanjut dan label yang konsisten.

## Batas verifikasi

Dashboard baru diuji pada Chrome dengan viewport HP emulasi; belum diuji pada HP fisik atau Edge untuk fase Dashboard ini. Login Google nyata belum diuji; konfigurasi OAuth dan backend tidak diubah. Uji Edge pada Phase4.6.4 merupakan bukti halaman autentikasi, bukan bukti Dashboard baru. Tidak ada deployment publik atau pengujian produksi.

Gunakan Node24. Instalasi/upgrade: pertahankan `.env` dan database `.data`, jalankan `npm ci`, lalu `npm run api` serta `npm run dev` pada dua terminal dari folder aplikasi yang sama. Default port tetap8787/5173. ZIP tidak menyertakan konfigurasi privat, database/sesi, atau akun QA.
