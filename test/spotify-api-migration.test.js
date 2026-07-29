const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const html = readFileSync(join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('follow and unfollow operations use the 2026 generic library endpoint', () => {
    assert.doesNotMatch(html, /\/playlists\/['"]?\s*\+\s*[^;\n]+\/followers/);
    assert.doesNotMatch(html, /spotify:user:/);
    assert.match(html, /spotify:playlist:/);
    assert.match(html, /spotify:artist:/);
});

test('a no-op import releases the import lock', () => {
    assert.match(
        html,
        /globalStep = "No new items found in import";\s*isImporting = false;\s*makingChanges = false;/,
    );
});

test('playlist restore failures are surfaced instead of reporting false success', () => {
    assert.match(html, /Failed to create playlist/);
    assert.match(html, /Failed to add a song to a merged playlist/);
    assert.match(html, /Failed to follow .* playlists/);
    assert.match(html, /importErrors\.push/);
});
