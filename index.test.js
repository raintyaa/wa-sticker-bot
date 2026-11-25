'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ffmpegPath = require('ffmpeg-static');

const {
    clearStaleServiceWorker,
    parseStickerCommand,
    shouldHandleMessage,
} = require('./index');

test('parseStickerCommand matches .s and .stiker variants', () => {
    assert.deepEqual(parseStickerCommand('.s'), { isStickerCmd: true, args: '' });
    assert.deepEqual(parseStickerCommand('.stiker'), { isStickerCmd: true, args: '' });
    assert.deepEqual(parseStickerCommand('  .S  '), { isStickerCmd: true, args: '' });
    assert.deepEqual(parseStickerCommand('.STIKER'), { isStickerCmd: true, args: '' });
    assert.deepEqual(parseStickerCommand('.s extra'), { isStickerCmd: true, args: 'extra' });
});

test('parseStickerCommand rejects unrelated commands and invalid input', () => {
    for (const input of ['.sticker', '.something', 'halo', '', null, undefined]) {
        assert.deepEqual(parseStickerCommand(input), { isStickerCmd: false, args: '' });
    }
});

test('shouldHandleMessage only allows fromMe sticker commands', () => {
    assert.equal(shouldHandleMessage({ fromMe: false, body: '.s' }), false);
    assert.equal(shouldHandleMessage({ fromMe: false, body: '.stiker' }), false);
    assert.equal(shouldHandleMessage({ fromMe: true, body: 'halo' }), false);
    assert.equal(shouldHandleMessage(null), false);
    assert.equal(shouldHandleMessage({ fromMe: true, body: '.s' }), true);
    assert.equal(shouldHandleMessage({ fromMe: true, body: '.stiker' }), true);
});

test('ffmpeg-static binary path exists on disk', () => {
    assert.equal(typeof ffmpegPath, 'string');
    assert.ok(ffmpegPath.length > 0);
    assert.equal(fs.existsSync(ffmpegPath), true);
});

test('clearStaleServiceWorker removes only Service Worker cache and preserves session data', () => {
    const tmpSession = fs.mkdtempSync(path.join(os.tmpdir(), 'wwebjs-sw-test-'));
    try {
        const swDir = path.join(tmpSession, 'Default', 'Service Worker');
        const idbDir = path.join(tmpSession, 'Default', 'IndexedDB');
        const lsDir = path.join(tmpSession, 'Default', 'Local Storage');
        fs.mkdirSync(swDir, { recursive: true });
        fs.mkdirSync(idbDir, { recursive: true });
        fs.mkdirSync(lsDir, { recursive: true });
        fs.writeFileSync(path.join(swDir, 'cache.bin'), 'stale');
        fs.writeFileSync(path.join(idbDir, 'session.db'), 'keep');
        fs.writeFileSync(path.join(lsDir, 'auth.ldb'), 'keep');

        clearStaleServiceWorker(tmpSession);

        assert.equal(fs.existsSync(swDir), false);
        assert.equal(fs.existsSync(path.join(idbDir, 'session.db')), true);
        assert.equal(fs.existsSync(path.join(lsDir, 'auth.ldb')), true);

        // Calling again when Service Worker folder does not exist must not throw
        assert.doesNotThrow(() => clearStaleServiceWorker(tmpSession));
    } finally {
        fs.rmSync(tmpSession, { recursive: true, force: true });
    }
});
