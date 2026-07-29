const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const html = readFileSync(join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('a Spotify profile failure after OAuth is shown instead of leaving the page idle', () => {
    assert.match(html, /id="authError"/);
    assert.match(html, /function showAuthError\(/);
    assert.match(
        html,
        /error:\s*function\s*\([^)]*\)\s*\{\s*showAuthError\(/,
    );
});
