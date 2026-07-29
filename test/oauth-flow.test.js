const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { webcrypto } = require('node:crypto');
const test = require('node:test');

const { createApp } = require('../index');
const {
    TOKEN_KEY,
    callbackUrl,
    clearAuthorizationSession,
    completeAuthorization,
    createAuthorizationRequest,
    getAccessToken,
    validateClientId,
} = require('../public/oauth');

const CLIENT_ID = '0123456789abcdef0123456789abcdef';
const PAGE_URL = 'https://hugelevin.github.io/MySpotBackup/';

class MemoryStorage {
    constructor() {
        this.values = new Map();
    }

    getItem(key) {
        return this.values.has(key) ? this.values.get(key) : null;
    }

    key(index) {
        return Array.from(this.values.keys())[index] || null;
    }

    get length() {
        return this.values.size;
    }

    removeItem(key) {
        this.values.delete(key);
    }

    setItem(key, value) {
        this.values.set(key, String(value));
    }
}

async function makeAuthorization(storage, now = () => 1000) {
    const url = await createAuthorizationRequest({
        clientId: CLIENT_ID,
        cryptoImpl: webcrypto,
        now,
        pageUrl: PAGE_URL,
        storage,
    });
    return new URL(url);
}

test('GitHub Pages login sends Spotify response_type=code with PKCE', async () => {
    const authorizationUrl = await makeAuthorization(new MemoryStorage());

    assert.equal(authorizationUrl.origin, 'https://accounts.spotify.com');
    assert.equal(authorizationUrl.pathname, '/authorize');
    assert.equal(authorizationUrl.searchParams.get('response_type'), 'code');
    assert.equal(authorizationUrl.searchParams.get('client_id'), CLIENT_ID);
    assert.equal(
        authorizationUrl.searchParams.get('redirect_uri'),
        'https://hugelevin.github.io/MySpotBackup/callback.html',
    );
    assert.equal(authorizationUrl.searchParams.get('code_challenge_method'), 'S256');
    assert.match(authorizationUrl.searchParams.get('state'), /^[A-Za-z0-9._~-]{32}$/);
    assert.match(authorizationUrl.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
});

test('switch-account login forces a fresh Spotify authorization dialog', async () => {
    const storage = new MemoryStorage();
    const authorizationUrl = await createAuthorizationRequest({
        clientId: CLIENT_ID,
        cryptoImpl: webcrypto,
        now: () => 1000,
        pageUrl: PAGE_URL,
        showDialog: true,
        storage,
    });

    assert.equal(new URL(authorizationUrl).searchParams.get('show_dialog'), 'true');
});

test('switching accounts clears only the Spotify authorization session', () => {
    const sessionStorage = new MemoryStorage();
    const storage = new MemoryStorage();
    sessionStorage.setItem(TOKEN_KEY, 'token');
    sessionStorage.setItem('unrelated-session-value', 'keep');
    storage.setItem('myspotbackup:pkce:pending', 'pending');
    storage.setItem('myspotbackup:client_id', CLIENT_ID);
    storage.setItem('unrelated-local-value', 'keep');

    clearAuthorizationSession(sessionStorage, storage);

    assert.equal(sessionStorage.getItem(TOKEN_KEY), null);
    assert.equal(sessionStorage.getItem('unrelated-session-value'), 'keep');
    assert.equal(storage.getItem('myspotbackup:pkce:pending'), null);
    assert.equal(storage.getItem('myspotbackup:client_id'), CLIENT_ID);
    assert.equal(storage.getItem('unrelated-local-value'), 'keep');
});

test('the static callback exchanges a one-time code and stores the access token', async () => {
    const storage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();
    const authorizationUrl = await makeAuthorization(storage);
    const state = authorizationUrl.searchParams.get('state');
    let tokenRequest;

    const returnUrl = await completeAuthorization({
        fetchImpl: async (url, options) => {
            tokenRequest = { url, body: new URLSearchParams(options.body) };
            return {
                ok: true,
                status: 200,
                json: async () => ({ access_token: 'access-token', expires_in: 3600 }),
            };
        },
        now: () => 2000,
        pageUrl: `${callbackUrl(PAGE_URL)}?code=spotify-code&state=${state}`,
        sessionStorage,
        storage,
    });

    assert.equal(returnUrl, `${PAGE_URL}?authenticated=1`);
    assert.equal(tokenRequest.url, 'https://accounts.spotify.com/api/token');
    assert.equal(tokenRequest.body.get('grant_type'), 'authorization_code');
    assert.equal(tokenRequest.body.get('code'), 'spotify-code');
    assert.equal(tokenRequest.body.get('client_id'), CLIENT_ID);
    assert.equal(tokenRequest.body.get('redirect_uri'), callbackUrl(PAGE_URL));
    assert.ok(tokenRequest.body.get('code_verifier'));
    assert.equal(getAccessToken(sessionStorage, () => 2000), 'access-token');
    assert.ok(sessionStorage.getItem(TOKEN_KEY));

    await assert.rejects(
        () => completeAuthorization({
            fetchImpl: async () => assert.fail('A replay must not request a token'),
            now: () => 2001,
            pageUrl: `${callbackUrl(PAGE_URL)}?code=replay&state=${state}`,
            sessionStorage,
            storage,
        }),
        /missing or invalid/,
    );
});

test('client IDs are validated without requiring a client secret', () => {
    assert.equal(validateClientId(CLIENT_ID), CLIENT_ID);
    assert.throws(() => validateClientId(''), /Client ID/);
    assert.throws(() => validateClientId('client secret with spaces'), /Client ID/);
});

test('the config template declares its browser binding', () => {
    const template = readFileSync(
        join(__dirname, '..', 'public', 'config.example.js'),
        'utf8',
    );
    assert.match(template, /^const config = /);
    assert.doesNotMatch(template, /client_secret/);
});

test('the local server serves the same static app and callback', async (t) => {
    const server = await new Promise((resolve) => {
        const running = createApp().listen(0, '127.0.0.1', () => resolve(running));
    });
    t.after(() => new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    }));
    const origin = `http://127.0.0.1:${server.address().port}`;

    const home = await fetch(`${origin}/`);
    const callbackResponse = await fetch(`${origin}/callback.html`);
    assert.equal(home.status, 200);
    assert.equal(callbackResponse.status, 200);
    assert.match(await callbackResponse.text(), /Connecting Spotify/);
});
