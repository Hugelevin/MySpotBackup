const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const {
    createApp,
    generateCodeChallenge,
    normalizeConfig,
} = require('../index');

const config = {
    port: 8080,
    callback_uri: 'http://127.0.0.1:8080/callback',
    client_id: 'test-client-id',
};

async function startApp(options) {
    const app = createApp(config, options);
    const server = await new Promise((resolve) => {
        const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
    });
    const address = server.address();
    return {
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        }),
    };
}

test('login sends Spotify an Authorization Code with PKCE request', async (t) => {
    const server = await startApp();
    t.after(server.close);

    const response = await fetch(`${server.origin}/login`, { redirect: 'manual' });
    assert.equal(response.status, 302);

    const authorizationUrl = new URL(response.headers.get('location'));
    assert.equal(authorizationUrl.origin, 'https://accounts.spotify.com');
    assert.equal(authorizationUrl.pathname, '/authorize');
    assert.equal(authorizationUrl.searchParams.get('response_type'), 'code');
    assert.equal(authorizationUrl.searchParams.get('client_id'), config.client_id);
    assert.equal(authorizationUrl.searchParams.get('redirect_uri'), config.callback_uri);
    assert.equal(authorizationUrl.searchParams.get('code_challenge_method'), 'S256');
    assert.match(authorizationUrl.searchParams.get('state'), /^[A-Za-z0-9_-]{32}$/);
    assert.match(authorizationUrl.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
});

test('each login has independent one-time state and PKCE verification', async (t) => {
    const tokenRequests = [];
    const fetchImpl = async (url, options) => {
        tokenRequests.push({ url, body: new URLSearchParams(options.body) });
        return {
            ok: true,
            status: 200,
            json: async () => ({ access_token: 'test-access-token' }),
        };
    };
    const server = await startApp({ fetchImpl });
    t.after(server.close);

    const firstLogin = new URL((await fetch(`${server.origin}/login`, {
        redirect: 'manual',
    })).headers.get('location'));
    const secondLogin = new URL((await fetch(`${server.origin}/login`, {
        redirect: 'manual',
    })).headers.get('location'));

    assert.notEqual(
        firstLogin.searchParams.get('state'),
        secondLogin.searchParams.get('state'),
    );
    assert.notEqual(
        firstLogin.searchParams.get('code_challenge'),
        secondLogin.searchParams.get('code_challenge'),
    );

    const callback = await fetch(
        `${server.origin}/callback?code=test-code&state=${firstLogin.searchParams.get('state')}`,
    );
    assert.equal(callback.status, 200);
    assert.equal(tokenRequests.length, 1);
    assert.equal(tokenRequests[0].body.get('grant_type'), 'authorization_code');
    assert.equal(tokenRequests[0].body.get('code'), 'test-code');
    assert.equal(tokenRequests[0].body.get('redirect_uri'), config.callback_uri);
    assert.equal(
        generateCodeChallenge(tokenRequests[0].body.get('code_verifier')),
        firstLogin.searchParams.get('code_challenge'),
    );

    const replay = await fetch(
        `${server.origin}/callback?code=replayed&state=${firstLogin.searchParams.get('state')}`,
    );
    assert.equal(replay.status, 400);
    assert.equal(tokenRequests.length, 1);
});

test('invalid config explains Spotify redirect URI requirements', () => {
    assert.throws(
        () => normalizeConfig({ ...config, callback_uri: 'http://localhost:8080/callback' }),
        /does not allow localhost/,
    );
    assert.throws(
        () => normalizeConfig({ ...config, client_id: 'yourclientid' }),
        /Set client_id/,
    );
});

test('the config template declares its binding and can be loaded by Node', () => {
    const template = readFileSync(
        join(__dirname, '..', 'public', 'config.example.js'),
        'utf8',
    );
    assert.match(template, /^const config = /);
    assert.doesNotMatch(template, /^config = /);
});
