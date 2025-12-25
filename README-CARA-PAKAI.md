

# CARA MENJALANKAN TOOLS (WAJIB DIBACA)

Tools ini menggunakan **Gemini AI (BYOK / Bring Your Own Key)**.
Artinya: **API key TIDAK termasuk**, pembeli wajib menggunakan **API key sendiri**.

## SYARAT SEBELUM JALAN

Pastikan di komputer kamu sudah ada:

1. **Node.js**
   Download di: [https://nodejs.org](https://nodejs.org)
   (disarankan versi 18 atau terbaru)

2. **Gemini API Key**
   Ambil gratis di Google AI Studio

## LANGKAH 1 — EXTRACT FILE

1. Download file **.zip**
2. Extract ke folder (bebas)
3. Buka folder hasil extract

## LANGKAH 2 — INSTALL DEPENDENCY

1. Buka **Terminal / CMD / PowerShell**
2. Masuk ke folder project
3. Jalankan perintah ini:

```bash
npm install
```

Tunggu sampai selesai (hanya sekali).


## LANGKAH 3 — JALANKAN TOOLS

Di terminal yang sama, jalankan:

```bash
npm run dev
```

Jika berhasil, akan muncul alamat seperti:

```
http://localhost:5173 ( setiap port beda beda, cek terminal )
```

Buka alamat itu di browser (Chrome disarankan).

## ❗ CATATAN PENTING

* ❌ Tools **tidak bisa dijalankan dengan klik dobel**
* ❌ API key **tidak disediakan penjual**
* ✅ Semua proses berjalan **di komputer kamu**
* ✅ Biaya API mengikuti akun Gemini milik kamu sendiri


## JIKA ERROR

**Node tidak dikenal**
→ Node.js belum terinstall

**API key error**
→ Cek file `.env.local`, lalu restart `npm run dev`

**Halaman kosong**
→ Tutup terminal → jalankan ulang



