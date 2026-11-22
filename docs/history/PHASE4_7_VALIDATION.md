# Phase 4.7 — agent terpadu dan identitas transaksi

Implementasi melanjutkan Phase4.6.6. Migrasi dan kontrak diselesaikan sebelum perubahan UI, sesuai prioritas pengguna. Database pengguna yang sebenarnya tidak dibuka atau dimigrasikan oleh pengujian ini.

## Urutan dan hasil utama

1. Baseline retry Phase4.6.6 dipertahankan; konfigurasi privat tidak disalin atau diubah.
2. Kontrak UUID/referensi, metadata revisi, query dan agent dibekukan. Tes independen migrasi+query+kontrak lulus sebelum frontend mendapat izin mengubah UI.
3. Skema SQLite2 menambahkan referensi server dan metadata tanpa mengganti UUID, sumber, hasil AI, koreksi, pasangan, penyesuaian atau revisi lama. Backup konsisten diverifikasi sebelum perubahan skema; kegagalan membatalkan migrasi.
4. Endpoint `/api/agent` menyatukan pertanyaan pemeriksaan, arsip, total, jumlah, pencarian dan panduan. Gemini memilih satu tool yang diizinkan; server memeriksa sesi/ruang kerja dan menghasilkan angka/jawaban deterministik. Fallback dasar diberi label.
5. UI memakai satu Ombak Pintar, indikator ruang aktif, kartu transaksi bereferensi, hasil terbatas/expandable, filter metadata dan mikrofon di sebelah Kirim. Riwayat lama serta pemisahan pengguna/ruang/konteks dipertahankan.

Referensi `BL-YYYYMMDD-000001` unik lintas ruang kerja **dalam satu database**. Bagian tanggal adalah tanggal penerbitan WIB, bukan tanggal transaksi. UUID/ID lama tetap kunci utama dan tautan lama tetap berlaku. Tanggal transaksi yang dikonfirmasi pengguna tetap menentukan total. Metadata opsional tidak diisi oleh tebakan AI.

## Arsitektur ringkas

Chat React mengirim pertanyaan dan proyeksi pemeriksaan minimal ke `/api/agent`. Rute memeriksa origin/header, ukuran, sesi, kuota dan timeout. Model hanya memilih delapan tool baca atau dua utility non-database. Callback memeriksa ulang akses sebelum membaca data dan sebelum respons selesai. Domain memilih revisi terkonfirmasi terbaru per UUID, memfilter ruang/tanggal/pihak/status dan menghitung hasil. Respons divalidasi bersama sebelum ditampilkan/disimpan.

Foto, audio mentah, transkrip catatan timbang dan catatan alasan tidak dikirim sebagai konteks pemilihan tool. Voice pertanyaan memakai pipeline yang ada: rekam lokal → tinjau/persetujuan → transkripsi → kolom yang dapat diedit → Kirim manual. Tidak ada tool agent yang menulis atau mengonfirmasi transaksi.

Detail kontrak/retry: [PHASE4_7_AGENT.md](../PHASE4_7_AGENT.md). Detail penyimpanan dan migrasi: [PHASE4_7_STORAGE_MIGRATION.md](../PHASE4_7_STORAGE_MIGRATION.md).

## Verifikasi dan batas bukti

**Hasil akhir: 221/221 tes, pemeriksaan tipe aplikasi/server dan build produksi lulus.** Tujuh pemeriksaan browser UI serta tiga pemeriksaan tambahan riwayat/sesi lulus pada backend lokal nyata. PDF akhir dua halaman dirender dan ditinjau; teksnya memuat referensi yang benar, revisi arsip3, revisi pemeriksaan2, waktu10:45 dan metadata pengguna yang diperbarui. Rekaman angka tes awal pada `storage-migration.json` adalah checkpoint pemilik modul; status akhir mengikuti `final-verification.json`.

- Migrasi diuji pada SQLite skema1 sintetis dengan WAL, JSON sumber/AI, foto BLOB, snapshot tinjauan, revisi, Google, sesi, chat dan anggota. Backup, rerun, rollback setelah ALTER, kegagalan backup, versi tidak dikenal, benturan ID lama dan dua worker bersamaan diuji. Referensi tidak didaur ulang setelah penghapusan uji.
- Pemilik pribadi/tim, anggota sah, anggota dicabut dan akun luar diuji pada arsip/query/detail/foto/chat. ID asing dan ID tidak ditemukan memberikan404 yang sama. Permintaan agent yang ruang kerjanya berubah ditolak.
- Tes HTTP integrasi memakai API akun/SQLite nyata dan Gemini tiruan:10transaksi berbeda,8terkonfirmasi2draf, revisi pertama diperbarui dariRp1.000 menjadiRp3.100. Total8revisi terkonfirmasi terbaru adalah **Rp38.100**; tidak ada hitung ganda. Pertanyaan Teri12/10kg, total tim dan pencarian dua transaksi Pabrik Mina Jaya melewati rute yang sama.
- Uji browser memakai API8807 nyata dengan provider eksternal dinonaktifkan: percakapan yang sama menjawab Teri2kg lalu arsip Rp38.100; referensi/filter/detail/revisi/PDF; tutup/buka chat; viewport360/390/768/1440; tanpa UUID, pilihan mode atau overflow horizontal. Form metadata diuji sampai revisi arsip3, dengan referensi/sumber tetap. Pipeline audio pada harness ini menggunakan mikrofon dan transkripsi tiruan; hasilnya dapat diedit dan tidak terkirim otomatis. Penolakan mikrofon dan pembatalan mempertahankan teks.
- Pengujian riwayat tambahan memastikan empat pesan baru tersimpan di server dan pulih setelah refresh. Logout menghilangkan chat privat dari UI; akun berbeda pada konteks yang sama mendapat riwayat kosong. Login/Register, Dashboard, lanjut pemeriksaan dan Kembali ke Dashboard tetap bekerja.
- Review silang menemukan filter pihak yang hilang pada fallback total serta status pencarian yang terlalu luas. Keduanya diperbaiki dan dites untuk jalur dasar maupun Gemini tiruan: filter eksplisit dipertahankan atau meminta klarifikasi, bukan memperluas cakupan.
- Hasil suite akhir dan bukti browser dicatat pada `../outputs/Phase4-7-verification/tests-final.log` dan `../outputs/Phase4-7-browser/checks.json`. Pengujian memakai data sintetis; tidak ada panggilan Gemini live/berbayar baru.

Jumlah Rp37.000 pada tes unit agent dan Rp38.100 pada tes HTTP/browser berasal dari fixture berbeda. Keduanya dihitung dari acuan masing-masing; bukan nominal transaksi pengguna. Tidak ada klaim akurasi Gemini live atau kepatuhan aksesibilitas100%.

## Memperbarui laptop tanpa kehilangan arsip

1. Hentikan API BuktiLaut lama. Identifikasi folder aplikasi dan database yang benar-benar dipakai instalasi Anda. Pertahankan `.env` dan `.data`; jika memakai `BUKTILAUT_ACCOUNT_DB_PATH`, pertahankan nilai/lokasi itu. Jangan menjalankan dari folder baru dengan database kosong lalu menganggap arsip lama hilang.
2. Ekstrak kode baru ke instalasi yang benar atau arahkan instalasi baru ke database lama setelah seluruh API lama dihentikan. Jangan menimpa database dengan fixture, dan jangan menghapus database untuk melewati error.
3. Gunakan Node24, jalankan `npm ci`, kemudian `npm run api`. Pembukaan database skema1 membuat `<lokasi-db>.before-v2-<uuid>.sqlite`, memeriksanya dan bermigrasi secara atomik. Backup gagal berarti API berhenti tanpa memaksakan migrasi. Sediakan ruang disk dan izin membuat backup.
4. Terminal kedua pada folder yang sama: `npm run dev`. Default API8787/frontend5173. Buka transaksi lama melalui ID lama; cocokkan sumber, pasangan, revisi dan laporan. Referensinya harus tetap sama setelah revisi berikutnya.
5. Simpan backup privat. Jangan menjalankan kode skema1 pada database yang sudah skema2. Pemulihan backup lama memerlukan API dihentikan dan keputusan operator karena transaksi yang dibuat setelah backup dapat hilang.

ZIP tidak memuat `.env`, database/backup/WAL/SHM, cookie sesi, akun uji privat, `node_modules` atau `dist`. Akun QA pada harness bukan akun demo yang dibagikan.

## Langkah demo terpendek

- Masuk → Dashboard → Mulai pemeriksaan baru atau Lanjutkan draf. Tinjau kedua sumber dan pasangan. Buka Ombak Pintar dan tanyakan selisih ikan yang ada, kemudian total arsip dengan tanggal lengkap pada chat yang sama.
- Simpan ke akun dengan tanggal terkonfirmasi dan metadata yang memang diketahui. Buka Arsip, cari berdasarkan referensi/pihak/nomor nota, buka pemeriksaan dan ekspor PDF. Membuka arsip tidak membuat transaksi baru.
- Tekan mikrofon, hentikan rekaman, tinjau dan setujui transkripsi, koreksi teks, lalu tekan Kirim. Pembatalan tidak mengirim pertanyaan.
- Pergantian ruang dilakukan secara eksplisit melalui pemilih workspace. Pertanyaan yang menyebut ruang berbeda meminta pergantian, tanpa menjumlahkan ruang tersebut.

“20 November” tanpa tahun meminta tanggal lengkap; request belum membawa konteks penafsiran tanggal dari percakapan sebelumnya. Fallback dasar mendukung `hari ini` dan minggu kalender Senin–Minggu WIB. Bahasa/rentang lain yang belum jelas meminta klarifikasi.

Pengguna sebelumnya melaporkan perekaman mikrofon asli bekerja. Itu tidak membuktikan transkripsi pertanyaan baru atau pemilihan tool Gemini pada fase ini sudah diuji live. HP fisik dan deployment publik belum diverifikasi pada fase ini.
