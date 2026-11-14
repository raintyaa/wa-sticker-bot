# wa-sticker-bot

Bot WhatsApp pribadi berbasis Node.js (`@whiskeysockets/baileys`) untuk mengubah gambar, GIF, dan video — termasuk **stiker video bersuara (*Sound Stickers*)** — langsung dari chat di Windows tanpa perlu browser Chromium/Puppeteer.

## Fitur Saat Ini

* **Mode Pribadi (`fromMe`):** Hanya memproses perintah dari akun WhatsApp Anda sendiri (misalnya di chat *Note to Self* atau chat mana saja yang Anda kirim).
* **Perintah `.s` atau `.stiker` (Otomatis):**
  * **Gambar:** diubah menjadi stiker statis WebP 512×512 dengan metadata pack (`wa-sticker-bot` / `raintyaa`).
  * **GIF / Video tanpa suara:** diubah menjadi stiker animasi WebP adaptif (< 1 MB).
  * **Video bersuara:** otomatis dikonversi menjadi **native Sound Sticker** (animasi WebP + audio OGG/Opus).
* **Perintah `.sa` atau `.stikersuara` (Khusus Stiker Bersuara):**
  * Kirim atau balas **video bersuara** dengan `.sa` / `.stikersuara`.
  * Atau gabungkan **foto/stiker/video** dengan **balasan audio/VN** (atau sebaliknya).
* **Tanpa FFmpeg Manual:** Memakai `ffmpeg-static` bawaan (sudah mendukung `libwebp_anim` dan `libopus`).
* **Autentikasi Persisten:** Menyimpan sesi di `auth_info/` lewat `useMultiFileAuthState` sehingga cukup scan QR sekali selama sesi belum logout.

## Cara Kerja Stiker Video Bersuara

WhatsApp mengirim *Sound Stickers* melalui struktur Protobuf baru (`Message.audioStickerMessage` field `#134` yang membungkus `StickerMessage` dengan `audioMessage` di field `#26`). Karena `@whiskeysockets/baileys@7.0.0-rc14` belum menyertakan kedua field tersebut secara bawaan, [audio-sticker.js](audio-sticker.js) menerapkan *runtime patch* pada encoder Protobuf (tanpa memodifikasi `node_modules/`) dan mengirim payload via `sock.relayMessage` dengan `additionalAttributes: { type: 'text' }`.

*(Catatan: pemutaran audio pada stiker bergantung pada dukungan fitur Sound Stickers di versi aplikasi WhatsApp penerima).*

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
3. Scan QR code yang muncul di terminal menggunakan WhatsApp di HP (**Perangkat Tertaut** → **Tautkan Perangkat**).

## Pengujian

Jalankan seluruh unit test (parser perintah, pipeline FFmpeg WebP/Opus, dan wire layout Protobuf `#134`/`#26`):
```powershell
npm test
```

## Keamanan

Jangan pernah membagikan atau meng-commit folder `auth_info/`, `.wwebjs_auth/`, `.wwebjs_cache/`, `node_modules/`, maupun file `.env`. File `.gitignore` sudah dikonfigurasi untuk mengecualikan seluruh folder tersebut.

## Troubleshooting

* **Sesi logout (`DisconnectReason.loggedOut`):** Hapus folder `auth_info/` lalu jalankan ulang `npm start` untuk memindai QR code baru.
* **QR code terpotong di terminal:** Perbesar jendela terminal atau perkecil ukuran font (`Ctrl` + `-`) sebelum memindai.
