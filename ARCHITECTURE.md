# Arsitektur BuktiLaut

```
Browser (React + Vite, src/)
  │  draf lokal di IndexedDB (tanpa akun)
  │  fetch /api/* · cookie sesi HttpOnly · header X-BuktiLaut-*
  ▼
API Node (server/, satu proses; npm start juga menyajikan dist/)
  │  cek Host → cek Origin → batas laju → validasi JSON → izin ruang kerja
  ├──► Gemini API   membaca foto/teks/suara, atau memilih SATU alat baca Ombak Pintar
  │                 (hanya bila diaktifkan pengelola dan pengguna setuju mengirim sumber)
  └──► SQLite       akun, sesi, ruang kerja, arsip revisi, foto sumber
                    (node:sqlite, bawaan .data/accounts.sqlite)
```

Angka uang dan berat dihitung oleh kode TypeScript, di browser dan di server. Gemini tidak pernah mengirim angka yang langsung dipakai. Hasil bacaannya hanya usulan yang divalidasi skema, lalu ditinjau dan dikonfirmasi pengguna.

## Peta folder

| Folder | Isi |
| --- | --- |
| `src/App.tsx` | State pemeriksaan, navigasi, dan penghubung antarlayar |
| `src/components/` | Layar tahap: `SourceStep` (Timbang, Nota), `MatchingStep`, `ReportStep`. Juga akun (`AccountArea`, `AccountAuth`), Ombak Pintar (`Chat`, `OmbakPintar`), dan usulan AI (`VisionProposal`, `VoiceProposalReview`) |
| `src/lib/` | Logika murni tanpa UI, diuji dengan `node --test` |
| `src/services/` | Klien API, penyimpanan IndexedDB, dan simulasi demo |
| `src/agent/`, `src/vision/`, `src/voice/` | Kontrak dan validator data bersama browser–server |
| `server/` | `index.ts` (start), `app.ts` (routing dan pengaman), `account-routes.ts`, `accounts/store.ts`, `gemini.ts`, `voice-gemini.ts`, agen Ombak Pintar |
| `evaluation/` | Dokumen uji sintetis dan seeder database contoh |
| `docs/` | Panduan aktif; `docs/history/` untuk laporan fase lama; `docs/redesign-evidence/` untuk screenshot |

## Di mana aturan penting berada

**Aturan hitung**
- `src/lib/examination.ts`: parsing kg, selisih per pasangan, penyesuaian tidak terjual, dan total nota. Hasilnya `null` (belum diketahui) bila data kurang, bukan 0.
- `src/lib/matching.ts`: validasi dan konfirmasi pasangan baris timbang–nota.
- `src/lib/receiptDocument.ts`: membandingkan total tertulis di nota dengan total hitungan.
- `src/lib/archiveDomain.ts` dan `src/lib/archiveAnalytics.ts`: total arsip dari revisi terkonfirmasi terbaru, draf dipisah, serta analitik penjualan.

**Izin ruang kerja**
- `server/account-routes.ts`: `getAuthenticatedWorkspace` dan fungsi `*Authorized*` membaca sesi dari cookie, lalu membatasi setiap kueri ke ruang kerja aktif.
- `server/accounts/store.ts`: tabel `memberships`. Sesi selalu di-JOIN dengan keanggotaan, jadi anggota yang dikeluarkan langsung kehilangan akses.

**Ombak Pintar (baca-saja)**
- `server/unified-agent.ts`: menjalankan alat yang dipilih pada data berizin, lalu memvalidasi jawaban.
- `server/unified-agent/`: `tool-schema.ts` (9 alat baca dan 2 alat utilitas), `gemini-selector.ts` (model hanya memilih alat), `basic-selector.ts` (pemilih aturan tetap saat Gemini mati), `dates.ts` (tanggal WIB, termasuk tanggal relatif), `answers.ts` (teks jawaban dari nilai server).
- `src/agent/unified.ts`: validator permintaan dan jawaban. `src/components/Chat.tsx`: antarmuka.

**Pemisahan data.** Draf (`src/types.ts`) menyimpan sumber asli, `rawExtractions` (hasil AI), isian yang disunting, dan `confirmedSnapshots` (isian saat dikonfirmasi) sebagai bagian terpisah. Arsip server menyimpan setiap simpan sebagai revisi baru.

## Menjalankan

`npm ci` → `npm run dev` + `npm run api` (pengembangan), atau `npm run build && npm start` (satu alamat). Pemeriksaan kode: `npm run typecheck`, `npm run lint`, `npm test`. CI ada di `.github/workflows/ci.yml`.

## Keterbatasan yang diketahui

- `src/App.tsx` masih memegang state utama: ±2.400 baris dengan 46 `useState`. Layar tahap sudah menjadi komponen, tetapi state dan efeknya belum.
- CSS berlapis di 11 berkas; `src/theme.css` dimuat terakhir di `src/main.tsx` dan menimpa aturan berkas sebelumnya.
- `npm run lint` tanpa error, tetapi 32 peringatan React Hooks (`exhaustive-deps`, `set-state-in-effect`, `refs`, `immutability`) ditunda karena memperbaikinya mengubah urutan dan pemicu efek.
- Langkah berikutnya: pindahkan state pemeriksaan ke reducer atau hook per tahap, tangani peringatan Hooks per hook disertai tes, lalu lebur aturan yang ditimpa `theme.css` ke berkas asalnya.
