const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const html = readFileSync(join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('the login popup always uses the same-origin PKCE endpoint', () => {
    assert.doesNotMatch(html, /conf\.login_url/);
    assert.match(html, /new URL\(['"]\/login['"], window\.location\.origin\)/);
});

