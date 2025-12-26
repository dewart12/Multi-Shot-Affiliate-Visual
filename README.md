
## 🚀 Cara Jalankan Project Lokal (Tanpa Git)

### **Download & Extract**

* **Download ZIP** dari GitHub → Extract ke folder lokal kamu.
  Kamu **tidak perlu Git** untuk ini — cukup klik *Code → Download ZIP* dan extract.



###  **Install Dependensi**

Project ini pakai **Node.js** (ada `package.json`). Jadi setelah extract, buka terminal di folder tersebut dan jalankan:

```bash
npm install
```

Ini akan install semua dependency yang dibutuhkan. ([GitHub][1])

💡 **Wajib punya Node.js terinstal** di komputer kamu.


### **Jalankan App**

Kalau semua sudah install + API key siap, tinggal run:

```bash
npm run dev
```

Ini akan nge-start server lokal (biasanya di [http://localhost:5173/](http://localhost:5173/) atau serupa). ([GitHub][1])



## 📌 Catatan Penting

✅ **Bisa dijalankan lokal tanpa git**
Selama:

* Node.js terinstall
* Dependencies terpasang
* API key diset

❌ **Tidak bisa hanya extract dan langsung klik file HTML**
Karena project ini butuh bundler dev server (`vite`) untuk jalan.

