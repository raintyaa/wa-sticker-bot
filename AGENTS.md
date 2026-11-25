# Project Instructions & Context: `wa-sticker-bot`

> **Catatan untuk Agent:** Folder ini sudah dilengkapi salinan lokal *rules* dan *skills* yang relevan di dalam direktori `.agents/`. Gunakan file-file lokal tersebut sebagai rujukan utama selama mengerjakan proyek ini tanpa perlu mencarinya kembali ke direktori global.

---

## 1. Konteks & Tujuan Proyek

* **Nama Proyek:** `wa-sticker-bot`
* **Lokasi Workspace:** `D:\Rakha\wa-sticker-bot`
* **Tujuan:** Membuat bot WhatsApp pribadi berbasis **Node.js** untuk mengubah gambar, GIF, atau video pendek menjadi stiker WhatsApp secara langsung di chat (misal lewat perintah/caption `.s` atau `.stiker`), sehingga user tidak perlu membuka aplikasi pihak ketiga.
* **Stack Utama (Opsi 2):** **`whatsapp-web.js`** (menggunakan autentikasi `LocalAuth` dan fitur bawaan `sendMediaAsSticker: true`).
* **Target Environment:** Berjalan secara **lokal di laptop Windows** milik user. User hanya perlu menyalakan laptop dan menjalankan skrip bot (misalnya lewat `npm start` atau file `.bat`) saat ingin membuat stiker.

---

## 2. Rencana Publikasi GitHub & Keamanan Wajib

* **Target Repository:** Proyek ini akan diinisialisasi Git dan di-publish ke akun GitHub user (**`raintyaa`**, misalnya `https://github.com/raintyaa/wa-sticker-bot`).
* **Aturan Keamanan Kritis:**
  * **JANGAN PERNAH** meng-commit folder sesi autentikasi WhatsApp (`.wwebjs_auth/`, `.wwebjs_cache/`), `node_modules/`, maupun file `.env` ke GitHub.
  * File `.gitignore` wajib dibuat dan diverifikasi **sebelum** menjalankan `git add .` atau `git commit` pertama.

---

## 3. Rules Lokal Wajib (`.agents/rules/`)

Selama sesi pengembangan proyek ini, wajib mematuhi aturan lokal berikut:

1. **[`.agents/rules/git-github-workflow.md`](./.agents/rules/git-github-workflow.md)**
   * Gunakan standar *Conventional Commits* (`feat:`, `fix:`, `docs:`, `chore:`) dan alur branch yang rapi untuk setup serta pembaruan repo di GitHub `raintyaa`.
2. **[`.agents/rules/ponytail.md`](./.agents/rules/ponytail.md)**
   * Prinsip kode ringkas dan efisien (*lazy senior dev*): prioritaskan fitur bawaan `whatsapp-web.js` (`sendMediaAsSticker: true`, `LocalAuth`) terlebih dahulu daripada menambahkan abstraksi atau dependensi yang tidak diminta. Pastikan struktur file tetap minimal dan ada pengecekan yang bisa dijalankan.
3. **[`.agents/rules/flashmind.md`](./.agents/rules/flashmind.md)**
   * Jangan mengarang API, nama event, atau opsi konfigurasi yang belum diverifikasi. Simpan keputusan arsitektur atau solusi error penting (seperti path Chromium/FFmpeg di Windows) ke memori Flashmind.

*(Rules komunikasi global seperti gaya bahasa dan anti-AI-slop tetap berlaku secara otomatis).*

---

## 4. Skills Lokal Wajib (`.agents/skills/`)

Gunakan skill yang sudah disalin di `.agents/skills/` sesuai tahap pengerjaan:

* **`plan-first`** (`.agents/skills/plan-first/SKILL.md`) — Gunakan di awal proyek sebelum menulis kode untuk menyusun rencana file (`package.json`, `.gitignore`, `index.js`, `README.md`, script launcher Windows).
* **`no-invented-code`** (`.agents/skills/no-invented-code/SKILL.md`) — **Wajib dibaca** sebelum menulis kode `whatsapp-web.js` agar versi package, parameter `Client`, konfigurasi `puppeteer`, dan dukungan `ffmpeg` untuk stiker animasi di Windows sesuai dengan API yang sebenarnya terpasang.
* **`single-flow-task-execution`** (`.agents/skills/single-flow-task-execution/SKILL.md`) — Terapkan untuk eksekusi tugas berurutan yang bersih dan terverifikasi.
* **`systematic-debugging`** (`.agents/skills/systematic-debugging/SKILL.md`) — Gunakan jika terjadi error saat menjalankan Puppeteer/Chromium, QR login, atau konversi stiker video di Windows.
* **`surgical-patch`** (`.agents/skills/surgical-patch/SKILL.md`) — Gunakan saat menambahkan fitur kecil lanjutan (seperti custom pack/author, perintah baru, atau auto-crop) tanpa merombak bagian lain.
* **`verify-before-done`** (`.agents/skills/verify-before-done/SKILL.md`) — **Wajib dijalankan** sebelum menyatakan bot siap pakai atau sebelum melakukan `git push` ke GitHub (verifikasi syntax/startup test dan status `git status` agar sesi rahasia tidak ikut ter-track).

---

## 5. MCP Tools Relevan yang Tersedia

* **`github`** — Digunakan untuk membuat repository baru di akun GitHub `raintyaa` dan membantu pengelolaan repository.
* **`flashmind`** — Digunakan untuk mencatat konfigurasi lokal, versi library yang bekerja baik di Windows, dan log perbaikan bug.
*(MCP lain seperti `atria`, `docx`, dan `browse` bersifat tidak wajib di proyek ini, kecuali `browse` jika perlu mengecek dokumentasi web `wwebjs.dev`).*
