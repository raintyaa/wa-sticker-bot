# wa-sticker-bot

Bot WhatsApp pribadi berbasis Node.js (`whatsapp-web.js`) untuk mengubah gambar, GIF, atau video pendek menjadi stiker WhatsApp langsung dari chat di Windows.

## Fitur Saat Ini

* **Mode Pribadi (`fromMe`):** Hanya memproses perintah dari akun WhatsApp Anda sendiri (misalnya di chat *Note to Self* atau chat mana saja yang Anda kirim).
* **Perintah `.s` atau `.stiker`:**
  * Kirim gambar, GIF, atau video pendek dengan caption `.s` / `.stiker`.
  * Atau balas (*reply*) pesan gambar/GIF/video yang sudah ada dengan `.s` / `.stiker`.
* **Stiker Animasi (GIF/Video):** Menggunakan `ffmpeg-static` bawaan tanpa perlu instalasi FFmpeg manual di `PATH` Windows.
* **Autentikasi Persisten:** Menggunakan `LocalAuth` sehingga cukup scan QR sekali selama sesi belum logout.

## Catatan Tentang Stiker Video Bersuara

Saat video/GIF dikonversi menjadi stiker, `whatsapp-web.js` (`v1.34.8`, pada `src/util/Util.js`) mengonversi media ke format animasi WebP (`image/webp`, maksimal 5 detik) dengan opsi FFmpeg `-an` (menghapus seluruh stream audio) dan tidak menyediakan opsi stiker bersuara di `MessageSendOptions`. Artinya, video yang dikirim tetap bisa menjadi **stiker animasi**, tetapi **tanpa suara**.

## Cara Menjalankan

1. Pasang dependensi (jika belum):
   ```powershell
   npm install
   ```
2. Jalankan bot:
   ```powershell
   npm start
   ```
   Atau klik dua kali file `start.bat` di Windows.
3. Scan QR code yang muncul di terminal menggunakan aplikasi WhatsApp di HP (**Perangkat Tertaut**).

## Pengujian

Jalankan unit check bawaan (tidak perlu login WhatsApp):
```powershell
npm test
```

## Keamanan

Jangan pernah membagikan atau meng-commit folder `.wwebjs_auth/`, `.wwebjs_cache/`, `node_modules/`, maupun file `.env`. File `.gitignore` sudah dikonfigurasi untuk mengecualikan folder-folder tersebut.

## Troubleshooting

* **TimeoutError 30000ms saat startup (`Client.js:139`):** `index.js` mem-pin `webVersion` (`2.3000.1054721061-alpha`, berlaku hingga 16 Jan 2027) melalui `webVersionCache` remote dan `userAgent` Chrome Windows sebagai workaround untuk `WAWebSocketModel` yang bernilai `null` pada halaman login terbaru WhatsApp Web di `whatsapp-web.js@1.34.8`. Jika versi tersebut kedaluwarsa di kemudian hari, perbarui `webVersion` dari daftar `wppconnect-team/wa-version` atau update `whatsapp-web.js`.
* **`ProtocolError: Page.navigate timed out` pada startup ke-2:** `index.js` otomatis menghapus folder `.wwebjs_auth/session/Default/Service Worker` sebelum memulai bot untuk mencegah deadlock *request interception* di Chromium, tanpa menghapus data login WhatsApp (`IndexedDB` / `Local Storage`).
