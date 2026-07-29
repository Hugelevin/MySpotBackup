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
    assert.match(html, /!likedSongsState\.complete \|\| !playlistLibraryState\.complete/);
    assert.match(html, /createExportSnapshot\(\s*collections,\s*likedSongsState,\s*new Date\(\)\.toISOString\(\),\s*playlistLibraryState/s);
    assert.match(html, /reportedSpotifyTotal\(data\.total\)/);
    assert.match(html, /reportedSpotifyTotal\(tracksRef\.total\)/);
    assert.doesNotMatch(html, /Number\(tracksRef\.total\)/);
});

test('returning to the dashboard reloads post-import data before enabling export', () => {
    const bindControls = html.slice(
        html.indexOf('function bindControls()'),
        html.indexOf('function wipeAccount()'),
    );
    assert.match(
        bindControls,
        /\$\('#btnBackToDashboard'\)\.click\(function \(\) \{[\s\S]*refreshTrackData\(function \(complete\) \{[\s\S]*if \(complete\) \$\('#pnlAction'\)\.removeClass\('hidden'\)/,
    );
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
