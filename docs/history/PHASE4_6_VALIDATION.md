# Phase 4.6 — akun, arsip dan Ombak Pintar

18 November 2026. Status ini menggantikan status fase lama pada README. Implementasi dan pengujian lokal selesai; belum dilakukan deployment publik.

## Hasil yang tersedia

- Login/Register berbasis sesi server, arsip pribadi dan ruang tim. Pengguna memilih sendiri kapan mengirim pemeriksaan lokal ke akun. Demo tanpa akun tetap tersedia lewat **Buka contoh**.
- Arsip menyimpan foto sumber privat, hasil baca AI, koreksi, pasangan, penyesuaian serta revisi tetap. UUID transaksi bertahan saat retry. Penyimpanan identik tidak menggandakan transaksi; perubahan dari revisi lama ditolak dengan konflik409.
- Tanggal nota harus dikonfirmasi pengguna. Ringkasan WIB memakai revisi terkonfirmasi terbaru tiap transaksi. Draf, total belum diketahui, Rp0 dan hari tanpa transaksi dibedakan.
- Ombak Pintar dapat merangkum arsip per tanggal/rentang dengan sumber transaksi. Saat Gemini tidak diaktifkan, hasil diberi label **Panduan dasar · data arsip server**. Ini perhitungan server aktual, bukan respons Gemini tiruan.
- Chat tersimpan per pengguna, ruang kerja dan konteks. Tutup/buka panel serta refresh mempertahankan riwayat yang sesuai. Pertanyaan pemeriksaan **Apa yang masih perlu saya cek?** memakai status mesin, bukan angka rekaan.
- Voice pertanyaan memakai perekaman yang sudah ada: rekam, dengarkan, setujui pengiriman, tinjau/edit transkrip, lalu tekan Kirim. Rekaman mentah tidak disimpan ke arsip/chat.
- Header `Harga/kg` diterima sebagai bukti satuan hanya bila hubungan kolom jelas. Nilai mentah serta alasan normalisasi tetap tersedia. Header ambigu/bertentangan tetap **Belum diketahui**; tidak ada inferensi subtotal÷berat.

## Verifikasi aktual

| Pemeriksaan | Hasil dan batas bukti |
|---|---|
| Suite otomatis | **177/177 lulus**, termasuk9tes akun, validasi dokumen/ikan, harga, domain arsip, adapter AI/Voice, rute HTTP, penyimpanan dan follow-up |
| TypeScript dan build produksi | Lulus; React/Vite dibangun dari aplikasi yang sama |
| Arsip pribadi | Register dan simpan melalui UI; browser Chrome independen masuk akun sama, membuka foto identik, pasangan, penyesuaian2kg dan PDF Rp490.000 |
| Tim dan akun luar | UI membuat tim, membuat kode undangan terikat email dan menerima sebagai anggota; foto anggota200, pemilihan ruang/detail/foto akun luar403 |
| Revisi dan retry | Retry identik kembali ke revisi1, perubahan basi409; revisi2berstatus draf mempertahankan revisi1terkonfirmasi dalam total |
| Total arsip UI | Dua transaksi sintetis11November sebesar Rp2.206.300 dan Rp490.000 → **Rp2.696.300 dari2transaksi**;1draf dikecualikan, transaksi tanggal lain dikecualikan,2tautan sumber tersedia. Revisi baru tetap dihitung sekali |
| Chat UI | Tidak meminta ringkasan saat panel dibuka; tutup/buka dan refresh memulihkan riwayat server. Lebar360/393/768/1440 tidak meluber horizontal; kolom kirim terjangkau |
| Vision harga | Provider tiruan pada foto kompleks:11usulan jelas, impor/konfirmasi eksplisit, totalmesin Rp2.206.300.11harga dengan header ambigu tetap kosong/unknown |
| Voice pertanyaan | Mikrofon sintetis/provider tiruan: playback lokal, persetujuan, transkrip dapat diedit, tidak auto-kirim, track dibersihkan |
| Regresi draf dan demo | Draf lama dengan konfirmasi salah dibatalkan tanpa menghapus sumber/penyesuaian; tidak dapat melewati validasi saat simpan. Buka contoh tanpa akun sampai laporan mobile/PDF Rp490.000 lulus |

Bukti ada di `../outputs/Phase4-6-accounts`, `Phase4-6-browser/totals`, `Phase4-6-ai-browser`, dan `Phase4-6-regression`. Script pengulang ada di `../work/phase46-*.mjs`; script menggunakan pustaka CDP lokal Codex sehingga bukan syarat menjalankan aplikasi. Pengujian lint tidak diklaim karena repo tidak menyediakan perintah lint.

## Pembagian pekerjaan

- **core_engine:** kontrak revisi/total arsip, pemilihan revisi terkonfirmasi, normalisasi bukti harga, hitungan follow-up, dan review integritas.
- **frontend_ux:** akun/arsip/tim, pengendalian konteks dan konflik, riwayat chat, kartu sumber, input Voice dan label privasi/laporan.
- **ai_processing:** bukti header dalam Vision, alat ringkasan arsip yang hanya membaca, transkripsi pertanyaan bebas, pengujian mock dan review transparansi AI.
- **storage_ops:** autentikasi/sesi SQLite, revisi atomik, foto privat, undangan tim, otorisasi chat/arsip, uji browser independen serta panduan operasi.
- **Koordinator:** rute HTTP, port pengujian terisolasi, tes integrasi, regresi demo/draf, verifikasi gabungan dan paket sumber.

## Menjalankan dan mengulang demo

1. Gunakan **Node24**, ekstrak ZIP, masuk ke `buktilaut-interactive-prototype`, jalankan `npm ci`. Pertahankan `.env` yang sudah dimiliki; untuk instalasi baru salin `.env.example` saja. Jangan menimpa kredensial yang sudah ada.
2. Terminal pertama: `npm run api`. Terminal kedua: `npm run dev`. Buka alamat Vite yang ditampilkan. Default API8787 dan frontend5173. Kedua proses harus berasal dari folder versi ini. Bila port berbeda, atur `VISION_PORT`, `BUKTILAUT_API_PORT` pada proses Vite dan daftar `VISION_ALLOWED_ORIGINS` yang sesuai.
3. **Buka contoh** → konfirmasi catatan timbang → isi berat Teri pada nota10kg setelah melihat sumber → konfirmasi nota → konfirmasi kedua pasangan → Lihat laporan. Sumber asli12kg tetap terlihat bersama nota10kg; penyesuaian tidak wajib untuk mencetak temuan terbuka.
4. Untuk arsip nyata lokal, pilih Mulai pemeriksaan dan tinjau sumber sendiri. Login/Register → Simpan pemeriksaan aktif → pilih tanggal nota dan konfirmasikan → simpan. Buka browser/profil lain, login akun sama, buka arsip, sumber, pemeriksaan serta laporan.
5. Untuk tim, buat ruang tim, undang email anggota, salin kode, lalu akun anggota menerima kode tersebut. Tidak ada pengiriman email otomatis. Uji akun luar dengan URL/detail yang sama: akses harus ditolak server.
6. Dari arsip pilih **Tanya total arsip**, masukkan tanggal lengkap, lalu Kirim. Untuk fixture kriteria kompetisi, harness `phase46-totals-ui.mjs` membuat data sintetis terpisah melalui API terautentikasi; bukan data produksi atau hasil OCR nyata.

Detail konfigurasi, skema, pencadangan dan batas akun: [ACCOUNTS_STORAGE_PHASE4_6.md](../ACCOUNTS_STORAGE_PHASE4_6.md). Kontrak AI/Voice dan batas bukti: [PHASE4_6_AI.md](../PHASE4_6_AI.md).

## Batas yang masih harus diketahui

Tidak ada panggilan provider baru dalam fase ini. Empat pembacaan Vision live Phase4.5.1 adalah bukti historis sebelum prompt/header baru; hasilnya tidak diubah dan tidak dijadikan bukti bahwa perubahan baru sudah lulus Gemini live. Pengguna telah melaporkan mikrofon asli dapat merekam; transkripsi pertanyaan bebas Gemini live dan penggunaan HP fisik belum diverifikasi oleh pengujian fase ini.

Dua sesi browser independen membuktikan sinkronisasi ke backend yang sama, bukan deployment internet atau pengujian dua perangkat fisik. Akun lokal belum mempunyai verifikasi kepemilikan email dan reset kata sandi. Sebelum publikasi, konfigurasi HTTPS/cookie Secure, alamat host/proxy, operasi database persisten dan pemulihan akun perlu dituntaskan. Server saat ini loopback. Jangan menyebutnya siap layanan publik tanpa pekerjaan tersebut.

Database `.data`, akun uji, hash kata sandi, sesi, kode undangan, `.env` dan rekaman privat **tidak disertakan dalam ZIP**. Pengguna instalasi baru membuat akun sendiri. Jangan menghapus database privat saat memperbarui kode.
