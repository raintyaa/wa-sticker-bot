import { randomBytes } from 'node:crypto';
import {
    generateMessageIDV2,
    prepareWAMessageMedia,
    proto,
} from '@whiskeysockets/baileys';

export const AUDIO_STICKER_FIELD = 134;
export const STICKER_AUDIO_FIELD = 26;

function patchProtoField(target, field, fieldNumber, fieldType) {
    if (!target || typeof target.encode !== 'function') {
        throw new Error(`Invalid protobuf target for field ${field}`);
    }
    if (target.encode.__waAudioStickerPatched?.[field]) {
        return;
    }

    const originalEncode = target.encode.bind(target);
    const wireTag = (fieldNumber << 3) | 2;
    const patchedEncode = (message, writer) => {
        const out = originalEncode(message, writer);
        const value = message?.[field];
        if (value != null) {
            fieldType.encode(value, out.uint32(wireTag).fork()).ldelim();
        }
        return out;
    };
    patchedEncode.__waAudioStickerPatched = {
        ...(target.encode.__waAudioStickerPatched || {}),
        [field]: true,
    };
    target.encode = patchedEncode;

    if (typeof target.fromObject === 'function' && typeof fieldType.fromObject === 'function') {
        const originalFromObject = target.fromObject.bind(target);
        target.fromObject = (object) => {
            const msg = originalFromObject(object);
            if (object?.[field] != null) {
                msg[field] = fieldType.fromObject(object[field]);
            }
            return msg;
        };
    }
}

/**
 * Extend Baileys protobuf encoders at runtime with Message.audioStickerMessage (#134)
 * and StickerMessage.audioMessage (#26) if not natively defined.
 */
// ponytail: Baileys 7.0.0-rc14 omits proto fields #134 and #26; runtime patch auto-skips if a future release adds them natively
export function installAudioStickerProtoPatch(protoRef = proto) {
    const MessageType = protoRef?.Message;
    const StickerType = MessageType?.StickerMessage;
    const AudioType = MessageType?.AudioMessage;
    const FutureProofType = MessageType?.FutureProofMessage;

    if (!MessageType || !StickerType || !AudioType || !FutureProofType) {
        return false;
    }

    if (!('audioStickerMessage' in MessageType.prototype)) {
        patchProtoField(MessageType, 'audioStickerMessage', AUDIO_STICKER_FIELD, FutureProofType);
    }
    if (!('audioMessage' in StickerType.prototype)) {
        patchProtoField(StickerType, 'audioMessage', STICKER_AUDIO_FIELD, AudioType);
    }

    return true;
}

export function buildQuotedContext(quoted) {
    if (!quoted?.key?.id || !quoted?.message) {
        return undefined;
    }

    return {
        stanzaId: quoted.key.id,
        participant: quoted.key.participant || quoted.key.remoteJid || undefined,
        quotedMessage: quoted.message,
    };
}

/**
 * Upload WebP visual + OGG/Opus audio and relay as a single native WhatsApp Sound Sticker.
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 * @param {string} jid
 * @param {{ sticker: Buffer, audio: Buffer, seconds: number, waveform: Buffer, isAnimated: boolean, width?: number, height?: number }} parts
 * @param {import('@whiskeysockets/baileys').WAMessage} [quoted]
 */
export async function sendAudioSticker(sock, jid, parts, quoted) {
    if (!installAudioStickerProtoPatch()) {
        throw new Error('AUDIO_STICKER_PROTO_UNAVAILABLE');
    }

    const [stickerMedia, audioMedia] = await Promise.all([
        prepareWAMessageMedia({ sticker: parts.sticker }, { upload: sock.waUploadToServer }),
        prepareWAMessageMedia(
            { audio: parts.audio, mimetype: 'audio/ogg; codecs=opus', ptt: false },
            { upload: sock.waUploadToServer },
        ),
    ]);

    const stickerMessage = {
        ...(stickerMedia.stickerMessage || {}),
        width: parts.width || 512,
        height: parts.height || 512,
        isAnimated: Boolean(parts.isAnimated),
        isLottie: false,
        stickerSentTs: Date.now(),
        audioMessage: {
            ...(audioMedia.audioMessage || {}),
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true,
            seconds: parts.seconds,
            waveform: parts.waveform,
        },
    };

    const contextInfo = buildQuotedContext(quoted);
    if (contextInfo) {
        stickerMessage.contextInfo = contextInfo;
    }

    const content = {
        messageContextInfo: {
            messageSecret: randomBytes(32),
        },
        audioStickerMessage: {
            message: {
                stickerMessage,
            },
        },
    };

    await sock.relayMessage(jid, content, {
        messageId: generateMessageIDV2(sock.user?.id),
        // Explicit type='text' prevents WhatsApp mobile clients from dropping field #134 payloads
        additionalAttributes: { type: 'text' },
    });
}
