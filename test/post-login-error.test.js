const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const html = readFileSync(join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('a Spotify profile failure after OAuth is shown instead of leaving the page idle', () => {
    const handleAuth = html.slice(
        html.indexOf('function handleAuth('),
        html.indexOf('function refreshMyMusicTracks('),
    );
    assert.match(html, /id="authError"/);
    assert.match(html, /function showAuthError\(/);
    assert.match(handleAuth, /error:\s*function\s*\(jqXHR\)/);
    assert.match(handleAuth, /showAuthError\(jqXHR\)/);
});
