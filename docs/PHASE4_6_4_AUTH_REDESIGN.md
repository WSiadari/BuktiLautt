# Masuk dan Daftar — Phase 4.6.4

18 November 2026. Dasar implementasi: sumber aplikasi dalam `BuktiLaut-Phase4.6.3-Full.zip` yang diberikan pengguna. Folder aktif sebelumnya masih Phase4.6;16berkas versi lebih baru dipulihkan setelah dipastikan tidak ada perubahan lokal yang bertabrakan. Tidak ada proyek pengganti, perubahan mesin pemeriksaan, deployment, atau panggilan provider.

## Perubahan

- Panel Marine Blue memuat logo putih langsung pada permukaan, sambutan singkat dan Ombak Pintar asli. Geometri logo tidak diubah; varian putih hanya mengganti warna isian SVG resmi.
- Form putih, judul lebih terukur, jarak label/input konsisten, tombol utama solid, tombol Google sekunder. Pada HP panel dimulai dekat bagian atas; sambutan dipadatkan, sementara panel dapat digulir saat tinggi viewport pendek.
- `/masuk` dan `/daftar` menampilkan DOM halaman publik asal yang sama di belakang overlay blur. Bukan screenshot. Mode-switch mempertahankan konteks; Kembali/Escape/browser Back memulihkan halaman. Fokus kembali ke pembuka yang masih tersedia. Latar `inert` dan `aria-hidden`, fokus Tab ditahan dalam panel.
- URL langsung, refresh dan redirect halaman privat memakai Beranda publik sebagai latar cadangan. Konteks latar tidak disimpan ke localStorage/history sehingga tidak dipulihkan sebagai data privat pada sesi baru. Logout membersihkan konteks pembuka. Rute privat tetap memerlukan sesi.
- Tepat satu tombol mata aplikasi, label berubah sesuai keadaan, `type=button`, dapat dipakai lewat keyboard dan tidak menghapus sandi. Sandi kembali tersamarkan saat form baru dibuka. Penyesuaian `::-ms-reveal`/`::-ms-clear` hanya menargetkan kontrol sandi autentikasi; autocomplete username/current-password/new-password dipertahankan.
- Kedipan mata berlangsung setiap4,8detik, melalui gerak kelopak bertahap dan penutupan singkat. Overlay kelopak menggunakan koordinat relatif pada karakter sehingga ikut bergerak dan berubah ukuran. Mode reduced motion meniadakan gerak kelopak dan karakter.
- Loading, disabled, invalid dan error tersedia. Teks bantu sandi tersambung dengan `aria-describedby`; kesalahan server menggunakan `role=alert`. Nilai email/sandi dipertahankan saat permintaan gagal.

Setelah meninjau render awal, panel HP diubah dari pemusatan vertikal menjadi posisi atas agar judul/form lebih cepat ditemukan. Placeholder juga dipertegas dari rasio4,30:1 menjadi5,72:1 pada putih. Ini pemeriksaan pasangan warna tertentu, bukan klaim seluruh aplikasi memenuhi WCAG.

## Berkas implementasi

- `src/components/AccountAuth.tsx`: form, tombol mata, fokus, status dan penggunaan OAuth yang sudah ada.
- `src/account-pages.css`: komposisi/responsivitas, blur, kelopak, focus/error/loading/reduced-motion. Gaya Dashboard dipertahankan.
- `src/App.tsx`: konteks latar publik, pengembalian fokus dan integrasi panel pada rute yang sudah ada.
- `public/brand/buktilaut-horizontal-white.svg`: varian putih dengan path asli.

Tidak ada perubahan pada `server/accounts/google.ts`, autentikasi backend, kontrak API, konfigurasi/kunci Gemini, database pengguna, atau perhitungan pemeriksaan.

## Verifikasi aktual

| Pemeriksaan | Hasil |
|---|---|
| `npm test` | **179/179 lulus**, termasuk OAuth state/nonce/PKCE serta regresi akun/domain/arsip/Voice |
| `npm run typecheck` | Lulus |
| `npm run build` | Lulus,68modul; JS438,22kB dan CSS102,45kB sebelum gzip |
| Masuk dan Daftar | Chrome:320/390/768/1440px, tidak meluber horizontal, tombol utama dapat dicapai dengan scroll |
| Viewport pendek |390×420px: panel/form bisa digulir, tombol utama tetap terjangkau |
| Latar dan navigasi | Beranda dan catatan timbang yang sebenarnya dipertahankan; switch mode, Kembali, browser Back, fokus pembuka, URL langsung, refresh dan redirect privat diuji |
| Sandi | Mouse dan Space pada Chrome serta Microsoft Edge headless yang terpasang; nilai tetap ada, label/type berubah, satu tombol mata terlihat pada screenshot kedua form |
| Kedipan | Empat siklus lengkap diamati dalam21detik. Snapshot kelopak tertutup di desktop/mobile ditinjau. Reduced motion menghasilkan nol animasi karakter/kelopak |
| Akun lokal | Register → Dashboard; sesi setelah refresh; logout; sandi salah; koreksi lalu login email berhasil memakai API lokal nyata |
| Regresi navigasi | Dashboard, Arsip Transaksi, Ruang kerja tim, Pemeriksaan, Kembali ke Dashboard serta draf IndexedDB versi1 diuji melalui UI |
| Status form | Validasi kosong, tampilan loading dengan permintaan lokal yang sengaja ditunda, serta error kredensial nyata diuji |
| Google tidak tersedia | Status API lokal nyata; tombol dinonaktifkan dengan alternatif email |
| Google tersedia | UI memakai respons uji sintetis dari factory OAuth yang sama. Satu start eksplisit menghasilkan redirect Google/state/nonce/PKCE yang benar. Navigasi keluar diblokir agar tidak memulai login eksternal |
| Pemeriksaan desain | Screenshot desktop/mobile, kelopak terbuka/tertutup, Edge dan hasil final ditinjau. Detector Impeccable pada dua berkas UI mengembalikan `[]` |

## Bukti dan pengulangan

Screenshot final di arsip kerja tim (tidak disertakan di repo): `outputs/Phase4-6-4-auth/masuk-1440.png`, `masuk-390.png`, `daftar-1440.png`, `daftar-390.png`; varian320/768dan keadaan tambahan juga tersedia. Hasil pemeriksaan: `checks.json`, `edge-google-checks.json`, `recovery-checks.json`, dan `tests.log` di folder yang sama.

Harness `work/auth-redesign-qa.mjs`, `auth-edge-google-qa.mjs`, `auth-recovery-qa.mjs`, dan `auth-final-captures.mjs` (juga di arsip kerja tim) memakai pustaka CDP lokal penulis. Pengguna tidak membutuhkannya untuk menjalankan web. Pengujian memakai frontend5184/API8794 dan database sintetis privat terpisah. Instalasi biasa tetap menggunakan default5173/8787; jalankan kedua proses dari folder aplikasi versi baru.

## Belum diverifikasi

Login Google nyata dengan akun/kredensial pemilik, keyboard HP fisik, serta interaksi Edge berjendela pada perangkat pengguna belum diuji. Uji viewport pendek adalah emulasi ruang keyboard, bukan bukti keyboard fisik. Tidak ada panggilan Gemini. Tidak ada deployment publik; batas operasi akun/HTTPS sebelumnya tetap berlaku.

ZIP tidak menyertakan `.env`, database akun, cookie sesi, undangan privat atau `node_modules`. Pertahankan `.env` dan database `.data` milik pengguna saat memperbarui kode; akun QA tidak dibagikan.
