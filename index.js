'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STICKER_CMD_RE = /^\.(s|stiker)(?:\s+(.+))?$/i;

/**
 * Remove stale Chromium Service Worker cache so request interception on remote webVersionCache does not deadlock.
 * @param {string} sessionDir
 */
// ponytail: Chromium Service Worker cache deadlocks with whatsapp-web.js request interception on remote webVersionCache; remove when webVersion pin is no longer needed
function clearStaleServiceWorker(sessionDir) {
    const swDir = path.join(sessionDir, 'Default', 'Service Worker');
    fs.rmSync(swDir, { recursive: true, force: true });
}

/**
 * Parse a message body for `.s` or `.stiker` sticker commands.
 * @param {string} body
 * @returns {{ isStickerCmd: boolean, args: string }}
 */
function parseStickerCommand(body) {
    if (typeof body !== 'string') {
        return { isStickerCmd: false, args: '' };
    }

    const match = body.trim().match(STICKER_CMD_RE);
    if (!match) {
        return { isStickerCmd: false, args: '' };
    }

    return {
        isStickerCmd: true,
        args: (match[2] || '').trim(),
    };
}

/**
 * Only process sticker commands sent by the bot owner's own account.
 * @param {{ fromMe?: boolean, body?: string } | null | undefined} msg
 * @returns {boolean}
 */
function shouldHandleMessage(msg) {
    return Boolean(msg && msg.fromMe && parseStickerCommand(msg.body).isStickerCmd);
}

/**
 * Resolve the message carrying media (either the command message or its quoted message).
 * @param {import('whatsapp-web.js').Message} msg
 * @returns {Promise<import('whatsapp-web.js').Message | null>}
 */
async function resolveMediaMessage(msg) {
    if (msg.hasMedia) {
        return msg;
    }

    if (msg.hasQuotedMsg) {
        const quoted = await msg.getQuotedMessage();
        if (quoted && quoted.hasMedia) {
            return quoted;
        }
    }

    return null;
}

function startBot() {
    const { Client, LocalAuth } = require('whatsapp-web.js');
    const qrcode = require('qrcode-terminal');
    const ffmpegPath = require('ffmpeg-static');

    const client = new Client({
        authStrategy: new LocalAuth(),
        ffmpegPath,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        // ponytail: workaround WAWebSocketModel null di WhatsApp Web terbaru (berlaku s.d. 2027-01-16; hapus/update jika wwebjs sudah mendukung alur login baru)
        webVersion: '2.3000.1054721061-alpha',
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html',
        },
        puppeteer: {
            headless: true,
        },
    });

    client.on('qr', (qr) => {
        console.log('Scan QR code di bawah dengan WhatsApp (Perangkat Tertaut):');
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log('Bot stiker WhatsApp siap! Kirim atau balas gambar/GIF/video dengan .s atau .stiker.');
    });

    client.on('auth_failure', (msg) => {
        console.error('Autentikasi gagal:', msg);
    });

    client.on('disconnected', (reason) => {
        console.log('Koneksi WhatsApp terputus:', reason);
    });

    client.on('message_create', async (msg) => {
        if (!shouldHandleMessage(msg)) {
            return;
        }

        try {
            const targetMsg = await resolveMediaMessage(msg);
            if (!targetMsg) {
                await msg.reply('Kirim atau balas gambar/GIF/video dengan caption .s atau .stiker.');
                return;
            }

            const media = await targetMsg.downloadMedia();
            if (!media) {
                await msg.reply('Gagal mengunduh media. Silakan kirim ulang medianya.');
                return;
            }

            await msg.reply(media, undefined, {
                sendMediaAsSticker: true,
                stickerName: 'wa-sticker-bot',
                stickerAuthor: 'raintyaa',
            });
        } catch (err) {
            console.error('Gagal membuat stiker:', err);
            await msg.reply('Maaf, terjadi kesalahan saat memproses stiker.').catch(() => {});
        }
    });

    process.on('SIGINT', async () => {
        console.log('\nMenutup bot...');
        await client.destroy().catch(() => {});
        process.exit(0);
    });

    clearStaleServiceWorker(path.join(__dirname, '.wwebjs_auth', 'session'));

    client.initialize().catch((err) => {
        console.error('Gagal menjalankan bot:', err);
        process.exit(1);
    });
}

if (require.main === module) {
    startBot();
}

module.exports = {
    clearStaleServiceWorker,
    parseStickerCommand,
    shouldHandleMessage,
};
