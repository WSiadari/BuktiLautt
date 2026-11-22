# Integrasi AI Vision fase 4

Ditulis untuk Phase 4 dan diperbarui untuk perilaku server sekarang. Kalimat bertanggal dan jumlah tes menggambarkan kondisi pada fase tersebut.

13 November 2026. Integrasi disiapkan sesuai keputusan pengguna untuk menghindari panggilan berbayar. Tidak ada panggilan penyedia nyata pada pekerjaan ini. Hasil pengujian adapter dan HTTP memakai respons tiruan. Akurasi dokumen, latensi penyedia, serta biaya aktual belum diukur.

## Menjalankan lokal

Jalankan dari folder proyek menggunakan Node.js 24.

```powershell
npm ci
Copy-Item .env.example .env
npm run api
```

Terminal kedua menjalankan `npm run dev`. Frontend memakai Vite pada `http://127.0.0.1:5173` dan proxy `/api` ke API `http://127.0.0.1:8787`. Jika port frontend berubah, sesuaikan `VISION_ALLOWED_ORIGINS` dan gunakan origin yang sama saat membuka aplikasi. Bila `VISION_PORT` bukan 8787, jalankan `npm run dev` dengan `BUKTILAUT_API_PORT` bernilai sama agar proxy menuju API yang benar.

`.env.example` mempertahankan `VISION_ENABLED=false`, `VISION_DATA_PROCESSING_ACKNOWLEDGED=false`, dan kunci kosong. API tetap dapat dibuka dan status menunjukkan layanan belum tersedia. Pengisian manual serta demo sintetis tetap dapat digunakan. `.env` adalah konfigurasi server, dengan kunci `GEMINI_API_KEY` tanpa awalan `VITE_`.

Aktivasi eksternal baru dilakukan pengelola setelah memperoleh otorisasi yang sesuai, meninjau ketentuan data, ketersediaan model, wilayah, akun, serta kuota. Kemudian pengelola mengisi kunci server dan kedua flag secara eksplisit. Kode tidak mengaktifkan billing, membuat akun, membeli kuota, atau menjamin sebuah kunci berada pada free tier. Batas aplikasi mengendalikan jumlah permintaan, sementara status billing dan harga ditentukan penyedia.

## Penyedia dan protokol

Adapter terpisah pada `server/gemini.ts` memakai REST `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, header server `x-goog-api-key`, bagian gambar `inlineData`, dan `generationConfig.responseMimeType=application/json` dengan `responseJsonSchema`. Model default konfigurasi adalah `gemini-3.5-flash-lite`, yang terdokumentasi mendukung gambar dan keluaran terstruktur. Versi model aktual dari respons dicatat dalam hasil jika tersedia. Model dan metode ini diverifikasi terhadap dokumentasi resmi, sedangkan kompatibilitas langsung pada akun pengguna belum diuji. [Referensi REST](https://aistudio.google.com/api-reference/generate-content/generate-content), [model](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite), [keluaran terstruktur](https://aistudio.google.com/docs/structured-output)

Dokumentasi model 2.5 menyatakan akses dibatasi bagi pengguna sebelumnya, sehingga konfigurasi awal memakai model untuk proyek baru. Pemilihan ini merupakan keputusan implementasi yang dapat ditinjau pengelola. [Status model 2.5](https://aistudio.google.com/docs/models/gemini-2.5-flash-lite)

Harga yang dibuka mencantumkan input/output gratis dalam free tier model default, dengan batas serta kelayakan layanan yang berlaku. Ini tidak membuktikan akun pengguna memenuhi syarat gratis atau bahwa kuotanya tersedia. Tidak ada harga tetap maupun angka free-tier rate limit yang diasumsikan aplikasi. [Harga resmi](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite)

## Privasi dan batas keamanan

Sumber yang dikirim saat ekstraksi nyata adalah foto terpilih yang telah didekode dan diputar sesuai orientasi EXIF, atau teks sumber terpilih. Dokumen dikirim ke Gemini bersama instruksi ekstraksi. Server aplikasi memprosesnya dalam memori tanpa penulisan file atau pencatatan payload dokumen. Penyimpanan draf pada browser merupakan tanggung jawab modul penyimpanan terpisah.

Pada layanan Gemini tanpa biaya, ketentuan resmi menyatakan isi dan respons dapat dipakai untuk pengembangan produk serta dapat ditinjau manusia. Ketentuan juga meminta pengguna menghindari informasi sensitif, rahasia, atau pribadi pada layanan tanpa biaya. Pakai dokumen sintetis untuk evaluasi. Penanganan data penyedia mengikuti akun, wilayah, tier, dan ketentuannya. Persetujuan UI tidak menggantikan ketentuan penyedia. [Ketentuan dan penggunaan data](https://aistudio.google.com/docs/terms#data-use-unpaid)

Server mendengarkan di `127.0.0.1` secara bawaan; alamat lain diatur lewat `BUKTILAUT_HOST`. POST memerlukan origin yang diizinkan, JSON, serta header khusus. Header Host dicocokkan dengan `BUKTILAUT_ALLOWED_HOSTS` untuk membatasi DNS rebinding. Adapter Vision tidak memakai CORS wildcard, URL gambar jarak jauh, URL penyedia dari klien, tool calling, atau pengambilan tautan dalam dokumen. Konten dokumen diperlakukan sebagai data tak tepercaya.

Origin bukan autentikasi. Akun, sesi, dan izin ruang kerja ditangani rute akun ([ACCOUNTS_STORAGE_PHASE4_6.md](ACCOUNTS_STORAGE_PHASE4_6.md)). Penayangan publik memerlukan HTTPS dengan `BUKTILAUT_COOKIE_SECURE=true` serta peninjauan kebijakan data. Rate limit saat ini berlaku global per proses, kembali kosong setelah restart, dan dihitung menurut hari UTC. Beberapa pengguna lokal berbagi kuota tersebut. Pembatalan memutus fetch upstream jika masih aktif, tetapi penyedia mungkin sudah menerima atau menagih permintaan.

| Batas default | Nilai |
| --- | --- |
| Foto sumber | JPG, PNG, WebP, maksimal 4 MB |
| Bodi JSON | Maksimal 6 MB |
| Dekode foto | Maksimal 20 juta piksel, satu frame |
| PNG setelah orientasi/dekode | Maksimal 12 MB, tanpa kompresi lossy |
| Teks sumber | Maksimal 20.000 karakter |
| Permintaan paralel | 2 |
| Permintaan per menit | 6, termasuk input ditolak |
| Panggilan provider per hari | 30 |
| Waktu tunggu | Default 30 detik, batas konfigurasi 180 detik, dengan grace client 10 detik |
| Token output provider | 8192 |
| Bodi respons provider | Maksimal 512 KB |
| Retry otomatis | Maksimal 2 kali untuk HTTP 5xx atau gangguan koneksi, jeda 1 lalu 2 detik; HTTP 429 tidak dicoba ulang ([Phase 4.6.6](PHASE4_6_6_AI_RELIABILITY.md)) |

Format MIME diperiksa terhadap magic bytes, lalu `sharp` mendekode seluruh gambar. GIF/SVG/animasi, kerusakan gambar, dan mismatch MIME ditolak. Gambar diubah menjadi PNG untuk orientasi dan dekode tanpa pengurangan kualitas lossy. Foto yang terlalu besar setelah dekode perlu dipilih ulang. Tidak ada kompresi tersembunyi untuk memaksa dokumen melewati batas.

## Kontrak dan tinjauan pengguna

`src/vision/contract.ts` digunakan server dan browser. Permintaan membawa `documentType`, `requestId`, `sourceId`, `sourceRevision`, dan tepat satu dari `imageDataUrl` atau `text`. Identifier adalah string 1–160 karakter dari huruf, angka, underscore, titik, kolon, atau tanda hubung. Hasil mengembalikan identitas yang sama dengan `requiresReview=true`.

`raw` mempertahankan string sumber model, nilai null, isu, dan peringatan. `normalized` menyediakan angka hanya ketika penafsiran aman. Validator menolak field hilang/tambahan, tipe salah, panjang berlebihan, dan lebih dari 100 item. Browser memvalidasi identitas dan membangun ulang angka normalisasi sebelum menerima hasil. Bentuk hasil AI terpisah dari nilai yang diedit dan dikonfirmasi. Skema hanya mengendalikan bentuk, bukan ketepatan pembacaan atau keaslian dokumen.

Contoh penafsiran deterministik meliputi `12,5 kg`, `12.5 kg`, `1.250 gram`, dan `500 g`. `1.250 kg` ditandai ambigu. Kg didukung sampai presisi gram. Uang menerima Rupiah bulat dan pemisah Indonesia. `Rp25,000` serta pecahan Rupiah memerlukan pemeriksaan. Harga per kg hanya dinormalisasi ketika basis `/kg` atau `/kilogram` tercetak, termasuk header kolom yang terbaca. Berat dalam kg tidak menjadi bukti basis harga. Harga tanpa basis tetap tersedia pada raw dan nilai normalisasi kosong.

Field hilang tidak dihitung sebagai nol. Total/baris tercetak tidak dihitung oleh model maupun normalizer. Perhitungan akhir tetap melalui engine aplikasi dari data terkonfirmasi. Salah satu dari unknown, isu model, atau hasil sebagian memerlukan pemeriksaan sumber. Pengguna harus memilih usulan yang ingin dipakai, memperbaiki bidang, lalu mengonfirmasi melalui form. Hasil terlambat harus ditolak konsumen berdasarkan request/source/version aktif dan AbortController. Jalur manual tidak mengganti hasil gagal dengan fixture.

Galat publik mempunyai kode aman, `retryable`, dan waktu mencoba lagi jika diketahui. Kegagalan konfigurasi, format sumber, hasil kosong/tidak valid, batas pemakaian, waktu habis, dan jaringan mempunyai pesan pemulihan. Raw error provider dan kunci tidak diteruskan ke klien. Ombak Pintar memakai jalur terpisah (`/api/agent`, [kontrak](PHASE4_7_AGENT.md)); demo **Buka contoh** tetap terskenario.

## Verifikasi dan smoke test

15 tes terfokus lulus untuk skema, angka/satuan, harga tanpa basis, identitas respons lama, callback batal, protokol provider tiruan, output malformed/blocked/empty, decode gambar, origin, header, konfigurasi nonaktif, batas konkurensi, waktu habis, anggaran harian, dan pembatalan saat koneksi terputus. Tes HTTP membutuhkan akses loopback. Tidak ada provider nyata dalam tes. Kompilasi server `npx tsc -p tsconfig.server.json` lulus. Sekarang `npm run typecheck` memeriksa browser dan server sekaligus.

```powershell
node --experimental-strip-types --test --test-timeout=15000 src/vision/contract.test.ts src/services/vision.test.ts server/gemini.test.ts server/app.test.ts
```

Smoke test terpisah tidak dijalankan oleh `npm test`. Tanpa flag/kunci/aktivasi, perintah berikut mencetak `SKIPPED` dan tidak memanggil penyedia.

```powershell
node --experimental-strip-types --env-file-if-exists=.env server/live-smoke.ts
```

Setelah otorisasi eksternal dan konfigurasi tersedia, pengelola dapat menjalankan satu gambar sintetis secara eksplisit.

```powershell
node --experimental-strip-types --env-file-if-exists=.env server/live-smoke.ts --enabled receipt evaluation/02-clear-receipt.png
```

Untuk catatan timbang, pakai `weighing` dengan berkas seperti `evaluation/01-clear-weighing.png`. Script memvalidasi respons dan mencetak model, jumlah item, serta durasi. Script tidak mengklaim akurasi atau biaya. Penilaian acuan per bidang, gambar tulisan tangan nyata, evaluasi latensi berulang, dan biaya aktual masih tertunda. Tidak ada klaim P0 real-provider smoke telah selesai.

## Pembaruan keandalan fase 4.3

14 November 2026. Pengguna melaporkan percobaan manual terhadap 15 gambar sintetis setelah integrasi awal. Pengamatan tersebut menjadi masukan perbaikan. Pengujian perubahan fase ini tetap memakai provider tiruan tanpa panggilan Gemini. Data pengamatan lengkap dan akurasi lapangan belum tersedia.

Skema v2 memisahkan workflow permintaan `weighing`/`receipt` dari jenis dokumen aktual pada `raw.documentType`, yaitu `weighing`, `sales_receipt`, atau `unknown`. Prompt klasifikasi identik untuk kedua workflow. Model harus menyertakan bukti yang terlihat, certainty kategoris `clear`/`uncertain`, dan keterbacaan `readable`/`partial`/`unreadable`. Judul formal tidak wajib bagi catatan timbang dan harga saja tidak membuktikan nota. Tidak ada persentase confidence.

Hasil v2 berlabel `schemaVersion=2` pada envelope dan raw. Ketidakcocokan jenis tetap dikembalikan sebagai bukti baca-saja. Hasil valid dengan baris kosong atau sumber tidak terbaca juga merupakan respons HTTP sukses yang memiliki status keterbacaan, terpisah dari timeout, batas layanan, jaringan, dan format model tidak valid. Validator menolak kontradiksi sumber tidak terbaca yang masih berisi item. Tidak ada penambahan baris kosong buatan.

Helper `documentCompatibility` dapat digunakan lintas UI dan boundary domain. Jenis yang cocok dan jelas mengizinkan peninjauan usulan. Mismatch, unknown, uncertain, unreadable, serta hasil lama tanpa klasifikasi independen menahan impor. Data raw lama tetap dapat dimuat tanpa diberi klasifikasi palsu. Pengguna dapat mengganti sumber atau meminta pembacaan ulang. Perlindungan konfirmasi, restore, dan impor langsung harus menggunakan helper yang sama pada aplikasi.

`/api/vision/status` mengembalikan `timeoutMs` dari konfigurasi server. Client memakai nilai itu ditambah grace 10 detik, dengan batas server 180 detik dan client 190 detik. Tanpa argumen timeout eksplisit, client mengambil status lokal terlebih dahulu. Vite proxy tidak memasang timeout yang lebih pendek. `requestTimeout` Node tetap membatasi penerimaan bodi upload, bukan lama respons provider. Retry dibatasi kuota dan dapat dibatalkan; retry otomatis untuk galat sementara ditambahkan pada Phase 4.6.6. `.env` aktual dan pilihan model yang sudah bekerja tidak diubah pada fase ini.

Perubahan prompt, struktur v2, dan klasifikasi belum diuji ulang melalui provider nyata. Tes tiruan membuktikan bentuk protokol, boundary, dan jalur pemulihan, bukan akurasi model dalam mengklasifikasikan gambar. Pengamatan tunggal untuk prompt injection juga tidak membuktikan perlindungan universal.
