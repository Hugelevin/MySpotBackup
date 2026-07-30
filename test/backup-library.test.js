const assert = require('node:assert/strict');
const test = require('node:test');

const BackupTools = require('../public/backup.js');

test('Spotify totals preserve the difference between missing and zero', () => {
    assert.equal(BackupTools.reportedSpotifyTotal(null), null);
    assert.equal(BackupTools.reportedSpotifyTotal(undefined), null);
    assert.equal(BackupTools.reportedSpotifyTotal(''), null);
    assert.equal(BackupTools.reportedSpotifyTotal('not-a-number'), null);
    assert.equal(BackupTools.reportedSpotifyTotal(0), 0);
    assert.equal(BackupTools.reportedSpotifyTotal('12'), 12);
});

test('supplemental library loads require an exact Spotify total and no skipped items', () => {
    assert.equal(
        BackupTools.assessSupplementalLibraryLoad(
            {expectedTotal: 2, receivedItems: 2, skipped: 0, error: null},
            'Saved albums',
        ).complete,
        true,
    );
    assert.match(
        BackupTools.assessSupplementalLibraryLoad(
            {expectedTotal: 3, receivedItems: 2, skipped: 0, error: null},
            'Saved albums',
        ).message,
        /only 2 of 3/,
    );
    assert.equal(
        BackupTools.assessSupplementalLibraryLoad(
            {expectedTotal: null, receivedItems: 0, skipped: 0, error: null},
            'Followed artists',
        ).complete,
        false,
    );
    assert.equal(
        BackupTools.assessSupplementalLibraryLoad(
            {expectedTotal: 1, receivedItems: 1, skipped: 1, error: null},
            'Saved shows',
        ).complete,
        false,
    );
});

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
    assert.equal(snapshot.backup.formatVersion, 3);
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

test('a local playlist item is archived even though Spotify cannot restore it', () => {
    assert.deepEqual(
        BackupTools.playlistItemFromSpotify({
            added_at: '2022-06-01T10:00:00Z',
            added_by: { id: 'spotify-user' },
            item: {
                id: null,
                uri: 'spotify:local:Artist:Album:Song:180',
            },
        }),
        {
            id: null,
            uri: 'spotify:local:Artist:Album:Song:180',
            addedAt: '2022-06-01T10:00:00Z',
            addedBy: 'spotify-user',
        },
    );
});

test('playlist metadata preserves descriptions and converts Spotify null to an empty string', () => {
    assert.deepEqual(
        BackupTools.playlistMetadataFromSpotify({
            id: 'playlist-1',
            name: 'Road Trip',
            description: 'Windows down, volume up.',
            public: false,
            collaborative: false,
        }),
        {
            id: 'playlist-1',
            name: 'Road Trip',
            description: 'Windows down, volume up.',
            public: false,
            collaborative: false,
        },
    );
    assert.equal(
        BackupTools.playlistMetadataFromSpotify({
            id: 'playlist-2',
            name: 'Empty description',
            description: null,
        }).description,
        '',
    );
});

test('Liked Songs restore requests run oldest-first to preserve Recently Added order', () => {
    const batches = BackupTools.createLikedSongRestoreBatches(
        [
            { id: 'newest', uri: 'spotify:track:newest', addedAt: '2025-01-03T00:00:00Z' },
            { id: 'middle', uri: 'spotify:track:middle', addedAt: '2025-01-02T00:00:00Z' },
            { id: 'oldest', uri: 'spotify:track:oldest', addedAt: '2025-01-01T00:00:00Z' },
        ],
        [],
    );

    assert.deepEqual(
        batches.flatMap(batch => batch.tracks.map(track => track.id)),
        ['oldest', 'middle', 'newest'],
    );
});

test('Liked Songs verification distinguishes presence from Recently Added order', () => {
    const imported = [
        { id: 'newest', addedAt: '2025-01-03T00:00:00Z' },
        { id: 'middle', addedAt: '2025-01-02T00:00:00Z' },
        { id: 'oldest', addedAt: '2025-01-01T00:00:00Z' },
    ];

    assert.deepEqual(
        BackupTools.assessLikedSongsRestore(imported, [
            { id: 'newest' },
            { id: 'oldest' },
            { id: 'middle' },
        ]),
        {
            expectedCount: 3,
            presentCount: 3,
            missing: 0,
            orderVerified: false,
            orderMismatch: 2,
        },
    );
});

test('playlist export verification fails on a truncated playlist page', () => {
    assert.deepEqual(
        BackupTools.assessPlaylistLibraryLoad({
            expectedPlaylists: 4,
            receivedPlaylists: 4,
            expectedTrackItems: 120,
            receivedTrackItems: 100,
            restorableTrackItems: 100,
            skippedTrackItems: 0,
            error: null,
        }),
        {
            complete: false,
            playlistCount: 4,
            trackCount: 100,
            expectedTrackItems: 120,
            skippedTrackItems: 0,
            message: 'Spotify returned only 100 of 120 editable playlist items.',
        },
    );
});

test('playlist export verification rejects a missing Spotify playlist total', () => {
    assert.deepEqual(
        BackupTools.assessPlaylistLibraryLoad({
            expectedPlaylists: null,
            receivedPlaylists: 0,
            expectedTrackItems: 0,
            receivedTrackItems: 0,
            restorableTrackItems: 0,
            skippedTrackItems: 0,
            missingTrackTotals: 0,
            error: null,
        }),
        {
            complete: false,
            playlistCount: 0,
            trackCount: 0,
            expectedTrackItems: 0,
            skippedTrackItems: 0,
            message: 'Spotify did not report the total number of playlists.',
        },
    );
});

test('playlist export verification rejects any editable playlist with an unknown item total', () => {
    assert.equal(
        BackupTools.assessPlaylistLibraryLoad({
            expectedPlaylists: 1,
            receivedPlaylists: 1,
            expectedTrackItems: 0,
            receivedTrackItems: 0,
            restorableTrackItems: 0,
            skippedTrackItems: 0,
            missingTrackTotals: 1,
            error: null,
        }).message,
        'Spotify did not report all editable playlist item totals.',
    );
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
    assert.equal(BackupTools.shouldRetrySpotifyStatus(429, 11), true);
    assert.equal(BackupTools.shouldRetrySpotifyStatus(429, 12), false);
    assert.equal(BackupTools.shouldRetrySpotifyStatus(503, 2), true);
    assert.equal(BackupTools.shouldRetrySpotifyStatus(503, 3), false);
    assert.equal(BackupTools.shouldRetrySpotifyStatus(403, 0), false);
});

test('Spotify quota exhaustion is distinguished from a short rolling rate limit', () => {
    const quotaResponse = {
        error: {
            status: 429,
            message: 'Too many requests',
            reason: 'QUOTA_EXCEEDED',
        },
    };

    assert.equal(BackupTools.spotifyErrorReason(quotaResponse), 'QUOTA_EXCEEDED');
    assert.equal(
        BackupTools.shouldRetrySpotifyStatus(429, 47, 'QUOTA_EXCEEDED'),
        true,
    );
    assert.equal(
        BackupTools.shouldRetrySpotifyStatus(429, 48, 'QUOTA_EXCEEDED'),
        false,
    );
    assert.equal(BackupTools.shouldRetrySpotifyStatus(429, 11, ''), true);
    assert.equal(BackupTools.shouldRetrySpotifyStatus(429, 12, ''), false);
    assert.match(
        BackupTools.assessLikedSongsLoad({
            expectedTotal: 10,
            receivedItems: 5,
            savedTracks: new Array(5),
            skipped: 0,
            error: {status: 429, reason: 'QUOTA_EXCEEDED'},
        }).message,
        /developer quota/,
    );
});

test('Spotify retry delays cool down quota and no-header limits conservatively', () => {
    assert.equal(
        BackupTools.spotifyRetryDelayMs({
            status: 429,
            reason: 'QUOTA_EXCEEDED',
            retryAfterSeconds: null,
            attempts: 0,
            defaultDelayMs: 100,
        }),
        30 * 60 * 1000,
    );
    assert.equal(
        BackupTools.spotifyRetryDelayMs({
            status: 429,
            reason: 'QUOTA_EXCEEDED',
            retryAfterSeconds: 3600,
            attempts: 0,
            defaultDelayMs: 100,
        }),
        3_601_000,
    );
    assert.ok(
        BackupTools.spotifyRetryDelayMs({
            status: 429,
            reason: '',
            retryAfterSeconds: null,
            attempts: 0,
            defaultDelayMs: 100,
        }) >= 31_000,
    );
    assert.equal(
        BackupTools.spotifyRetryDelayMs({
            status: 429,
            reason: '',
            retryAfterSeconds: 12,
            attempts: 0,
            defaultDelayMs: 100,
        }),
        13_000,
    );
});

test('non-idempotent playlist writes retry rate limits but not ambiguous server errors', () => {
    assert.equal(BackupTools.shouldRetrySpotifyPostStatus(429, 0), true);
    assert.equal(BackupTools.shouldRetrySpotifyPostStatus(429, 11), true);
    assert.equal(BackupTools.shouldRetrySpotifyPostStatus(429, 12), false);
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

test('an export cannot claim success when editable playlist tracks are incomplete', () => {
    assert.throws(
        () => BackupTools.createExportSnapshot(
            { playlists: {}, saved: [] },
            { complete: true, count: 0, expectedTotal: 0, skipped: 0 },
            '2026-07-29T20:00:00.000Z',
            {
                complete: false,
                playlistCount: 1,
                trackCount: 9,
                expectedTrackItems: 10,
                skippedTrackItems: 0,
            },
        ),
        /playlist data has not been completely verified/i,
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
