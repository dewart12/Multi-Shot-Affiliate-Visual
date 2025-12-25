CARA MENJALANKAN TOOLS (WAJIB DIBACA)
Tools ini menggunakan Gemini AI (BYOK / Bring Your Own Key).
Artinya: API key TIDAK termasuk, pembeli wajib menggunakan API key sendiri.

🔧 SYARAT SEBELUM JALAN
Pastikan di komputer kamu sudah ada:

Node.js
Download di: https://nodejs.org
(disarankan versi 18 atau terbaru)

Gemini API Key
Ambil gratis di Google AI Studio

📂 LANGKAH 1 — EXTRACT FILE
Download file .zip
Extract ke folder (bebas)
Buka folder hasil extract

📦 LANGKAH 2 — INSTALL DEPENDENCY
Buka Terminal / CMD / PowerShell
Masuk ke folder project
Jalankan perintah ini:

npm install


Tunggu sampai selesai (hanya sekali).
🔑 LANGKAH 3 — MASUKKAN GEMINI API KEY
Di folder project, buat file baru bernama:

.env.local


Isi file tersebut dengan:

GEMINI_API_KEY=ISI_API_KEY_KAMU


⚠️ Jangan pakai tanda kutip
⚠️ Jangan share API key ke siapa pun

▶️ LANGKAH 4 — JALANKAN TOOLS
Di terminal yang sama, jalankan:

npm run dev


Jika berhasil, akan muncul alamat seperti:
http://localhost:5173 ( Contoh, cek terminal masing masing )


Buka alamat itu di browser (Chrome disarankan).

❗ CATATAN PENTING
❌ Tools tidak bisa dijalankan dengan klik dobel
❌ API key tidak disediakan penjual
✅ Semua proses berjalan di komputer kamu
✅ Biaya API mengikuti akun Gemini milik kamu sendiri

🧠 JIKA ERROR

Node tidak dikenal
→ Node.js belum terinstall

API key error
→ Cek file .env.local, lalu restart npm run dev

Halaman kosong
→ Tutup terminal → jalankan ulang

📜 DISCLAIMER
Source code dijual apa adanya.
Penggunaan Gemini API mengikuti kebijakan Google.
Penjual tidak bertanggung jawab atas biaya API atau penyalahgunaan oleh user.
Source code dijual apa adanya.
Penggunaan Gemini API mengikuti kebijakan Google.
Penjual tidak bertanggung jawab atas biaya API atau penyalahgunaan oleh user.
