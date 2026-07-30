const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const BackupTools = require('../public/backup.js');
const html = readFileSync(join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('a 429 without a readable Retry-After header waits beyond Spotify rolling window', () => {
    const retryFunctionSource = html.slice(
        html.indexOf('function getRetryDelay('),
        html.indexOf('function incompleteLibraryDetails('),
    );
    const fakeElement = {
        removeClass() { return this; },
        text() { return this; },
    };
    const getRetryDelay = new Function(
        'conf',
        '$',
        'console',
        'globalStep',
        'MySpotBackup',
        'spotifyReason',
        'showSpotifyCooldown',
        retryFunctionSource + '\nreturn getRetryDelay;',
    )(
        {slowdown_import: 100},
        () => fakeElement,
        {warn() {}},
        '',
        BackupTools,
        () => '',
        () => {},
    );

    const delay = getRetryDelay(
        {status: 429, getResponseHeader() { return null; }},
        100,
    );

    assert.ok(delay >= 31_000, `expected a cooldown beyond 30s, received ${delay}ms`);
});

test('follow and unfollow operations use the 2026 generic library endpoint', () => {
    assert.doesNotMatch(html, /\/playlists\/['"]?\s*\+\s*[^;\n]+\/followers/);
    assert.doesNotMatch(html, /spotify:user:/);
    assert.match(html, /spotify:playlist:/);
    assert.match(html, /spotify:artist:/);
});

test('a no-op import still runs final verification', () => {
    assert.match(
        html,
        /globalStep = "No new items found in import";\s*verifyRestoredLikedSongs\(/,
    );
});

test('playlist restore failures are surfaced instead of reporting false success', () => {
    assert.match(html, /Failed to create playlist/);
    assert.match(html, /Failed to add a song to a merged playlist/);
    assert.match(html, /Failed to follow .* playlists/);
    assert.match(html, /importErrors\.push/);
});

test('new playlists restore descriptions without overwriting same-name destinations', () => {
    assert.match(html, /description:\s*typeof playlistSource\.description/);
    assert.match(html, /makeSurePlaylistExists\(importedPlaylist/);
    assert.match(html, /if \(existing\) \{ callback\(true, existing\); return; \}/);
});

test('the import target is confirmed and account switching clears only app authorization', () => {
    assert.match(html, /id="importTargetName"/);
    assert.match(html, /id="btnStartImport"/);
    assert.match(html, /id="btnSwitchAfterImport"/);
    assert.match(html, /MySpotOAuth\.clearAuthorizationSession/);
    assert.match(html, /showDialog:\s*showDialog === true/);
});

test('export requires both Liked Songs and playlist pagination to be verified', () => {
    assert.match(html, /playlistLibraryState = MySpotBackup\.assessPlaylistLibraryLoad/);
    assert.match(html, /!likedSongsComplete \|\| !playlistsComplete/);
    assert.match(html, /createExportSnapshot\(\s*collections,\s*likedSongsState,\s*new Date\(\)\.toISOString\(\),\s*playlistLibraryState/s);
    assert.match(html, /reportedSpotifyTotal\(data\.total\)/);
    assert.match(html, /reportedSpotifyTotal\(tracksRef\.total\)/);
    assert.doesNotMatch(html, /Number\(tracksRef\.total\)/);
});

test('returning to the dashboard does not spend quota until the next choice', () => {
    const bindControls = html.slice(
        html.indexOf('function bindControls()'),
        html.indexOf('function wipeAccount()'),
    );
    assert.match(bindControls, /btnBackToDashboard[\s\S]*showDashboardChoices\(\)/);
    const backControl = bindControls.slice(
        bindControls.indexOf("$('#btnBackToDashboard')"),
        bindControls.indexOf("$('#btnWipe')"),
    );
    assert.doesNotMatch(backControl, /refreshTrackData\(/);
});

test('an import containing only empty playlists still reaches verification and completion', () => {
    const uploadHandler = html.slice(
        html.indexOf('function handleTrackUpload()'),
        html.indexOf('function verifyRestoredLikedSongs('),
    );
    assert.match(
        uploadHandler,
        /globalStep = "No new items found in import";[\s\S]*verifyRestoredLikedSongs\(function \(verification\) \{[\s\S]*finishImport\(\)/,
    );
});

test('a rate-limited library load still exposes backup-file selection while export stays blocked', () => {
    assert.match(html, /id="btnImportWhileWaiting"/);
    const refreshTrackData = html.slice(
        html.indexOf('function refreshTrackData('),
        html.indexOf('function resetCounter('),
    );
    assert.match(
        refreshTrackData,
        /incomplete backup cannot be created[\s\S]*\$\('#btnImportWhileWaiting'\)\.removeClass\('hidden'\)/,
    );
    assert.match(html, /function ensureDestinationReadyForImport\(/);
});

test('wipe retries Spotify batches and verifies the destination without a reload burst', () => {
    const wipeCode = html.slice(
        html.indexOf('function wipeAccount('),
        html.indexOf('function handleAuth('),
    );

    assert.match(wipeCode, /function finishWipe\(/);
    assert.match(wipeCode, /shouldRetrySpotifyRequest\(jqXHR, attempts, false\)/);
    assert.match(wipeCode, /refreshTrackData\(function \(complete\)/);
    assert.doesNotMatch(wipeCode, /location\.reload\(/);
    assert.doesNotMatch(wipeCode, /rate-limited the verification/);
});

test('all saved-library and followed-artist pages retry and block incomplete exports', () => {
    const ancillaryLoaders = html.slice(
        html.indexOf('function refreshSavedAlbums('),
        html.indexOf('function loadTrackChunksWithTimeout('),
    );

    assert.match(ancillaryLoaders, /function loadLibraryChunks\(url, arr, itemKey, callback, attempts, summary\)/);
    assert.match(ancillaryLoaders, /function loadArtistChunks\(url, arr, callback, attempts, summary\)/);
    assert.match(ancillaryLoaders, /shouldRetrySpotifyRequest\(jqXHR, attempts, false\)/);
    assert.match(ancillaryLoaders, /supplementalLibraryErrors\.push\(/);
    assert.match(ancillaryLoaders, /assessSupplementalLibraryLoad\(/);
});

test('saved-library restore retries a rate-limited batch without silently dropping it', () => {
    const restoreLoader = html.slice(
        html.indexOf('function handleLibrarySaveRequests('),
        html.indexOf('function refreshFollowedArtists('),
    );

    assert.match(restoreLoader, /shouldRetrySpotifyRequest\(jqXHR, attempts, true\)/);
    assert.match(restoreLoader, /handleLibrarySaveRequests\(arr, entityType, callback, attempts \+ 1, batch\)/);
    assert.match(restoreLoader, /importErrors\.push\(/);
});

test('import readiness requires the playlists and Liked Songs destination scan', () => {
    const readiness = html.slice(
        html.indexOf('function destinationLibraryReady('),
        html.indexOf('function startConfirmedImport('),
    );

    assert.match(readiness, /destinationLibraryState\.complete/);
    assert.doesNotMatch(readiness, /fullLibraryState\.complete/);
});

test('login waits for a simple backup-or-restore choice instead of spending quota immediately', () => {
    const handleAuth = html.slice(
        html.indexOf('function handleAuth('),
        html.indexOf('function refreshMyMusicTracks('),
    );

    assert.match(handleAuth, /showDashboardChoices\(\)/);
    assert.doesNotMatch(handleAuth, /refreshTrackData\(/);
    assert.match(handleAuth, /resetLoadedLibrary\(\)/);
    assert.match(handleAuth, /scheduleTokenRefresh\(\)/);
});

test('profile quota retries use the renewed access token', () => {
    const handleAuth = html.slice(
        html.indexOf('function handleAuth('),
        html.indexOf('function refreshMyMusicTracks('),
    );

    assert.match(
        handleAuth,
        /if \(accessToken\) token = accessToken;[\s\S]*scheduleTokenRefresh\(\);[\s\S]*'Bearer ' \+ token/,
    );
    assert.match(
        handleAuth,
        /handleAuth\(null, attempts \+ 1, refreshedAfterUnauthorized\)/,
    );
    assert.doesNotMatch(handleAuth, /handleAuth\(accessToken, attempts \+ 1\)/);
    assert.match(
        handleAuth,
        /var savedAccessToken = MySpotOAuth\.getAccessToken[\s\S]*else if \(MySpotOAuth\.getTokenRefreshDelay[\s\S]*renewSpotifyToken\(\)\.then[\s\S]*beginProfileRequest\(\)/,
    );
    assert.match(
        handleAuth,
        /jqXHR\.status === 401[\s\S]*renewSpotifyToken\(\)\.then[\s\S]*handleAuth\(freshAccessToken, attempts, true\)/,
    );
});

test('a long Spotify quota wait renews login without a client secret', () => {
    const refreshScheduler = html.slice(
        html.indexOf('function renewSpotifyToken('),
        html.indexOf('function updateClientIdStatus('),
    );

    assert.match(refreshScheduler, /MySpotOAuth\.getTokenRefreshDelay/);
    assert.match(refreshScheduler, /MySpotOAuth\.refreshAccessToken/);
    assert.match(refreshScheduler, /token = freshAccessToken/);
    assert.doesNotMatch(refreshScheduler, /client_secret/);
});

test('switching accounts invalidates an in-flight token refresh', () => {
    const refreshScheduler = html.slice(
        html.indexOf('function renewSpotifyToken('),
        html.indexOf('function updateClientIdStatus('),
    );
    const switchAccount = html.slice(
        html.indexOf('function switchAccount('),
        html.indexOf('function download('),
    );

    assert.match(refreshScheduler, /var refreshGeneration = authorizationGeneration/);
    assert.match(refreshScheduler, /refreshGeneration !== authorizationGeneration/);
    assert.match(switchAccount, /authorizationGeneration \+= 1/);
    assert.match(switchAccount, /tokenRefreshController\.abort\(\)/);
});

test('restore verifies only the destination data needed for safe merging', () => {
    const readiness = html.slice(
        html.indexOf('function ensureDestinationReadyForImport('),
        html.indexOf('function startConfirmedImport('),
    );
    const exportControl = html.slice(
        html.indexOf('function startExport('),
        html.indexOf('function collectionProperties('),
    );

    assert.match(readiness, /refreshDestinationData\(/);
    assert.doesNotMatch(readiness, /refreshTrackData\(/);
    assert.match(exportControl, /refreshTrackData\(/);
});

test('Try again resumes the scan that failed instead of assuming an export', () => {
    const retryControl = html.slice(
        html.indexOf("$('#btnRetryLoad').click"),
        html.indexOf("$('#btnStartImport').click"),
    );

    assert.match(html, /lastLibraryLoadCallback = callback/);
    assert.match(retryControl, /lastLibraryLoadCallback/);
    assert.doesNotMatch(retryControl, /downloadVerifiedBackup\(/);
});

test('a cancelled or replaced restore cannot be resumed by a stale retry', () => {
    const cancelSelection = html.slice(
        html.indexOf('function cancelImportSelection('),
        html.indexOf('function destinationLibraryReady('),
    );
    const confirmedImport = html.slice(
        html.indexOf('function startConfirmedImport('),
        html.indexOf('function downloadVerifiedBackup('),
    );

    assert.match(cancelSelection, /lastLibraryLoadCallback = null/);
    assert.match(confirmedImport, /var selectedImport = importColl/);
    assert.match(confirmedImport, /importColl !== selectedImport/);
});
