# Layanan AI Phase 4.6

Catatan Phase 4.6. Antarmuka sekarang memakai agen terpadu `/api/agent` ([PHASE4_7_AGENT.md](PHASE4_7_AGENT.md)). Rute `/api/archive-agent` yang dijelaskan di bawah masih ada di server, tetapi tidak lagi dipanggil antarmuka.

## Harga dari kolom

Prompt Vision sekarang meminta `priceBasis` per item: `null` jika bukti tidak ada, atau `{kind:'column_header',text:teks_asli,columnAssociation:'clear'|'uncertain'}`. Nilai `unitPrice` tetap literal baris, tidak ditambahi header buatan. Header harus terlihat dan terhubung ke harga pada baris itu. Header terpotong, satuan bertentangan, `/g`, `/100g`, dan hubungan kolom ambigu tetap memerlukan tinjauan sesuai normalizer. Tidak ada pembagian subtotal dengan berat untuk mengisi harga.

Tes mock structured-provider menggunakan 11 baris acuan kompleks: seluruh harga dengan bukti kolom `Harga/kg (Rp)` menjadi usulan per kg dan nominal akhir independen Rp2.206.300. Ini bukan pembacaan live baru. Empat respons live Phase 4.5.1 tetap asli dan tetap merekam harga ternormalisasi yang belum diketahui sebelum perubahan ini.

## Pertanyaan arsip

`server/archive-agent.ts` mengekspor `validateArchiveAgentRequest` dan `runArchiveAgent`. Isi POST hanya `{requestId,question}`; workspace dari sesi yang diautentikasi server. `server/app.ts` memasang origin/header, batas badan, kuota bersama, timeout, pembatalan koneksi, dan helper akses arsip. Hak sesi/keanggotaan diperiksa lagi saat pembacaan; perpindahan ruang kerja selama permintaan harus menolak hasil lama.

Saat provider aktif, satu panggilan Gemini memilih satu alat `summarize_archive({fromDate,toDate})` atau klarifikasi tanggal. Model tidak menerima arsip, nominal transaksi, dokumen, atau ID workspace. Argumen tambahan, workspace dari model, alat tulis, beberapa panggilan alat, tanggal tidak sah, rentang terbalik, dan rentang melebihi 366 hari ditolak. Jawaban menggunakan `summarizeArchive` dari data server yang berhak dibaca; teks bebas dan angka model tidak dipakai.

Saat provider belum tersedia, parser tanggal dasar mendukung tanggal ISO, tanggal lengkap Indonesia, rentang dua tanggal, dan `hari ini` dalam WIB. Respons dilabeli **Panduan dasar · data arsip server**, `provider.name='basic'`. Ini tetap ringkasan data server aktual; tidak meniru Gemini. Galat provider aktif tidak otomatis beralih ke dasar. Pertanyaan dasar tanpa tanggal jelas meminta tanggal.

Respons memuat `requestId,workspaceId,timezone,fromDate,toDate,totalRupiah,transactionCount,draftCount,transactions,answer,provider`. Referensi transaksi hanya ID, revisi, tanggal transaksi, dan total. Revisi terkonfirmasi terbaru dihitung sekali; draf, hari tanpa transaksi, nilai Rp0, dan total belum diketahui dibedakan.

## Pertanyaan melalui suara

`POST /api/voice/question` memakai `VoiceRequest` yang sama dengan rekaman lama dan `X-BuktiLaut-Voice:1`. `validateVoiceInput` tetap memvalidasi WAV PCM mono 16 kHz, ukuran maksimum 2 MB, durasi 0,25–30 detik, struktur chunk, dan sinyal audio. Rekaman browser dikonversi oleh adapter yang ada sebelum dikirim setelah persetujuan.

`transcribeQuestionWithGemini` hanya menghasilkan `{requestId,sourceId,sourceRevision,transcript}`. Tidak ada ekstraksi ikan, jawaban pertanyaan, pemilihan pasangan, atau perubahan pemeriksaan. Ucapan diperlakukan sebagai data tidak tepercaya; transkrip kosong boleh menjadi pengamatan sah. Client `src/services/voiceQuestion.ts` memvalidasi identitas dan batas teks, mendukung abort/timeout konfigurasi, serta menyembunyikan pesan galat mentah. UI menaruh transkrip pada kolom yang bisa diedit; pengguna tetap menekan Kirim.

Kunci dan model server tidak diubah. Tidak ada panggilan berbayar, pembacaan kunci/.env aktual, atau penyimpanan rekaman mentah dari pekerjaan ini. Riwayat chat boleh menyimpan teks sesuai kontrol akses akun. Pengguna melaporkan mikrofon bisa digunakan; laporan itu tidak membuktikan endpoint transkripsi pertanyaan bebas sudah diuji live.

## Verifikasi

13 tes terfokus lulus: ringkasan total Rp2.696.300 dari dua transaksi dan satu draf, revisi terbaru tanpa duplikasi, akses alat tanggal, argumen tidak sah, batas keluaran, tidak ada fallback palsu, pertanyaan suara bebas, identitas lama, teks tidak valid, dan regresi Gemini. Pemeriksaan tipe server lulus sebelum integrasi ke `server/app.ts`. Pengujian rute dan regresi aplikasi dijalankan setelah integrasi.

Dokumentasi resmi yang diperiksa 18 November 2026: [GenerateContent REST](https://aistudio.google.com/api-reference/generate-content), [FunctionDeclaration JSON Schema](https://aistudio.google.com/api-reference/caching#Resource:FunctionDeclaration), [function calling](https://aistudio.google.com/docs/function-calling), dan [audio/transkripsi](https://aistudio.google.com/docs/audio). Adapter tetap memakai REST `generateContent`, model terkonfigurasi, dan batas aplikasi yang sudah ada. Dokumen tidak menjanjikan layanan gratis atau retensi nol oleh provider.
