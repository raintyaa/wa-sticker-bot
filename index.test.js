import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { proto } from '@whiskeysockets/baileys';
import ffmpegPath from 'ffmpeg-static';
import {
    AUDIO_STICKER_FIELD,
    STICKER_AUDIO_FIELD,
    installAudioStickerProtoPatch,
} from './audio-sticker.js';
import {
    extractMediaTargets,
    extractMessageText,
    parseStickerCommand,
    shouldHandleMessage,
} from './index.js';
import {
    extractAudioToOpus,
    imageToWebp,
    isAnimatedWebp,
    isWebp,
    videoToWebp,
} from './media.js';

const execFileAsync = promisify(execFile);

function readVarint(buf, offset) {
    let value = 0;
    let shift = 0;
    let pos = offset;
    while (pos < buf.length) {
        const byte = buf[pos++];
        value += (byte & 0x7f) * 2 ** shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
    }
    return { value, next: pos };
}

function findLengthDelimitedField(buf, targetFieldNumber) {
    let pos = 0;
    while (pos < buf.length) {
        const tag = readVarint(buf, pos);
        pos = tag.next;
        const fieldNumber = Math.floor(tag.value / 8);
        const wireType = tag.value & 7;
        if (wireType === 0) {
            pos = readVarint(buf, pos).next;
        } else if (wireType === 1) {
            pos += 8;
        } else if (wireType === 2) {
            const len = readVarint(buf, pos);
            pos = len.next;
            const slice = buf.subarray(pos, pos + len.value);
            if (fieldNumber === targetFieldNumber) return slice;
            pos += len.value;
        } else if (wireType === 5) {
            pos += 4;
        } else {
            throw new Error(`Unsupported wire type ${wireType}`);
        }
    }
    return null;
}

test('parseStickerCommand matches .s, .stiker, .sa, .stikersuara and rejects invalid inputs', () => {
    assert.deepEqual(parseStickerCommand('.s'), { isStickerCmd: true, mode: 'auto', args: '' });
    assert.deepEqual(parseStickerCommand('  .STIKER  '), { isStickerCmd: true, mode: 'auto', args: '' });
    assert.deepEqual(parseStickerCommand('.sa'), { isStickerCmd: true, mode: 'audio', args: '' });
    assert.deepEqual(parseStickerCommand('.StikerSuara test'), { isStickerCmd: true, mode: 'audio', args: 'test' });

    for (const input of ['.sticker', '.something', 'halo', '', null, undefined]) {
        assert.deepEqual(parseStickerCommand(input), { isStickerCmd: false, mode: null, args: '' });
    }
});

test('shouldHandleMessage only accepts fromMe commands across Baileys message shapes', () => {
    assert.equal(shouldHandleMessage({ key: { fromMe: false }, message: { conversation: '.s' } }), false);
    assert.equal(shouldHandleMessage({ key: { fromMe: true }, message: { conversation: 'halo' } }), false);
    assert.equal(shouldHandleMessage({ key: { fromMe: true }, message: { conversation: '.s' } }), true);
    assert.equal(
        shouldHandleMessage({
            key: { fromMe: true },
            message: { imageMessage: { caption: '.stiker' } },
        }),
        true,
    );
    assert.equal(
        shouldHandleMessage({
            key: { fromMe: true },
            message: {
                ephemeralMessage: {
                    message: { videoMessage: { caption: '.sa' } },
                },
            },
        }),
        true,
    );
    assert.equal(
        extractMessageText({ extendedTextMessage: { text: '.stikersuara' } }),
        '.stikersuara',
    );
});

test('extractMediaTargets pairs visual and audio across direct and quoted messages', () => {
    const photoReplyToAudio = extractMediaTargets({
        key: { remoteJid: '123@s.whatsapp.net', fromMe: true, id: 'm1' },
        message: {
            imageMessage: {
                caption: '.sa',
                contextInfo: {
                    quotedMessage: { audioMessage: { mimetype: 'audio/ogg; codecs=opus' } },
                },
            },
        },
    });
    assert.equal(photoReplyToAudio.visual?.kind, 'image');
    assert.equal(photoReplyToAudio.audio?.kind, 'audio');

    const directVideo = extractMediaTargets({
        key: { remoteJid: '123@s.whatsapp.net', fromMe: true, id: 'm2' },
        message: { videoMessage: { caption: '.s', gifPlayback: false } },
    });
    assert.equal(directVideo.visual?.kind, 'video');
    assert.equal(directVideo.audio, directVideo.visual);
});

test('FFmpeg pipeline converts synthetic image, animated video, and Opus audio with waveform', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-sticker-test-'));
    const imgPath = path.join(tmpDir, 'in.png');
    const vidAudioPath = path.join(tmpDir, 'vid-audio.mp4');
    const vidSilentPath = path.join(tmpDir, 'vid-silent.mp4');

    try {
        await execFileAsync(ffmpegPath, [
            '-y', '-loglevel', 'error',
            '-f', 'lavfi', '-i', 'color=c=blue:s=160x120:d=1',
            '-frames:v', '1',
            imgPath,
        ]);
        await execFileAsync(ffmpegPath, [
            '-y', '-loglevel', 'error',
            '-f', 'lavfi', '-i', 'testsrc=duration=1:size=160x120:rate=10',
            '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
            '-c:v', 'mpeg4', '-c:a', 'aac', '-shortest',
            vidAudioPath,
        ]);
        await execFileAsync(ffmpegPath, [
            '-y', '-loglevel', 'error',
            '-f', 'lavfi', '-i', 'testsrc=duration=1:size=160x120:rate=10',
            '-c:v', 'mpeg4', '-an',
            vidSilentPath,
        ]);

        const staticSticker = await imageToWebp(await fs.readFile(imgPath));
        assert.equal(isWebp(staticSticker), true);
        assert.ok(staticSticker.includes(Buffer.from('wa-sticker-bot')));

        const vidAudioBuf = await fs.readFile(vidAudioPath);
        const animSticker = await videoToWebp(vidAudioBuf);
        assert.equal(isWebp(animSticker), true);
        assert.equal(isAnimatedWebp(animSticker), true);
        assert.ok(animSticker.includes(Buffer.from('raintyaa')));

        const opus = await extractAudioToOpus(vidAudioBuf);
        assert.equal(opus.buffer.subarray(0, 4).toString('ascii'), 'OggS');
        assert.ok(opus.buffer.includes(Buffer.from('OpusHead')));
        assert.ok(opus.seconds >= 1 && opus.seconds <= 10);
        assert.equal(opus.waveform.length, 64);

        const vidSilentBuf = await fs.readFile(vidSilentPath);
        await assert.rejects(() => extractAudioToOpus(vidSilentBuf), /NO_AUDIO_STREAM/);
    } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
    }
});

test('installAudioStickerProtoPatch encodes wire fields 134 -> 1 -> 26 -> 26', () => {
    assert.equal(installAudioStickerProtoPatch(), true);
    // Idempotent second call must succeed without duplicating tags
    assert.equal(installAudioStickerProtoPatch(), true);

    const bytes = Buffer.from(
        proto.Message.encode({
            messageContextInfo: { messageSecret: crypto.randomBytes(32) },
            audioStickerMessage: {
                message: {
                    stickerMessage: {
                        width: 512,
                        height: 512,
                        isAnimated: true,
                        isLottie: false,
                        audioMessage: {
                            mimetype: 'audio/ogg; codecs=opus',
                            ptt: true,
                            seconds: 2,
                        },
                    },
                },
            },
        }).finish(),
    );

    const field134 = findLengthDelimitedField(bytes, AUDIO_STICKER_FIELD);
    assert.ok(field134, 'expected Message.audioStickerMessage (field 134)');

    const innerMessage = findLengthDelimitedField(field134, 1);
    assert.ok(innerMessage, 'expected FutureProofMessage.message (field 1)');

    const stickerBytes = findLengthDelimitedField(innerMessage, 26);
    assert.ok(stickerBytes, 'expected Message.stickerMessage (field 26)');

    const audioBytes = findLengthDelimitedField(stickerBytes, STICKER_AUDIO_FIELD);
    assert.ok(audioBytes, 'expected StickerMessage.audioMessage (field 26)');

    const decodedAudio = proto.Message.AudioMessage.decode(audioBytes);
    assert.equal(decodedAudio.mimetype, 'audio/ogg; codecs=opus');
    assert.equal(decodedAudio.ptt, true);
    assert.equal(decodedAudio.seconds, 2);
});
