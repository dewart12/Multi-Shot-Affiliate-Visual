
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
jika error tidak bisa npm run dev bisa lakukan cara ini : 
## 🔑 LANGKAH tambahan : cek vite
```bash
npm list vite
```

jika hasil empty

install vite : 

```bash
npm install -D vite
```

⚠️ Jangan pakai tanda kutip
⚠️ Jangan share API key ke siapa pun
Jika berhasil, akan muncul alamat seperti:

```
http://localhost:5173 ( tergantung masing masing portnya )
```

Buka alamat itu di browser (Chrome disarankan).


## ❗ CATATAN PENTING

* ❌ Tools **tidak bisa dijalankan dengan klik dobel**
* ❌ API key **tidak disediakan penjual**
* ✅ Semua proses berjalan **di komputer kamu**
* ✅ Biaya API mengikuti akun Gemini milik kamu sendiri


## 🧠 JIKA ERROR

**Node tidak dikenal**
→ Node.js belum terinstall

**API key error**
→ Cek file apakah pake apikey tier 1 ( berlangganan ) atau yang free tier, kalau yang free tier ga bisa.

**Halaman kosong**
→ Tutup terminal → jalankan ulang


## 📜 DISCLAIMER

Source code dijual apa adanya.
Penggunaan Gemini API mengikuti kebijakan Google.
Penjual tidak bertanggung jawab atas biaya API atau penyalahgunaan oleh user.





