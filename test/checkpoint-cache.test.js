const assert = require('node:assert/strict');
const test = require('node:test');

const Checkpoints = require('../public/checkpoint.js');

test('playlist checkpoints are reusable only for the same account and snapshot', () => {
    const record = {
        accountId: 'source-account',
        playlistId: 'playlist-1',
        snapshotId: 'snapshot-2',
        expectedTotal: 2,
        receivedItems: 2,
        restorableItems: 2,
        skipped: 0,
        tracks: [{uri: 'spotify:track:1'}, {uri: 'spotify:track:2'}],
    };

    assert.equal(
        Checkpoints.isReusablePlaylistCheckpoint(
            record,
            'source-account',
            'playlist-1',
            'snapshot-2',
            2,
        ),
        true,
    );
    assert.equal(
        Checkpoints.isReusablePlaylistCheckpoint(
            record,
            'source-account',
            'playlist-1',
            'changed-snapshot',
            2,
        ),
        false,
    );
    assert.equal(
        Checkpoints.isReusablePlaylistCheckpoint(
            record,
            'different-account',
            'playlist-1',
            'snapshot-2',
            2,
        ),
        false,
    );
    assert.equal(
        Checkpoints.isReusablePlaylistCheckpoint(
            {...record, snapshotId: ''},
            'source-account',
            'playlist-1',
            '',
            2,
        ),
        false,
        'a missing Spotify snapshot ID cannot prove cached tracks are unchanged',
    );
});
