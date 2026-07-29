(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.MySpotOAuth = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
    const TOKEN_URL = 'https://accounts.spotify.com/api/token';
    const CLIENT_ID_KEY = 'myspotbackup:client_id';
    const PENDING_PREFIX = 'myspotbackup:pkce:';
    const TOKEN_KEY = 'myspotbackup:token';
    const SESSION_TTL_MS = 10 * 60 * 1000;
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

    function validateClientId(clientId) {
        const value = String(clientId || '').trim();
        if (!/^[A-Za-z0-9_-]{16,128}$/.test(value)) {
            throw new Error('Enter the Client ID shown in your Spotify app dashboard.');
        }
        return value;
    }

    function randomString(length, cryptoImpl) {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
        const values = new Uint8Array(length);
        cryptoImpl.getRandomValues(values);
        return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
    }

    function base64Url(bytes) {
        let binary = '';
        bytes.forEach((value) => { binary += String.fromCharCode(value); });
        return btoa(binary)
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
    }

    async function codeChallenge(verifier, cryptoImpl) {
        const data = new TextEncoder().encode(verifier);
        const digest = await cryptoImpl.subtle.digest('SHA-256', data);
        return base64Url(new Uint8Array(digest));
    }

    function callbackUrl(pageUrl) {
        return new URL('callback.html', pageUrl).toString();
    }

    function appUrl(pageUrl) {
        return new URL('./', pageUrl).toString();
    }

    async function createAuthorizationRequest(options) {
        const clientId = validateClientId(options.clientId);
        const cryptoImpl = options.cryptoImpl || globalThis.crypto;
        const now = options.now || Date.now;
        const state = randomString(32, cryptoImpl);
        const verifier = randomString(64, cryptoImpl);
        const redirectUri = callbackUrl(options.pageUrl);
        const challenge = await codeChallenge(verifier, cryptoImpl);

        options.storage.setItem(PENDING_PREFIX + state, JSON.stringify({
            clientId,
            createdAt: now(),
            redirectUri,
            verifier,
        }));

        const url = new URL(AUTHORIZE_URL);
        url.search = new URLSearchParams({
            client_id: clientId,
            response_type: 'code',
            redirect_uri: redirectUri,
            scope: SCOPES,
            state,
            code_challenge_method: 'S256',
            code_challenge: challenge,
        }).toString();
        return url.toString();
    }

    async function completeAuthorization(options) {
        const currentUrl = new URL(options.pageUrl);
        const state = currentUrl.searchParams.get('state') || '';
        const error = currentUrl.searchParams.get('error');
        const code = currentUrl.searchParams.get('code') || '';
        const pendingKey = PENDING_PREFIX + state;
        const rawPending = state ? options.storage.getItem(pendingKey) : null;

        if (error) throw new Error(`Spotify authorization was not completed: ${error}`);
        if (!state || !rawPending) {
            throw new Error('The Spotify login session is missing or invalid. Return to the app and try again.');
        }

        options.storage.removeItem(pendingKey);
        const pending = JSON.parse(rawPending);
        const now = options.now || Date.now;
        if (now() - pending.createdAt > SESSION_TTL_MS) {
            throw new Error('The Spotify login session expired. Return to the app and try again.');
        }
        if (!code) throw new Error('Spotify did not return an authorization code.');
        if (callbackUrl(options.pageUrl) !== pending.redirectUri) {
            throw new Error('The Spotify callback URL does not match the login request.');
        }

        const response = await options.fetchImpl(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: pending.clientId,
                grant_type: 'authorization_code',
                code,
                redirect_uri: pending.redirectUri,
                code_verifier: pending.verifier,
            }),
        });
        const body = await response.json();
        if (!response.ok || !body.access_token) {
            throw new Error(body.error_description || body.error || `Spotify token request failed (${response.status}).`);
        }

        options.sessionStorage.setItem(TOKEN_KEY, JSON.stringify({
            accessToken: body.access_token,
            expiresAt: now() + (Number(body.expires_in || 3600) * 1000),
        }));
        options.storage.setItem(CLIENT_ID_KEY, pending.clientId);
        const returnUrl = new URL(appUrl(options.pageUrl));
        returnUrl.searchParams.set('authenticated', '1');
        return returnUrl.toString();
    }

    function getAccessToken(sessionStorage, now = Date.now) {
        const rawToken = sessionStorage.getItem(TOKEN_KEY);
        if (!rawToken) return null;
        try {
            const saved = JSON.parse(rawToken);
            if (!saved.accessToken || saved.expiresAt <= now() + 5000) {
                sessionStorage.removeItem(TOKEN_KEY);
                return null;
            }
            return saved.accessToken;
        } catch {
            sessionStorage.removeItem(TOKEN_KEY);
            return null;
        }
    }

    return {
        CLIENT_ID_KEY,
        TOKEN_KEY,
        callbackUrl,
        completeAuthorization,
        createAuthorizationRequest,
        getAccessToken,
        validateClientId,
    };
});
