import path from 'node:path';
import { fileURLToPath } from 'node:url';
import makeWASocket, {
    DisconnectReason,
    downloadMediaMessage,
    fetchLatestBaileysVersion,
    useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { sendAudioSticker } from './audio-sticker.js';
import {
    extractAudioToOpus,
    imageToWebp,
    isAnimatedWebp,
    videoToWebp,
} from './media.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STICKER_CMD_RE = /^\.(s|stiker|sa|stikersuara)(?:\s+(.+))?$/i;

export function parseStickerCommand(body) {
    if (typeof body !== 'string') {
        return { isStickerCmd: false, mode: null, args: '' };
    }

    const match = body.trim().match(STICKER_CMD_RE);
    if (!match) {
        return { isStickerCmd: false, mode: null, args: '' };
    }

    const cmd = match[1].toLowerCase();
    const mode = cmd === 'sa' || cmd === 'stikersuara' ? 'audio' : 'auto';
    return {
        isStickerCmd: true,
        mode,
        args: (match[2] || '').trim(),
    };
}

export function unwrapMessage(message) {
    let current = message;
    while (current) {
        if (current.ephemeralMessage?.message) {
            current = current.ephemeralMessage.message;
        } else if (current.viewOnceMessage?.message) {
            current = current.viewOnceMessage.message;
        } else if (current.viewOnceMessageV2?.message) {
            current = current.viewOnceMessageV2.message;
        } else if (current.viewOnceMessageV2Extension?.message) {
            current = current.viewOnceMessageV2Extension.message;
        } else if (current.documentWithCaptionMessage?.message) {
            current = current.documentWithCaptionMessage.message;
        } else {
            break;
        }
    }
    return current || null;
}

export function extractMessageText(message) {
    const m = unwrapMessage(message);
    if (!m) return '';
    return (
        m.conversation ||
        m.extendedTextMessage?.text ||
        m.imageMessage?.caption ||
        m.videoMessage?.caption ||
        ''
    );
}

export function shouldHandleMessage(msg) {
    if (!msg?.key?.fromMe) return false;
    return parseStickerCommand(extractMessageText(msg.message)).isStickerCmd;
}

function detectMediaKind(m) {
    if (!m) return null;
    if (m.imageMessage) return 'image';
    if (m.videoMessage) return 'video';
    if (m.stickerMessage) return 'sticker';
    if (m.audioMessage) return 'audio';
    return null;
}

function extractContextInfo(m) {
    return (
        m?.extendedTextMessage?.contextInfo ||
        m?.imageMessage?.contextInfo ||
        m?.videoMessage?.contextInfo ||
        m?.audioMessage?.contextInfo ||
        m?.stickerMessage?.contextInfo ||
        null
    );
}

export function extractMediaTargets(msg) {
    const current = unwrapMessage(msg?.message);
    const contextInfo = extractContextInfo(current);
    const quoted = unwrapMessage(contextInfo?.quotedMessage);

    const curKind = detectMediaKind(current);
    const qKind = detectMediaKind(quoted);
    const isVisual = (k) => k === 'image' || k === 'video' || k === 'sticker';

    const wrap = (kind, raw) => ({
        kind,
        isGif: Boolean(raw?.videoMessage?.gifPlayback),
        waMsg: { key: msg.key, message: raw },
    });

    if (isVisual(curKind) && qKind === 'audio') {
        return { visual: wrap(curKind, current), audio: wrap('audio', quoted) };
    }
    if (curKind === 'audio' && isVisual(qKind)) {
        return { visual: wrap(qKind, quoted), audio: wrap('audio', current) };
    }
    if (curKind === 'image' || curKind === 'video') {
        const target = wrap(curKind, current);
        return { visual: target, audio: curKind === 'video' ? target : null };
    }
    if (qKind === 'image' || qKind === 'video') {
        const target = wrap(qKind, quoted);
        return { visual: target, audio: qKind === 'video' ? target : null };
    }
    return { visual: null, audio: null };
}

async function handleStickerMessage(sock, msg, logger) {
    const jid = msg.key.remoteJid;
    const { mode } = parseStickerCommand(extractMessageText(msg.message));
    const { visual, audio } = extractMediaTargets(msg);

    if (!visual) {
        await sock.sendMessage(
            jid,
            {
                text:
                    'Cara pakai:\n' +
                    '- Kirim/balas gambar, GIF, atau video dengan .s atau .stiker\n' +
                    '- Untuk stiker bersuara: kirim/balas video bersuara atau gabungkan foto/stiker + balas audio/VN dengan .sa atau .stikersuara',
            },
            { quoted: msg },
        );
        return;
    }

    if (mode === 'audio' && !audio) {
        await sock.sendMessage(
            jid,
            {
                text: 'Untuk .sa / .stikersuara, kirim video bersuara atau balas pesan audio/VN sambil mengirim foto/video/stiker.',
            },
            { quoted: msg },
        );
        return;
    }

    const downloadOpts = { reuploadRequest: sock.updateMediaMessage, logger };
    const visualBuf = await downloadMediaMessage(visual.waMsg, 'buffer', {}, downloadOpts);
    const stickerBuf =
        visual.kind === 'video'
            ? await videoToWebp(visualBuf)
            : await imageToWebp(visualBuf);

    const shouldTryAudio =
        mode === 'audio' ||
        (audio !== null && !(visual.kind === 'video' && visual.isGif));

    if (shouldTryAudio && audio) {
        const audioSrcBuf =
            audio === visual
                ? visualBuf
                : await downloadMediaMessage(audio.waMsg, 'buffer', {}, downloadOpts);
        try {
            const opus = await extractAudioToOpus(audioSrcBuf);
            await sendAudioSticker(
                sock,
                jid,
                {
                    sticker: stickerBuf,
                    audio: opus.buffer,
                    seconds: opus.seconds,
                    waveform: opus.waveform,
                    isAnimated: isAnimatedWebp(stickerBuf),
                },
                msg,
            );
            return;
        } catch (err) {
            if (err.message === 'NO_AUDIO_STREAM') {
                if (mode === 'audio') {
                    await sock.sendMessage(
                        jid,
                        { text: 'Video tersebut tidak memiliki audio. Gunakan video bersuara atau balas audio/VN.' },
                        { quoted: msg },
                    );
                    return;
                }
                // Auto mode (.s / .stiker) on muted video: fall through to standard animated sticker
            } else {
                throw err;
            }
        }
    }

    await sock.sendMessage(jid, { sticker: stickerBuf }, { quoted: msg });
}

export async function startBot(authDir = path.join(__dirname, 'auth_info')) {
    const logger = pino({ level: 'silent' });
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger,
        printQRInTerminal: false,
    });

    const processedIds = new Set();
    let shuttingDown = false;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            console.log('Scan QR code di bawah dengan WhatsApp (Perangkat Tertaut):');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            console.log('Bot stiker WhatsApp (Baileys) siap! Gunakan .s / .stiker atau .sa / .stikersuara.');
        } else if (connection === 'close' && !shuttingDown) {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode === DisconnectReason.loggedOut) {
                console.log('Sesi WhatsApp logout. Hapus folder auth_info/ lalu jalankan ulang bot untuk scan QR baru.');
            } else {
                console.log(`Koneksi terputus (code: ${statusCode ?? 'unknown'}), mencoba menghubungkan ulang...`);
                setTimeout(() => {
                    startBot(authDir).catch((err) => {
                        console.error('Gagal reconnect:', err);
                    });
                }, 3000);
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            const msgId = msg?.key?.id;
            if (msgId && processedIds.has(msgId)) continue;
            if (!shouldHandleMessage(msg)) continue;

            if (msgId) {
                processedIds.add(msgId);
                if (processedIds.size > 500) {
                    processedIds.delete(processedIds.values().next().value);
                }
            }

            try {
                await handleStickerMessage(sock, msg, logger);
            } catch (err) {
                console.error('Gagal memproses stiker:', err);
                await sock
                    .sendMessage(
                        msg.key.remoteJid,
                        { text: 'Maaf, terjadi kesalahan saat memproses stiker.' },
                        { quoted: msg },
                    )
                    .catch(() => {});
            }
        }
    });

    process.once('SIGINT', () => {
        shuttingDown = true;
        console.log('\nMenutup bot...');
        sock.end();
        process.exit(0);
    });

    return sock;
}

const isMain =
    Boolean(process.argv[1]) &&
    path.resolve(process.argv[1]) === __filename;

if (isMain) {
    startBot().catch((err) => {
        console.error('Gagal menjalankan bot:', err);
        process.exit(1);
    });
}
