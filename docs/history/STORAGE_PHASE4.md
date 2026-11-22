# Penyimpanan Phase 4

Database IndexedDB `buktilaut.prototype` memakai versi 1 dan dua object store, `drafts` serta `images`. Key draf pengguna dan demo mengikuti `DRAFT_KEY` dan `DEMO_KEY`. Satu slot pengguna dan satu slot demo mempertahankan perilaku prototipe sebelumnya.

`saveDraft(draft)` mengembalikan `Promise<void>`. Input disalin saat pemanggilan. Antrean dalam sesi JavaScript menjaga urutan simpan dan baca. Foto dikonversi menjadi Blob, lalu metadata draf dan kedua foto ditulis dalam satu transaksi. Foto lama yang diganti teks dihapus dalam transaksi yang sama. Promise baru selesai setelah `transaction.oncomplete`. Kegagalan menolak promise dan mempertahankan transaksi sebelumnya. Antrean tetap dapat menerima operasi berikutnya setelah kegagalan.

`loadDraft(key = DRAFT_KEY)` mengembalikan `{ value, warning, exists, persisted }`. `persisted` bernilai true hanya setelah pembacaan IndexedDB berhasil atau transaksi migrasi selesai. Pemulihan dari salinan lama dan kegagalan migrasi mengembalikan false. UI menggunakan flag ini untuk membedakan pemulihan dari penyimpanan yang berhasil. Blob dikembalikan sebagai `Source.image` data URL agar komponen sumber tetap kompatibel. Record metadata IndexedDB tidak menyimpan foto base64.

Draf localStorage lama dibaca melalui validator yang sama. Migrasi hanya berjalan jika slot IndexedDB kosong. Salinan localStorage tetap dipertahankan setelah migrasi berhasil maupun gagal. Tidak ada penulisan localStorage baru oleh modul ini. Jika IndexedDB rusak atau tidak dapat diakses, hasil memuat peringatan dan salinan lama yang valid bila tersedia. Draf IndexedDB yang rusak tidak ditimpa otomatis.

Validator menerima draf versi 1 terdahulu dan bidang opsional Phase 4, termasuk Hasil AI, subtotal/teks sumber, hasil ekstraksi mentah, dan snapshot konfirmasi. `validateVisionResult` memeriksa ulang normalisasi dan identitas jenis dokumen pada ekstraksi tersimpan. Snapshot konfirmasi memiliki baris tersendiri sehingga koreksi berikutnya tidak menimpa salinannya.

Koneksi ditutup setelah operasi serta ketika menerima `versionchange`. Pembukaan yang diblokir menghasilkan galat segera, dengan koneksi terlambat ditutup. Batas tunggu pembukaan/transaksi 5 detik. Transaksi yang melewati batas dibatalkan. Kegagalan kuota dan akses harus ditampilkan UI sebagai perubahan belum tersimpan.

## Pemeriksaan aktual

Perintah terfokus `node --experimental-strip-types --test src/services/indexedDb.test.ts src/services/storage.test.ts` lulus 16/16 pada Node 24.15.0. Pengujian menggunakan fake-indexeddb dan mencakup Blob/pemulihan, penghapusan foto lama, isolasi demo, penyelesaian transaksi, abort setelah request sukses, urutan simpan, snapshot input, migrasi gagal/berhasil, schema rusak, akses ditolak, upgrade diblokir, dan bidang opsional Phase 4. Pengujian tidak menulis atau menghapus localStorage lama.

Pemeriksaan `tsc -b` saat handoff menemukan satu galat milik integrasi App pada tipe timer `number` versus `Timeout`. Frontend telah menerima lokasi galat. Hasil build akhir dicatat orchestrator.

Orchestrator melaporkan uji browser dengan gambar, koreksi, ekstraksi mentah, penyesuaian, dan refresh berhasil. Hasil itu terpisah dari pengujian unit modul. Penyimpanan tetap khusus origin/browser/perangkat, tanpa sinkronisasi akun. Penghapusan data browser, mode privat, dan eviction dapat menghilangkan IndexedDB. Antrean berlaku dalam satu sesi aplikasi. Tab berbeda dapat saling menimpa slot yang sama menurut urutan commit karena deteksi konflik lintas tab belum tersedia.

## Tinjauan batas keamanan dan laporan

Modul penyimpanan hanya bekerja lokal. Kredensial provider tidak ditambahkan ke model draf. Hasil AI melewati validator kontrak sebelum dipulihkan. UI menggunakan teks React untuk nilai dan keterangan. Pemeriksaan sumber terarah tidak menemukan pemakaian `dangerouslySetInnerHTML` pada jalur terkait. Ini merupakan pemeriksaan kode terarah, tanpa klaim audit keamanan menyeluruh.

Laporan mengambil data yang ditinjau serta keluaran engine deterministik. Subtotal sumber ditampilkan terpisah dan hasil AI tidak otomatis menjadi konfirmasi. Status simpan pada laporan tetap mengikuti keberhasilan persistence. Verifikasi cetak akhir, kuota browser sesungguhnya, dan skenario dua tab tetap dicatat tersendiri oleh orchestrator.
