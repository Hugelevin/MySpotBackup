'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');

const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const OAUTH_SESSION_TTL_MS = 10 * 60 * 1000;
const SCOPES = [
    'user-read-private',
    'playlist-read-private',
    'playlist-read-collaborative',
    'playlist-modify-public',
    'playlist-modify-private',
    'user-library-read',
    'user-library-modify',
    'user-follow-read',
    'user-follow-modify',
].join(' ');

function generateRandomString(length) {
    return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

function generateCodeChallenge(codeVerifier) {
    return crypto.createHash('sha256').update(codeVerifier).digest('base64url');
}

function buildAuthorizationUrl(config, state, codeChallenge) {
    const url = new URL(SPOTIFY_AUTHORIZE_URL);
    url.search = new URLSearchParams({
        client_id: config.client_id,
        response_type: 'code',
        redirect_uri: config.callback_uri,
        scope: SCOPES,
        state,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
    }).toString();
    return url.toString();
}

function normalizeConfig(config) {
    const clientId = String(config.client_id || '').trim();
    if (!clientId || clientId === 'yourclientid') {
        throw new Error('Set client_id in public/config.js to the Client ID from your Spotify app.');
    }

    let callbackUrl;
    try {
        callbackUrl = new URL(config.callback_uri);
    } catch {
        throw new Error('callback_uri in public/config.js must be a complete URL.');
    }

    const isSecure = callbackUrl.protocol === 'https:';
    const isLoopback = callbackUrl.protocol === 'http:'
        && (callbackUrl.hostname === '127.0.0.1' || callbackUrl.hostname === '[::1]');
    if (!isSecure && !isLoopback) {
        throw new Error(
            'Spotify requires HTTPS, except for HTTP loopback redirects such as '
            + 'http://127.0.0.1:8080/callback. Spotify does not allow localhost.',
        );
    }

    const port = Number(process.env.PORT || config.port || callbackUrl.port || 8080);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('port in public/config.js must be an integer from 1 to 65535.');
    }

    return {
        ...config,
        client_id: clientId,
        callback_uri: callbackUrl.toString(),
        port,
        app_origin: callbackUrl.origin,
    };
}

function safeJson(value) {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

function errorPage(message) {
    const text = String(message || 'Spotify authorization failed.');
    const escaped = text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Spotify login failed</title></head>
<body><h1>Spotify login failed</h1><p>${escaped}</p><p><a href="/">Return to MySpotBackup</a></p></body>
</html>`;
}

function successPage(accessToken, targetOrigin) {
    return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Spotify connected</title></head>
<body><p>Spotify connected. This window will close automatically.</p>
<script>
(() => {
    const targetOrigin = ${safeJson(targetOrigin)};
    const message = { type: 'myspotbackup-auth', token: ${safeJson(accessToken)} };
    if (!window.opener) {
        document.body.textContent = 'Spotify connected. Close this window and return to MySpotBackup.';
        return;
    }
    window.opener.postMessage(message, targetOrigin);
    window.close();
})();
</script></body>
</html>`;
}

async function exchangeCodeForToken(config, code, codeVerifier, fetchImpl) {
    const response = await fetchImpl(SPOTIFY_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            client_id: config.client_id,
            grant_type: 'authorization_code',
            code,
            redirect_uri: config.callback_uri,
            code_verifier: codeVerifier,
        }),
    });

    const body = await response.json();
    if (!response.ok || !body.access_token) {
        throw new Error(body.error_description || body.error || `Spotify token request failed (${response.status}).`);
    }
    return body.access_token;
}

function createApp(rawConfig, options = {}) {
    const config = normalizeConfig(rawConfig);
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const now = options.now || Date.now;
    const pendingAuthorizations = new Map();
    const app = express();

    app.disable('x-powered-by');

    app.get('/login', (req, res) => {
        const expiryCutoff = now() - OAUTH_SESSION_TTL_MS;
        for (const [state, session] of pendingAuthorizations) {
            if (session.createdAt < expiryCutoff) pendingAuthorizations.delete(state);
        }

        const state = generateRandomString(32);
        const codeVerifier = generateRandomString(96);
        pendingAuthorizations.set(state, { codeVerifier, createdAt: now() });

        const location = buildAuthorizationUrl(
            config,
            state,
            generateCodeChallenge(codeVerifier),
        );
        res.set('Cache-Control', 'no-store');
        res.redirect(302, location);
    });

    app.get('/callback', async (req, res) => {
        res.set({
            'Cache-Control': 'no-store',
            'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
            'Referrer-Policy': 'no-referrer',
        });

        const state = typeof req.query.state === 'string' ? req.query.state : '';
        const session = pendingAuthorizations.get(state);
        if (!session || now() - session.createdAt > OAUTH_SESSION_TTL_MS) {
            pendingAuthorizations.delete(state);
            return res.status(400).type('html').send(errorPage(
                'The login session is invalid or expired. Return to MySpotBackup and try again.',
            ));
        }
        pendingAuthorizations.delete(state);

        if (req.query.error) {
            return res.status(400).type('html').send(errorPage(
                `Spotify authorization was not completed: ${req.query.error}`,
            ));
        }

        const code = typeof req.query.code === 'string' ? req.query.code : '';
        if (!code) {
            return res.status(400).type('html').send(errorPage(
                'Spotify did not return an authorization code. Return to MySpotBackup and try again.',
            ));
        }

        try {
            const accessToken = await exchangeCodeForToken(
                config,
                code,
                session.codeVerifier,
                fetchImpl,
            );
            return res.status(200).type('html').send(successPage(accessToken, config.app_origin));
        } catch (error) {
            return res.status(502).type('html').send(errorPage(error.message));
        }
    });

    app.use(express.static(path.join(__dirname, 'public'), {
        etag: true,
        maxAge: 0,
        setHeaders(res, filePath) {
            if (filePath.endsWith('config.js')) {
                res.set('Cache-Control', 'no-store');
            }
        },
    }));

    return app;
}

function loadConfig() {
    try {
        return require('./public/config');
    } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND' && error.message.includes('public/config')) {
            throw new Error(
                'Missing public/config.js. Copy public/config.example.js to public/config.js, '
                + 'then add your Spotify Client ID.',
            );
        }
        throw error;
    }
}

if (require.main === module) {
    try {
        const config = normalizeConfig(loadConfig());
        const app = createApp(config);
        app.listen(config.port, '127.0.0.1', () => {
            console.log(`MySpotBackup is running at http://127.0.0.1:${config.port}`);
        });
    } catch (error) {
        console.error(`Configuration error: ${error.message}`);
        process.exitCode = 1;
    }
}

module.exports = {
    buildAuthorizationUrl,
    createApp,
    generateCodeChallenge,
    normalizeConfig,
};
