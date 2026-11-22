# Phase 4 — hasil dan batas verifikasi

13 November 2026. Branch kerja: `feature/buktilaut-phase4-real-ai-vision`. Project: `buktilaut-interactive-prototype` pada workspace BuktiLaut yang sama. Baseline sebelum perubahan: 18 tes dan build lulus; ZIP Phase 3.1 dipertahankan sebagai cadangan. Perubahan pengguna yang sebelumnya belum di-track tidak dihapus atau di-commit massal; riwayat Git tidak ditulis ulang.

**Kesimpulan:** jalur integrasi lokal siap ditinjau dengan provider nonaktif. Penerimaan P0 yang mensyaratkan respons provider nyata masih BELUM TERVERIFIKASI. Pengguna meminta penyiapan tanpa panggilan berbayar dan tidak ada kredensial. Tidak ada deployment produksi.

## Sudah dibuat

| Area | Hasil |
| --- | --- |
| Server AI | Node HTTP loopback, adapter REST Gemini terpisah, konfigurasi server-only, default model gemini-3.5-flash-lite; kedua flag aktivasi false |
| Batas input | JPG/PNG/WebP, decode aktual Sharp, EXIF orientation, ukuran/frame/piksel dibatasi; teks opsional dibatasi; tidak mengambil URL klien |
| Keluaran | Skema ketat, raw nullable, isu ketidakpastian, normalisasi kg/g dan Rupiah; tidak menghitung subtotal atau mengisi nilai hilang dengan nol |
| Human review | Persetujuan pengiriman, hasil AI terpisah, pilihan baris eksplisit, koreksi, snapshot konfirmasi; AI tidak mengonfirmasi pasangan/penyesuaian |
| Keandalan | Abort/token/source/revision guards, timeout, galat aman, retry manual terbatas rate limit; fallback manual tidak menimpa koreksi dengan fixture |
| Draf/foto | IndexedDB metadata + Blob atomik, antrean, resolusi setelah commit, migrasi mempertahankan localStorage lama; status pemulihan dibedakan dari simpan sukses |
| UI | Marine Blue dipertahankan; kartu usulan, persetujuan, raw JSON disclosure, status nyata versus demo, label/input ponsel, pesan unggahan gagal terlihat di mobile |
| Aset | WebP lossless papan 935.128 byte dan hero transparan 649.486 byte; PNG awal 1.737.142 dan 1.164.958 byte tetap disertakan. Semua alpha dan RGB piksel terlihat dibandingkan dan sama |
| Chat | Tetap terskenario berlabel, read-only; bukan chatbot AI nyata atau agent |

Harga satuan hanya dinormalisasi jika basis per kg terlihat eksplisit. Berat dalam kg tidak membuktikan harga per kg. Subtotal tercetak tetap disimpan terpisah saat harga belum diketahui. Sumber, raw ekstraksi, koreksi dan snapshot konfirmasi memiliki peran berbeda. `src/lib/examination.ts` tetap identik dengan baseline Phase 3.1.

## Pemeriksaan yang benar-benar dijalankan

- `npm run typecheck`: frontend dan server lulus.
- `npm run build`: lulus, 44 modul; JS 313,84 kB/gzip 95,41 kB; CSS 63,70 kB/gzip 13,21 kB. Tidak mengklaim skor Lighthouse/FPS/kecepatan perangkat nyata.
- `npm test`: **44/44 lulus**. Mencakup hitungan, skema/normalisasi, hasil usang, protokol provider tiruan, gambar invalid, origin/header, concurrency, timeout, anggaran harian, disconnect, IndexedDB, migrasi, atomic abort, dan pemisahan snapshot. Uji tambahan endpoint nonaktif/key hilang/persetujuan pengelola hilang juga lulus tanpa provider call.
- Lint belum dikonfigurasi; tidak dinyatakan lulus.
- API Node yang benar-benar berjalan: status 200 dengan available=false; POST ber-origin lokal 503 NOT_CONFIGURED; origin asing 403. UI asli menonaktifkan pengiriman saat belum dikonfigurasi.
- Browser dengan **CDP MOCK PROVIDER, bukan Gemini**: dua PNG sintetis dipilih, tidak ada POST sebelum persetujuan, raw nota sengaja 9 kg dikoreksi menjadi 10 kg. Raw 9, isian koreksi 10, snapshot konfirmasi 10, timbang 12, dan penyesuaian 2 tersimpan terpisah. Laporan Rp490.000; refresh memulihkan foto dan seluruh nilai tersebut tanpa penulisan localStorage baru.
- Empat tahap/tampilan (usulan timbang, usulan nota, matching, laporan) × enam lebar 320/375/390/768/1280/1440 tidak overflow. Landing diperiksa pada enam lebar, tanpa gambar rusak. Ini pemeriksaan browser desktop dengan emulasi viewport, bukan perangkat fisik.
- Browser galat: timeout provider tiruan, respons malformed, manual cancel atas respons terlambat, reduced motion, dan foto korup lulus; isian 11 kg tetap ada. Foto korup membuka tab yang memuat galat pada mobile.
- Browser penyimpanan: legacy + foto berhasil dimigrasikan tanpa menghapus salinan lama; IDB ditolak tetap memulihkan legacy dengan status belum tersimpan; kegagalan commit penyesuaian mempertahankan editor dan hasil lama; retry setelah penyimpanan pulih berhasil.
- Keyboard: skip link, dialog bernama, focus trap, Escape dan pemulihan fokus lulus. Bukan audit WCAG menyeluruh atau uji pembaca layar.
- PDF laporan fixture sintetis dengan subtotal/jejak AI dicetak browser, diperiksa pdfinfo dan dirender Poppler: satu halaman A4; bobot 12/10, penyesuaian 2, sisa 0 dan Rp490.000 terlihat, tanpa maskot/navigasi. Tidak menjamin satu halaman untuk data arbitrer.
- Core engine melakukan review kode terfokus tanpa menemukan P1/P2 baru; review ini terpisah dari hasil pengujian. Storage dan AI owner juga melakukan tinjauan batas masing-masing. Tidak mengklaim audit keamanan menyeluruh.

Bukti: `outputs/Phase4-browser` pada ZIP. `journey-mocked-provider.json`, `ai-recovery-mocked.json`, `storage-browser-recovery.json`, `real-local-disabled-api.json`, `real-api-disabled-consent.json`, `keyboard.json`, `smoke.json`, PNG dan PDF memisahkan bukti mock dari endpoint nyata nonaktif. Helper QA browser pada folder work memakai helper CDP lokal penulis; sesuaikan path sebelum dipakai di komputer lain. Tes npm tidak membutuhkan helper tersebut.

## Belum terverifikasi / diblokir konfigurasi

- **Respons Gemini nyata, kualitas OCR, akurasi per bidang, latency provider, biaya dan kuota akun: belum diuji.** Tidak ada panggilan provider eksternal pada fase ini.
- 15 gambar evaluasi sintetis dan manifest tersedia; seluruh actual fields/status provider tetap null/not_run. Hasil mock browser tidak dimasukkan sebagai akurasi dataset. Kasus tulisan tangan memakai font simulasi, belum mewakili manuskrip manusia.
- Script live-smoke terpisah tanpa aktivasi menghasilkan SKIPPED. Menjalankan tes npm tidak mengaktifkan script tersebut.

## Batas dan pekerjaan berikutnya

P0 untuk rilis AI nyata: setelah otorisasi/config yang sesuai, jalankan smoke provider pada gambar sintetis, isi hasil aktual manifest, koreksi prompt/normalisasi berdasarkan bukti, dan verifikasi kelayakan akun/ketentuan data. Tahap ini tidak dapat dinyatakan telah memenuhi penerimaan live-provider.

P1 sebelum publik: deployment API/frontend dengan HTTPS, autentikasi/otorisasi serta isolasi pengguna, pembatasan biaya/rate limit bersama dan peninjauan privasi. Origin/header lokal bukan autentikasi. Tidak ada deployment otomatis atau aktivasi billing pada pekerjaan ini.

P2: uji perangkat fisik, pembaca layar dan data laporan panjang; ukur latensi/CPU saat foto mendekati batas; tangani konflik lintas tab dan optimasi antrean simpan untuk foto besar; perluas refactor App jika scope terus tumbuh. Penyimpanan saat ini satu slot pengguna dan satu demo per origin, bukan sinkronisasi akun atau cadangan. Eviction browser tetap mungkin; commit lintas tab terakhir dapat menang. Tidak ada sistem monitoring eksternal, advanced agent, voice, atau chatbot AI nyata.

## Panduan menjalankan

Dari folder aplikasi, jalankan `npm ci`, salin `.env.example` ke `.env` dengan flag tetap false, lalu `npm run api`. Terminal kedua: `npm run dev`. Buka `http://127.0.0.1:5173`; API `http://127.0.0.1:8787`. Jika port sudah dipakai sesi preview, gunakan server yang sudah berjalan atau hentikan server lama sebelum memulai ulang. README dan docs/AI-INTEGRATION.md memuat konfigurasi serta sumber resmi.
