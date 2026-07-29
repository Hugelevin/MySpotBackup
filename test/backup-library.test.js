const assert = require('node:assert/strict');
const test = require('node:test');

const BackupTools = require('../public/backup.js');

test('a liked song backup preserves its Spotify ID, URI, and date liked', () => {
    assert.deepEqual(
        BackupTools.savedTrackFromSpotify({
            added_at: '2024-03-14T12:34:56Z',
            item: {
                id: 'track-1',
                uri: 'spotify:track:track-1',
            },
        }),
        {
            id: 'track-1',
            uri: 'spotify:track:track-1',
            addedAt: '2024-03-14T12:34:56Z',
        },
    );
});

test('a playlist item backup archives its original added date and contributor', () => {
    assert.deepEqual(
        BackupTools.playlistItemFromSpotify({
            added_at: '2022-06-01T10:00:00Z',
            added_by: { id: 'spotify-user' },
            item: {
                id: 'track-1',
                uri: 'spotify:track:track-1',
            },
        }),
        {
            id: 'track-1',
            uri: 'spotify:track:track-1',
            addedAt: '2022-06-01T10:00:00Z',
            addedBy: 'spotify-user',
        },
    );
});

test('a liked songs backup is rejected when Spotify pagination is incomplete', () => {
    assert.deepEqual(
        BackupTools.assessLikedSongsLoad({
            expectedTotal: 125,
            receivedItems: 80,
            savedTracks: new Array(80),
            skipped: 0,
            error: null,
        }),
        {
            complete: false,
            count: 80,
            expectedTotal: 125,
            skipped: 0,
            message: 'Spotify returned only 80 of 125 Liked Songs.',
        },
    );
});

test('a Liked Songs backup is incomplete when Spotify returns an unexportable song', () => {
    assert.deepEqual(
        BackupTools.assessLikedSongsLoad({
            expectedTotal: 2,
            receivedItems: 2,
            savedTracks: [{ id: 'track-1', uri: 'spotify:track:track-1' }],
            skipped: 1,
            error: null,
        }),
        {
            complete: false,
            count: 1,
            expectedTotal: 2,
            skipped: 1,
            message: 'Spotify returned 1 Liked Song without a restorable ID and URI.',
        },
    );
});

test('the exported backup declares a complete Liked Songs count', () => {
    const snapshot = BackupTools.createExportSnapshot(
        {
            playlists: {},
            saved: [{ id: 'track-1', uri: 'spotify:track:track-1', addedAt: '2024-03-14T12:34:56Z' }],
        },
        { complete: true, count: 1, expectedTotal: 1, skipped: 0 },
        '2026-07-29T20:00:00.000Z',
    );

    assert.deepEqual(snapshot.backup.likedSongs, {
        complete: true,
        count: 1,
        expectedTotal: 1,
        skipped: 0,
        preservesAddedAt: true,
    });
    assert.equal(snapshot.backup.formatVersion, 2);
});

test('Liked Songs restore batches attempt backed-up dates even for songs already liked', () => {
    const batches = BackupTools.createLikedSongRestoreBatches(
        [
            { id: 'already-liked', uri: 'spotify:track:already-liked', addedAt: '2023-01-01T00:00:00Z' },
            { id: 'restore-me', uri: 'spotify:track:restore-me', addedAt: '2024-01-01T00:00:00Z' },
            { id: 'legacy', uri: 'spotify:track:legacy' },
        ],
        [{ id: 'already-liked', uri: 'spotify:track:already-liked' }],
    );

    assert.deepEqual(batches, [
        {
            mode: 'timestamped',
            tracks: [
                {
                    id: 'already-liked',
                    uri: 'spotify:track:already-liked',
                    addedAt: '2023-01-01T00:00:00Z',
                },
                {
                    id: 'restore-me',
                    uri: 'spotify:track:restore-me',
                    addedAt: '2024-01-01T00:00:00Z',
                },
            ],
        },
        {
            mode: 'library',
            tracks: [{ id: 'legacy', uri: 'spotify:track:legacy', addedAt: null }],
        },
    ]);
});

test('same-name playlists remain distinct in a backup but merge only missing songs on restore', () => {
    const stored = {};
    const first = { id: 'playlist-1', name: 'Road Trip', tracks: [] };
    const second = { id: 'playlist-2', name: 'Road Trip', tracks: [] };
    stored[BackupTools.playlistStorageKey(first, stored)] = first;
    stored[BackupTools.playlistStorageKey(second, stored)] = second;

    assert.equal(Object.keys(stored).length, 2);
    assert.equal(
        BackupTools.findPlaylistByName(stored, 'Road Trip').id,
        'playlist-1',
    );
    assert.deepEqual(
        BackupTools.missingPlaylistTrackUris(
            [
                { uri: 'spotify:track:existing' },
                { uri: 'spotify:track:new' },
                { uri: 'spotify:track:new' },
                { uri: 'spotify:local:not-restorable' },
            ],
            [{ uri: 'spotify:track:existing' }],
        ),
        ['spotify:track:new'],
    );
});

test('an incomplete or truncated Liked Songs manifest cannot be imported silently', () => {
    assert.deepEqual(
        BackupTools.validateImportSnapshot({
            playlists: {},
            saved: [{ id: 'track-1', uri: 'spotify:track:track-1' }],
            backup: {
                likedSongs: { complete: true, count: 2 },
            },
        }),
        {
            valid: false,
            verified: false,
            likedSongCount: 1,
            message: 'This backup declares 2 Liked Songs but contains 1.',
        },
    );
});

test('a contradictory Spotify total cannot be imported as a verified Liked Songs backup', () => {
    assert.deepEqual(
        BackupTools.validateImportSnapshot({
            playlists: {},
            saved: [{ id: 'track-1', uri: 'spotify:track:track-1' }],
            backup: {
                likedSongs: { complete: true, count: 1, expectedTotal: 2 },
            },
        }),
        {
            valid: false,
            verified: false,
            likedSongCount: 1,
            message: 'This backup expected 2 Liked Songs but contains 1.',
        },
    );
});

test('a legacy backup is accepted without claiming its Liked Songs count was verified', () => {
    assert.deepEqual(
        BackupTools.validateImportSnapshot({
            playlists: {},
            saved: [{ id: 'legacy-track', uri: 'spotify:track:legacy-track' }],
        }),
        {
            valid: true,
            verified: false,
            likedSongCount: 1,
            message: 'Legacy backup: Liked Songs completeness cannot be verified.',
        },
    );
});

test('Liked Songs verification checks every unique restorable track in API-sized batches', () => {
    const songs = Array.from({ length: 41 }, (_, index) => ({
        id: 'track-' + index,
        uri: 'spotify:track:track-' + index,
    }));
    songs.push(songs[0]);
    songs.push({ id: null, uri: 'spotify:local:not-restorable' });

    const batches = BackupTools.createLikedSongVerificationBatches(songs);

    assert.equal(batches.length, 2);
    assert.equal(batches[0].length, 40);
    assert.deepEqual(batches[1], ['spotify:track:track-40']);
});

test('temporary Spotify failures are retried but permanent failures are not', () => {
    assert.equal(BackupTools.shouldRetrySpotifyStatus(429, 0), true);
    assert.equal(BackupTools.shouldRetrySpotifyStatus(503, 2), true);
    assert.equal(BackupTools.shouldRetrySpotifyStatus(503, 3), false);
    assert.equal(BackupTools.shouldRetrySpotifyStatus(403, 0), false);
});

test('non-idempotent playlist writes retry rate limits but not ambiguous server errors', () => {
    assert.equal(BackupTools.shouldRetrySpotifyPostStatus(429, 0), true);
    assert.equal(BackupTools.shouldRetrySpotifyPostStatus(429, 3), false);
    assert.equal(BackupTools.shouldRetrySpotifyPostStatus(503, 0), false);
});

test('an export cannot be created when its verified Liked Songs count does not match', () => {
    assert.throws(
        () => BackupTools.createExportSnapshot(
            { playlists: {}, saved: [] },
            { complete: true, count: 1, expectedTotal: 1, skipped: 0 },
            '2026-07-29T20:00:00.000Z',
        ),
        /Liked Songs count changed/,
    );
});

test('playlist merge queues each missing song once across same-name source playlists', () => {
    const queue = [];

    assert.equal(BackupTools.queuePlaylistTrack(queue, 'playlist-1', 'spotify:track:new'), true);
    assert.equal(BackupTools.queuePlaylistTrack(queue, 'playlist-1', 'spotify:track:new'), false);
    assert.equal(BackupTools.queuePlaylistTrack(queue, 'playlist-2', 'spotify:track:new'), true);
    assert.equal(BackupTools.queuePlaylistTrack(queue, 'playlist-1', 'spotify:local:file'), false);
    assert.deepEqual(queue, [
        { playlistId: 'playlist-1', uri: 'spotify:track:new', attempts: 0 },
        { playlistId: 'playlist-2', uri: 'spotify:track:new', attempts: 0 },
    ]);
});
