import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import webp from 'node-webpmux';

const execFileAsync = promisify(execFile);

const DEFAULT_EXIF = {
    packname: 'wa-sticker-bot',
    author: 'raintyaa',
    categories: [''],
};

const MAX_ANIMATED_WEBP_BYTES = 950 * 1024;
const VIDEO_WEBP_PRESETS = [
    { fps: 15, size: 512, quality: 50 },
    { fps: 12, size: 384, quality: 35 },
    { fps: 10, size: 320, quality: 25 },
    { fps: 8, size: 256, quality: 18 },
];

export function isWebp(buffer) {
    return (
        Buffer.isBuffer(buffer) &&
        buffer.length >= 12 &&
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP'
    );
}

export function isAnimatedWebp(buffer) {
    if (!isWebp(buffer)) return false;

    let offset = 12;
    while (offset + 8 <= buffer.length) {
        const chunk = buffer.toString('ascii', offset, offset + 4);
        const size = buffer.readUInt32LE(offset + 4);
        if (chunk === 'ANIM' || chunk === 'ANMF') return true;
        if (chunk === 'VP8X' && offset + 8 < buffer.length && (buffer[offset + 8] & 0x02)) {
            return true;
        }
        offset += 8 + size + (size % 2);
    }
    return false;
}

export async function addStickerExif(webpBuffer, metadata = {}) {
    const { packname, author, categories } = { ...DEFAULT_EXIF, ...metadata };
    const json = {
        'sticker-pack-id': crypto.randomBytes(16).toString('hex'),
        'sticker-pack-name': packname,
        'sticker-pack-publisher': author,
        emojis: categories,
    };

    const exifAttr = Buffer.from([
        0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
    ]);
    const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
    const exif = Buffer.concat([exifAttr, jsonBuffer]);
    exif.writeUIntLE(jsonBuffer.length, 14, 4);

    const img = new webp.Image();
    await img.load(webpBuffer);
    img.exif = exif;
    return Buffer.from(await img.save(null));
}

function makeTempPath(ext) {
    return path.join(os.tmpdir(), `wa-sticker-${crypto.randomUUID()}.${ext}`);
}

async function safeUnlink(filePath) {
    if (!filePath) return;
    await fs.unlink(filePath).catch(() => {});
}

export async function imageToWebp(buffer, metadata = {}) {
    if (isWebp(buffer)) {
        return addStickerExif(buffer, metadata);
    }

    const inputPath = makeTempPath('img');
    const outputPath = makeTempPath('webp');
    try {
        await fs.writeFile(inputPath, buffer);
        await execFileAsync(ffmpegPath, [
            '-y',
            '-loglevel', 'error',
            '-i', inputPath,
            '-vcodec', 'libwebp',
            '-vf', 'scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
            '-q:v', '80',
            '-compression_level', '6',
            '-f', 'webp',
            outputPath,
        ]);
        const webpBuf = await fs.readFile(outputPath);
        return addStickerExif(webpBuf, metadata);
    } finally {
        await Promise.all([safeUnlink(inputPath), safeUnlink(outputPath)]);
    }
}

export async function videoToWebp(buffer, metadata = {}, maxBytes = MAX_ANIMATED_WEBP_BYTES) {
    const inputPath = makeTempPath('vid');
    const outputPath = makeTempPath('webp');
    try {
        await fs.writeFile(inputPath, buffer);

        let result = null;
        for (const preset of VIDEO_WEBP_PRESETS) {
            await execFileAsync(ffmpegPath, [
                '-y',
                '-loglevel', 'error',
                '-i', inputPath,
                '-vcodec', 'libwebp_anim',
                '-vf', `fps=${preset.fps},scale=${preset.size}:${preset.size}:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,pad=${preset.size}:${preset.size}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
                '-loop', '0',
                '-ss', '00:00:00',
                '-t', '00:00:10',
                '-preset', 'default',
                '-q:v', String(preset.quality),
                '-compression_level', '4',
                '-an',
                '-f', 'webp',
                outputPath,
            ]);

            const webpBuf = await fs.readFile(outputPath);
            result = await addStickerExif(webpBuf, metadata);
            if (result.length <= maxBytes) break;
        }
        return result;
    } finally {
        await Promise.all([safeUnlink(inputPath), safeUnlink(outputPath)]);
    }
}

function buildWaveformFromPcm(pcmBuffer, bars = 64) {
    const totalSamples = Math.floor(pcmBuffer.length / 2);
    if (totalSamples < bars) {
        return Buffer.alloc(bars, 10);
    }

    const blockSize = Math.floor(totalSamples / bars);
    const raw = new Array(bars);
    let maxVal = 0;

    for (let i = 0; i < bars; i++) {
        let sum = 0;
        const start = i * blockSize;
        for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(pcmBuffer.readInt16LE((start + j) * 2));
        }
        const avg = sum / blockSize;
        if (avg > maxVal) maxVal = avg;
        raw[i] = avg;
    }

    const scale = maxVal > 0 ? 100 / maxVal : 1;
    return Buffer.from(raw.map((v) => Math.min(100, Math.floor(v * scale))));
}

export async function extractAudioToOpus(buffer, maxSeconds = 10) {
    const inputPath = makeTempPath('media');
    const outputPath = makeTempPath('ogg');
    try {
        await fs.writeFile(inputPath, buffer);
        try {
            await execFileAsync(ffmpegPath, [
                '-y',
                '-loglevel', 'error',
                '-err_detect', 'ignore_err',
                '-fflags', '+discardcorrupt',
                '-i', inputPath,
                '-vn',
                '-t', String(maxSeconds),
                '-ar', '16000',
                '-ac', '1',
                '-c:a', 'libopus',
                '-b:a', '32k',
                '-vbr', 'on',
                '-compression_level', '10',
                '-frame_duration', '20',
                '-application', 'voip',
                '-avoid_negative_ts', 'make_zero',
                '-map_metadata', '-1',
                '-f', 'ogg',
                outputPath,
            ]);
        } catch (err) {
            const stderr = String(err.stderr || err.message || '');
            if (/does not contain any stream|Output file #0 does not contain/i.test(stderr)) {
                throw new Error('NO_AUDIO_STREAM');
            }
            throw err;
        }

        const oggBuffer = await fs.readFile(outputPath);
        if (!oggBuffer.length) {
            throw new Error('NO_AUDIO_STREAM');
        }

        let seconds = 1;
        let waveform = Buffer.alloc(64, 15);
        try {
            const { stdout: pcm } = await execFileAsync(
                ffmpegPath,
                [
                    '-v', 'error',
                    '-i', outputPath,
                    '-ac', '1',
                    '-ar', '8000',
                    '-f', 's16le',
                    'pipe:1',
                ],
                { encoding: 'buffer', maxBuffer: 5 * 1024 * 1024 },
            );
            const totalSamples = Math.floor(pcm.length / 2);
            if (totalSamples > 0) {
                seconds = Math.max(1, Math.min(maxSeconds, Math.ceil(totalSamples / 8000)));
                waveform = buildWaveformFromPcm(pcm, 64);
            }
        } catch {
            // Keep safe fallback duration and waveform if PCM decode fails
        }

        return { buffer: oggBuffer, seconds, waveform };
    } finally {
        await Promise.all([safeUnlink(inputPath), safeUnlink(outputPath)]);
    }
}
