# Catatan timbang dari suara

16 November 2026. Voice memakai server, model Gemini, kredensial, persetujuan pengelola, batas penggunaan, dan timeout yang sama dengan AI Vision. Konfigurasi aktual dan model tidak diubah pada implementasi ini. API key tetap di server. Tidak ada provider atau mode berbayar baru yang diaktifkan.

Model default proyek `gemini-3.5-flash-lite` terdokumentasi menerima audio dan mendukung keluaran terstruktur. Model aktual yang dikonfigurasi tetap menjadi pilihan pengelola. Jika model berbeda, pengelola perlu memastikan dukungan audionya. [Dokumentasi model](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite)

Gemini mencantumkan WAV dan WebM pada format audio yang didukung. Daftar yang diperiksa tidak mencantumkan `audio/mp4`. Aplikasi menormalkan hasil rekaman browser ke WAV sebelum pengiriman, sehingga tidak bergantung pada penerimaan MP4 langsung oleh provider. [Format audio resmi](https://aistudio.google.com/docs/audio#supported-formats)

## Alur dan format

Tab Suara tersedia pada Catatan Timbang. Browser memilih format MediaRecorder yang didukung dari WebM/Opus, WebM, MP4/AAC, atau MP4. Setelah berhenti, klip asli dipertahankan pada sesi untuk playback. `prepareVoiceAudio` mendekode secara lokal menggunakan Web Audio, melakukan downmix dan resampling, lalu menghasilkan WAV PCM 16-bit mono 16 kHz. Pemrosesan lokal ini tidak mengirim audio ke server.

Persetujuan eksplisit pengguna diperlukan sebelum POST `/api/voice`. Endpoint hanya menerima WAV kanonis tersebut, maksimal 2 MB dan durasi 0,25 sampai 30 detik. Durasi dihitung dari jumlah byte PCM dan format yang diverifikasi server. Nilai durasi dari klien tidak diterima. Server memeriksa RIFF/WAVE, format PCM, ukuran chunk, sample rate, channel, batas data, serta sinyal kosong. Payload rusak, format lain, audio terlalu panjang, dan audio tanpa sampel sinyal ditolak sebelum provider dipanggil.

Klip mentah tidak masuk `VoiceResult`, draf, IndexedDB, atau log server. Transkrip, metadata ekstraksi, baris yang dipilih, dan koreksi memakai penyimpanan draf yang ada. Setelah refresh, transkrip dan isian dapat dipulihkan, sementara playback memerlukan rekaman baru. Browser yang tidak dapat merekam atau mendekode formatnya tetap mempunyai Teks dan Foto.

## Kontrak dan pengamanan

`src/voice/contract.ts` mendefinisikan `VoiceRequest` dengan `requestId`, `sourceId`, `sourceRevision`, dan `audioDataUrl`. Respons `VoiceResult` memuat `transcript`, `vision`, dan `unresolvedFields`. Hasil Vision di dalamnya tetap mempunyai workflow `weighing`, klasifikasi aktual independen v2, normalisasi yang dapat diperiksa, serta `requiresReview=true`.

Ucapan diperlakukan sebagai data tak tepercaya. Instruksi dalam audio tidak boleh mengubah kebijakan, memanggil alat, mengunjungi URL, atau menulis catatan. Transkrip mempertahankan ucapan asli. Bilangan Indonesia yang terdengar jelas dapat dinyatakan sebagai angka pada usulan. Berat atau satuan ambigu tetap null. Validator menolak hasil yang sekaligus mengaku berat belum pasti dan memberikan berat yang ternormalisasi pasti. Nama ambigu tetap dapat ditelusuri melalui transkrip dan ditahan oleh validasi nama pada alur pemeriksaan.

API Voice berbagi pembatasan origin, header khusus, jumlah permintaan, konkurensi, anggaran harian, pembatalan, dan timeout dengan Vision. Provider dipanggil melalui URL Gemini tetap, tanpa tool calling. Respons provider dibatasi dan diperiksa skemanya. Pesan galat publik tidak membawa kredensial atau payload mentah. Respons terlambat harus diabaikan oleh konsumen berdasarkan identitas rekaman, revisi, dan request aktif. Impor selalu memakai tindakan pengguna serta guard yang menjaga koreksi sebelumnya.

Persetujuan pengiriman menjelaskan bahwa suara dikirim ke Gemini. Ketentuan penyedia berlaku untuk data audio, termasuk kemungkinan penggunaan data pada layanan tanpa biaya. Gunakan rekaman sintetis untuk pengujian dan hindari informasi sensitif pada layanan yang tidak mengizinkannya. [Ketentuan data Gemini](https://aistudio.google.com/docs/terms#data-use-unpaid)

## Menjalankan dan menguji

Jalankan API dengan `npm run api` dan frontend dengan `npm run dev` dari folder aplikasi. GET `/api/voice/status` melaporkan ketersediaan, model, timeout, format WAV, serta batas durasi/ukuran. Status ini tidak memanggil Gemini. Tidak ada variabel audio tambahan yang wajib diisi.

Tes terfokus berikut memakai provider tiruan, termasuk regresi endpoint gambar.

```powershell
node --experimental-strip-types --test --test-timeout=15000 src/voice/*.test.ts src/services/voice.test.ts server/voice.test.ts server/gemini.test.ts server/app.test.ts
npm run typecheck
```

Untuk smoke nyata yang sudah diizinkan pengelola, buka Catatan Timbang pada localhost atau HTTPS, pilih Suara, rekam satu ucapan sintetis pendek, hentikan, putar ulang, lalu setujui pengiriman. Contoh ucapannya adalah Teri dua belas kilo, Tongkol delapan kilo. Periksa transkrip, usulan 12 kg dan 8 kg, identitas sumber, koreksi, dan konfirmasi eksplisit. Lanjutkan dengan nota contoh, matching, penyesuaian, serta laporan melalui alur yang sama. Jangan menyamakan keberhasilan request dengan akurasi transkripsi.

Implementasi server/client diuji dengan mock. Smoke Gemini nyata, dekode rekaman aktual dari Safari/Chrome, dan mikrofon pada HP fisik perlu dicatat terpisah oleh tim. Tanpa bukti tersebut, dukungan API tidak menjadi klaim bahwa seluruh perangkat telah lulus. Pelafalan Indonesia dari TTS bahasa lain juga tidak menjadi acuan akurasi lapangan.
