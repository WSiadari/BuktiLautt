# Strict Fish Matching — hasil perbaikan

14 November 2026 · aplikasi BuktiLaut Phase 4.2 yang sama · branch `codex/strict-fish-matching`.

**FIXED AND TESTED.** Konfirmasi bukan sekadar diberi peringatan: nama berbeda/ambigu, baris yang tidak tersedia, dan pemakaian ulang baris nota ditolak oleh domain serta jalur simpan. Tidak ada perubahan Gemini/.env, maskot, animasi, dependensi, atau deployment.

## Aturan nama

Normalisasi hanya untuk perbandingan: Unicode NFKC, trim, huruf kecil, penggabungan whitespace berulang, dan satu awalan generik `ikan ` yang dinyatakan eksplisit. Nama pada catatan sumber tidak ditulis ulang.

- `Teri`, ` TERI `, `teri`, `Ikan Teri` dan bentuk full-width yang ekuivalen dibandingkan sebagai label yang sama.
- `Teri` berbeda dari `Tongkol`/`Kembung`; `Teri Medan` juga tidak diratakan menjadi `Teri`.
- Nama jelas lainnya, misalnya `Tuna`, tetap dapat dicocokkan persis. Ini bukan katalog terbatas tiga ikan.
- Nama kosong, tanda ambigu seperti `T?ri` atau `Teri/Tongkol`, alternatif/campuran, placeholder seperti unknown/tidak terbaca, dan kategori umum seperti ikan/ikan laut ditolak. Pengguna harus memeriksa sumber dan mengoreksi nama secara eksplisit.
- Tidak ada fuzzy matching, perbaikan typo, alias spesies, atau kemiripan AI. Ini identitas label tertulis, bukan klaim bahwa aplikasi mengidentifikasi spesies biologis dari foto.

## Lapisan penegakan

1. `validatePair` memeriksa baris aktual berdasarkan ID, kesetaraan nama dan reservasi baris nota. Dua baris bernama sama tetap memiliki identitas sendiri.
2. `confirmPair` menolak konfirmasi tidak valid tanpa mengubah draf. Pengulangan konfirmasi valid yang sama tidak mengaktifkan ulang penyesuaian.
3. `calculatePair` dan pratinjau sekarang memerlukan nama timbang/nota. Nama berbeda, ambigu, atau tidak diberikan tidak menghasilkan hitungan pasangan terkonfirmasi. Aritmetika gram, penyesuaian dan Rupiah tetap memakai aturan sebelumnya.
4. `isDraft`/`saveDraft` menolak draf baru atau impor yang mengklaim konfirmasi tidak valid. Pemeriksaan struktur yang lebih longgar hanya dipakai untuk pemulihan data lama, sebelum `sanitizeMatches` mencabut konfirmasinya.
5. Dropdown hanya memuat nota dengan nama kompatibel. Baris nota yang telah dipilih pasangan lain dinonaktifkan dan diberi label pemilik/barisnya. Handler tetap memeriksa ulang domain, termasuk ketika opsi DOM dipalsukan.
6. Kelayakan laporan memerlukan seluruh konfirmasi lulus pemeriksaan domain. Memaksa navigasi ke tahap laporan tidak menampilkan laporan yang berisi pasangan tidak valid.

## Draf lama dan penyesuaian

Saat pemulihan, pasangan terkonfirmasi yang tidak valid diubah menjadi pending dengan penanda Perlu ditinjau ulang. ID sumber, nama/berat asli, foto, nilai penyesuaian dan alasan lama dipertahankan. Penyesuaian tersebut tidak aktif dalam hitungan.

View yang baru diperbaiki tidak diklaim sudah committed ke IndexedDB. Perubahan baru disimpan melalui transaksi berikutnya yang berhasil. Salinan legacy tetap dipertahankan. Database version dan penyimpanan Blob tidak diubah.

Ketika pengguna mengganti pasangan atau mencatat tanpa pasangan, catatan invalid yang lama tetap tersedia di riwayat, termasuk ID, nama nota, nilai, alasan, revisi dan rujukan sumber. Riwayat invalid tidak tertimpa oleh keputusan berikutnya pada baris lain. Penyesuaian lama tidak dipindahkan diam-diam ke pasangan baru.

## Skenario yang diminta

| Timbang | Kandidat nota yang diperbolehkan | Hasil |
| --- | --- | --- |
| Kembung 12,5 kg | Tidak ada | Konfirmasi dinonaktifkan; baris tetap terlihat. Pengguna dapat mencatat tanpa pasangan. |
| Teri 0,5 kg | Teri 10 kg | Dapat dikonfirmasi pengguna. |
| Tongkol 1,25 kg | Tongkol 8 kg | Dapat dikonfirmasi pengguna. |

Pesan tanpa kandidat: **Tidak ditemukan jenis ikan yang sama pada nota penjualan.** Tidak ada keputusan tanpa pasangan yang dibuat diam-diam; pengguna tetap meninjau dan mencatatnya secara eksplisit.

## Verifikasi aktual

- **73/73 tes lulus**, termasuk domain, aritmetika, validator draf, IndexedDB dan regresi sebelumnya.
- Typecheck frontend/server dan production build lulus. Lint belum dikonfigurasi dan tidak diklaim lulus.
- Kasus diterima: Teri/Teri, TERI/teri, awalan Ikan, Unicode ekuivalen, serta label jelas Tuna yang sama. Kasus berbeda, ambigu, tidak tersedia, dan baris nota dipakai ulang ditolak.
- Uji fungsi langsung memverifikasi konfirmasi gagal tanpa mutasi. Uji aritmetika menolak nama berbeda/ambigu/nama yang dihilangkan.
- Browser Chrome terisolasi memeriksa skenario persis di atas, opsi dropdown, percobaan menyisipkan opsi palsu, panggilan domain, dan upaya menyimpan draf palsu. Semua ditolak; draf tidak berubah menjadi pasangan salah.
- Browser memeriksa laporan: hanya dua pasangan yang benar terkonfirmasi; Kembung tercantum tanpa pasangan dengan berat 12,5 kg. Navigasi paksa pada draf invalid tidak merender laporan aktif.
- Record IndexedDB lama disimulasikan dengan dua konfirmasi salah dan penyesuaian lama. Pemulihan mencabut keduanya, mempertahankan alasan/nilai, dan meminta tinjauan. Setelah beberapa perubahan keputusan dan refresh, kedua catatan penyesuaian masih tersimpan sebagai riwayat dan tidak aktif pada pasangan baru.
- Dua baris Teri yang terpisah bisa dikonfirmasi menggunakan dua baris nota berbeda. Opsi yang sudah dicadangkan berlabel dan disabled.
- Nama AI `T?ri` tidak dapat dikonfirmasi. Koreksi manusia menjadi Teri memungkinkan pencocokan; rawText dan sumber asli tetap utuh, provenance menjadi Dikoreksi pengguna.
- Matching diperiksa tanpa overflow pada 320, 375, 390, 768, 1280 dan 1440 px. Screenshot desktop/mobile serta keadaan draf lama diperiksa langsung. Ini emulasi viewport, bukan uji perangkat fisik.
- Perjalanan regresi Phase 4.2 juga dijalankan kembali: impor parsial/refresh/reimport, koreksi 9 menjadi 10 kg, penyesuaian 2 kg, total/laporan dan penolakan sumber kedaluwarsa tetap lulus. Tambahan 24 probe viewport pada perjalanan itu lulus.
- Tidak ada exception JavaScript yang tidak tertangani pada skenario browser tersebut. Tidak ada panggilan ekstraksi Gemini; regresi ekstraksi memakai respons tiruan berlabel.

## File utama

- `src/lib/matching.ts` dan `matching.test.ts`: aturan normalisasi, validasi/konfirmasi, pemulihan, riwayat invalid dan pengujian baru.
- `src/lib/examination.ts` dan `examination.test.ts`: pemeriksaan identitas sebelum hitungan pasangan, tanpa mengubah rumus.
- `src/App.tsx`: kandidat/konfirmasi/penjelasan, riwayat dan gerbang laporan.
- `src/types.ts`: metadata tinjauan opsional yang kompatibel dengan draf lama.
- `src/services/storage.ts`, `storage.test.ts`: pemisahan shape recovery dan validasi konfirmasi baru.
- `src/services/indexedDb.ts`, `indexedDb.test.ts`: pemulihan yang mencabut konfirmasi invalid dan regresi persistensi, tanpa perubahan versi/schema store.
- `src/vision.css`: gaya pesan matching yang langsung terkait; tanpa animasi baru.

README dan konteks diperbarui untuk menunjuk laporan ini. Daftar perbedaan lengkap dan hash konfigurasi berada pada file audit di folder bukti.

## Bukti

Pada ZIP, buka `outputs/Strict-Matching/after`:

- `expected-desktop.png`, `expected-mobile.png`: skenario Kembung/Teri/Tongkol.
- `valid-report.png`: laporan dua konfirmasi valid dan Kembung tanpa pasangan.
- `legacy-review.png`: konfirmasi lama dicabut, penyesuaian tetap diperlihatkan tidak aktif.
- `duplicate-name-reservations.png`, `ambiguous-mobile.png`: reservasi nama berulang dan nama belum jelas.
- `browser.json`: hasil pemeriksaan aktual, termasuk bypass dan enam lebar.
- `tests.txt`, `typecheck.txt`, `build.txt`: log perintah akhir.
- `phase42-regression.json`: regresi perjalanan sebelumnya; provider diintersep sebagai tiruan.
- `file-audit.json`: bukti kode provider, maskot dan dependensi tidak diubah.

Pertahankan `.env` ketika memperbarui dari ZIP. Tidak ada reset draf, publikasi, atau deployment. Keterbatasan browser lokal/lintas tab dari Phase 4.2 tetap berlaku; normalisasi tidak menebak nama yang salah atau menyamakan varietas berbeda.
