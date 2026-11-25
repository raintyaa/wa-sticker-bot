'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ffmpegPath = require('ffmpeg-static');

const { parseStickerCommand, shouldHandleMessage } = require('./index');

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
