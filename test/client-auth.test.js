const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const html = readFileSync(join(__dirname, '..', 'public', 'index.html'), 'utf8');
const callback = readFileSync(join(__dirname, '..', 'public', 'callback.html'), 'utf8');

test('the login page uses browser-only PKCE instead of a server login route', () => {
    assert.match(html, /oauth\.js/);
    assert.match(html, /MySpotOAuth\.createAuthorizationRequest/);
    assert.match(html, /id="spotifyClientId"/);
    assert.match(html, /id="saveClientId"/);
    assert.doesNotMatch(html, /new URL\(['"]\/login/);
    assert.doesNotMatch(html, /conf\.login_url/);
    assert.doesNotMatch(html, /\bprompt\(/);
});

test('the static callback completes PKCE and returns to the app', () => {
    assert.match(callback, /MySpotOAuth\.completeAuthorization/);
    assert.match(callback, /window\.location\.replace\(returnUrl\)/);
});
