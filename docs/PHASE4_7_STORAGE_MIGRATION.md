# Penyimpanan dan migrasi Phase 4.7

Skema akun naik dari `user_version=1` ke `2`. ID internal `transaction_id` beserta ruang kerjanya tetap menjadi identitas utama. Migrasi tidak mengubah JSON pemeriksaan, baris sumber, hasil AI, koreksi, pasangan, penyesuaian, foto BLOB, nomor revisi, anggota tim, sesi, undangan, hubungan Google, atau riwayat chat. Tautan yang menggunakan ID lama tetap dapat dibuka.

## Referensi dan metadata

Referensi seperti `BL-20261120-000001` unik **dalam satu database arsip, melintasi semua ruang kerja**. Database pada instalasi terpisah mempunyai namespace terpisah. Angka diterbitkan server melalui counter harian di dalam transaksi tulis SQLite dan indeks unik. Counter tidak dihapus ketika suatu transaksi dihapus; referensi yang pernah diterbitkan tidak digunakan ulang. Nomor yang batal sebelum transaksi berhasil tidak pernah diterbitkan kepada pengguna.

Awalan tanggal adalah tanggal penerbitan menurut WIB, bukan tanggal penjualan. Untuk arsip lama, awalan memakai `created_at` revisi pertama menurut WIB. Referensi tetap sama jika tanggal penjualan, status, atau metadata berubah pada revisi berikutnya. Tanggal transaksi yang dihitung tetap tanggal nota yang dikonfirmasi pengguna. ID lama yang kebetulan berbentuk `BL-...` dipertahankan; penerbitan melewati nomor tersebut agar alias tidak ambigu. Transaksi baru memakai ID internal, bukan memasukkan referensi buatan klien.

Revisi menyimpan metadata opsional `transactionTime`, `counterpartyName`, dan `receiptNumber`. Waktu berbentuk `HH:mm` atau `HH:mm:ss` dalam konteks WIB. Teks nama lawan transaksi dan nomor nota berasal dari masukan/tinjauan pengguna. Nilai yang tidak dikirim diwarisi dari revisi dasar; `null` menghapus nilai secara eksplisit. Spasi awal/akhir dibuang, teks kosong menjadi `null`, dan karakter kontrol ditolak. Pengulangan permintaan dengan nilai normalisasi yang sama tetap idempoten. Metadata revisi lama tidak ditulis ulang.

## Cadangan dan kegagalan

Sebelum perubahan skema 1, server mengambil kunci tulis `BEGIN IMMEDIATE`, membaca ulang versi, lalu membuat cadangan melalui koneksi baca terpisah dengan `VACUUM INTO` dan `synchronous=FULL`. Kunci tersebut mencegah penulis lain mengubah data di antara snapshot dan migrasi. Berkas cadangan bernama `<lokasi-db>.before-v2-<uuid>.sqlite`; nama selalu baru. Cadangan mencakup transaksi yang sudah masuk WAL, diperiksa dengan `quick_check`, dan harus tetap mempunyai versi 1 sebelum `ALTER TABLE` dimulai. [Dokumentasi SQLite menjelaskan sifat snapshot konsisten dan batas kegagalan `VACUUM INTO`](https://www.sqlite.org/lang_vacuum.html).

Kegagalan cadangan membatalkan pembukaan server tanpa mengubah skema. Kegagalan setelah perubahan skema membatalkan seluruh transaksi, termasuk kolom dan counter baru. Versi 2 yang sudah selesai tidak dimigrasikan ulang. Database dengan versi lebih baru ditolak. Database tanpa versi tetapi berisi tabel ditolak untuk pemeriksaan manual; aplikasi tidak menebak skema atau menginisialisasi ulang data tersebut. Timestamp lama yang tidak valid atau transaksi tanpa revisi awal juga membatalkan migrasi.

Database dan cadangan berisi data privat. Simpan keduanya di lokasi terlindungi, di luar folder publik. Pola SQLite/WAL/SHM telah dikecualikan dari Git. Pembuatan ZIP manual tetap harus secara eksplisit mengecualikan `.data`, seluruh database, cadangan, WAL dan SHM; `.gitignore` tidak otomatis mengatur ZIP. Laporan pengujian hanya mencatat pola nama cadangan, bukan menyalin database atau token pengguna.

## Langkah pembaruan lokal

1. Hentikan seluruh API BuktiLaut yang menggunakan database tersebut. Jangan menjalankan versi lama bersamaan dengan versi baru setelah migrasi.
2. Pastikan `BUKTILAUT_ACCOUNT_DB_PATH` tetap menunjuk lokasi privat yang benar. Nilai default tetap `.data/accounts.sqlite`, relatif terhadap folder kerja API. Jangan menghapus atau mengganti database untuk melewati kesalahan migrasi.
3. Sediakan ruang disk dan izin membuat cadangan di samping database. Jalankan API baru dengan Node 24. Pembukaan pertama membuat cadangan lalu migrasi; kegagalan membuat server berhenti agar operator dapat memperbaiki penyebabnya.
4. Setelah berhasil, buka satu transaksi lama melalui ID lama. Periksa foto, hasil tinjauan, revisi, pasangan, penyesuaian dan PDF. Pastikan referensi yang sama muncul setelah buka ulang dan revisi baru.
5. Pertahankan cadangan privat. Sebelum pemulihan manual, hentikan API dan simpan salinan kondisi terkini. Jangan menimpa database aktif dengan cadangan lama: transaksi baru sesudah waktu cadangan akan hilang. Pemulihan perlu keputusan operator berdasarkan waktu cadangan dan revisi yang sudah masuk.

Implementasi dan pengujian Phase 4.7 ini tidak membuka atau memigrasikan database pengguna yang sebenarnya. Uji migrasi menggunakan database tiruan sementara yang dibuat di dalam tes, termasuk salinan skema versi 1.

## Kontrak baca dan izin

`GET /api/archive/query` menerima `fromDate`, `toDate`, `status`, `counterpartyName`, `reference`, `receiptNumber`, `transactionId`, `offset`, dan `limit`. Status default `confirmed` memilih revisi terkonfirmasi terbaru setiap transaksi sebelum filter. Status `draft`/`all` memakai revisi kerja terbaru. Batas halaman 1–50; ringkasan dihitung dari seluruh hasil yang cocok, bukan hanya halaman pertama. Hasil hanya berupa kartu metadata dan ringkasan, tanpa foto atau catatan sumber mentah.

Jalur lama `GET /api/archive` tetap menerima `from`/`to`, serta filter baru; defaultnya `all` untuk daftar pekerjaan. Detail, revisi, dan foto dapat dibuka menggunakan ID kanonis lama atau referensi. Akses arsip privat milik ruang lain menghasilkan respons 404 yang sama dengan ID tidak ditemukan. Setiap baca, pencarian, ringkasan, foto, dan chat memeriksa sesi serta keanggotaan aktif. Pengguna yang dikeluarkan dari tim ditolak, termasuk ketika masih memegang cookie atau objek identitas lama. Header ruang asal mencegah permintaan tertunda berpindah ke ruang kerja baru.

Riwayat tetap menerima struktur lama. Jawaban gabungan baru menyimpan pasangan `unifiedRequest`/`unifiedAnswer`; validator memeriksa proyeksi pertanyaan, jawaban, dan ruang kerja yang diizinkan. Jawaban dari ruang lain, pasangan yang tidak lengkap, serta data mentah audio/video/gambar ditolak tanpa mengganti riwayat yang sudah tersimpan.

## Bukti yang dijalankan

`server/accounts-migration.test.ts` menguji cadangan WAL, kesinambungan data lama, migrasi ulang, kegagalan cadangan, rollback skema/counter, skema tanpa versi, benturan ID lama dengan referensi, metadata revisi, sepuluh transaksi pada satu tanggal, pencarian berhalaman, izin, serta dua worker dengan koneksi SQLite terpisah yang membuat dua puluh transaksi bersamaan.

`server/accounts.test.ts` mencakup HTTP akun, BLOB/foto dan pemulihan, CAS/idempotensi, tim, chat, kedaluwarsa, rollback, serta regresi metadata/pencarian, 404 tanpa kebocoran keberadaan, anggota yang dicabut, dan riwayat gabungan. Seluruh data merupakan fixture sintetis. Uji ini tidak memanggil Gemini, tidak menguji HP fisik, dan tidak menjadi bukti deployment.

Jalankan dari folder aplikasi: `node --experimental-strip-types --test server/accounts-migration.test.ts server/accounts.test.ts`. Rincian hasil akhir dicatat dalam laporan verifikasi Phase 4.7 oleh koordinator.
