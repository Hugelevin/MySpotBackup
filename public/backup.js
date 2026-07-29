(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.MySpotBackup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function savedTrackFromSpotify(entry) {
        const track = entry && (entry.item || entry.track);
        if (!track || !track.id || !track.uri) return null;
        return {
            id: track.id,
            uri: track.uri,
            addedAt: entry.added_at || null,
        };
    }

    function playlistItemFromSpotify(entry) {
        const item = entry && (entry.item || entry.track);
        const isLocalTrack = item && item.uri && item.uri.indexOf('spotify:local:') === 0;
        if (!item || !item.uri || (!item.id && !isLocalTrack)) return null;
        return {
            id: item.id,
            uri: item.uri,
            addedAt: entry.added_at || null,
            addedBy: entry.added_by && entry.added_by.id ? entry.added_by.id : null,
        };
    }

    function playlistMetadataFromSpotify(playlist) {
        if (!playlist || !playlist.id || !playlist.name) return null;
        return {
            id: playlist.id,
            name: playlist.name,
            description: typeof playlist.description === 'string' ? playlist.description : '',
            public: playlist.public !== false,
            collaborative: playlist.collaborative === true,
        };
    }

    function reportedSpotifyTotal(value) {
        if (value === null || value === undefined || value === '') return null;
        const total = Number(value);
        return Number.isFinite(total) ? total : null;
    }

    function assessLikedSongsLoad(summary) {
        const hasExpectedTotal = summary.expectedTotal !== null
            && summary.expectedTotal !== undefined
            && summary.expectedTotal !== '';
        const expectedTotal = hasExpectedTotal ? Number(summary.expectedTotal) : NaN;
        const receivedItems = Number(summary.receivedItems);
        const count = summary.savedTracks.length;
        const skipped = Number(summary.skipped || 0);
        let message = '';

        if (summary.error) {
            message = 'Spotify stopped while loading Liked Songs'
                + (summary.error.status ? ' (HTTP ' + summary.error.status + ')' : '') + '.';
        } else if (!Number.isFinite(expectedTotal)) {
            message = 'Spotify did not report the total number of Liked Songs.';
        } else if (receivedItems !== expectedTotal) {
            message = 'Spotify returned only ' + receivedItems + ' of ' + expectedTotal + ' Liked Songs.';
        } else if (skipped > 0) {
            message = 'Spotify returned ' + skipped + ' Liked Song'
                + (skipped === 1 ? '' : 's') + ' without a restorable ID and URI.';
        }

        return {
            complete: message === '',
            count: count,
            expectedTotal: Number.isFinite(expectedTotal) ? expectedTotal : null,
            skipped: skipped,
            message: message,
        };
    }

    function assessPlaylistLibraryLoad(summary) {
        const hasExpectedPlaylists = summary.expectedPlaylists !== null
            && summary.expectedPlaylists !== undefined
            && summary.expectedPlaylists !== '';
        const hasExpectedTrackItems = summary.expectedTrackItems !== null
            && summary.expectedTrackItems !== undefined
            && summary.expectedTrackItems !== '';
        const expectedPlaylists = hasExpectedPlaylists
            ? Number(summary.expectedPlaylists)
            : NaN;
        const receivedPlaylists = Number(summary.receivedPlaylists);
        const expectedTrackItems = hasExpectedTrackItems
            ? Number(summary.expectedTrackItems)
            : NaN;
        const receivedTrackItems = Number(summary.receivedTrackItems);
        const trackCount = Number(summary.restorableTrackItems);
        const skippedTrackItems = Number(summary.skippedTrackItems || 0);
        let message = '';

        if (summary.error) {
            message = 'Spotify stopped while loading playlists'
                + (summary.error.status ? ' (HTTP ' + summary.error.status + ')' : '') + '.';
        } else if (!Number.isFinite(expectedPlaylists)) {
            message = 'Spotify did not report the total number of playlists.';
        } else if (receivedPlaylists !== expectedPlaylists) {
            message = 'Spotify returned only ' + receivedPlaylists + ' of '
                + expectedPlaylists + ' playlists.';
        } else if (!Number.isFinite(expectedTrackItems)) {
            message = 'Spotify did not report editable playlist item totals.';
        } else if (Number(summary.missingTrackTotals || 0) > 0) {
            message = 'Spotify did not report all editable playlist item totals.';
        } else if (receivedTrackItems !== expectedTrackItems) {
            message = 'Spotify returned only ' + receivedTrackItems + ' of '
                + expectedTrackItems + ' editable playlist items.';
        } else if (skippedTrackItems > 0) {
            message = 'Spotify returned ' + skippedTrackItems + ' playlist item'
                + (skippedTrackItems === 1 ? '' : 's')
                + ' without a restorable ID and URI.';
        }

        return {
            complete: message === '',
            playlistCount: Number.isFinite(receivedPlaylists) ? receivedPlaylists : 0,
            trackCount: Number.isFinite(trackCount) ? trackCount : 0,
            expectedTrackItems: Number.isFinite(expectedTrackItems) ? expectedTrackItems : null,
            skippedTrackItems,
            message,
        };
    }

    function createExportSnapshot(collections, likedSongsState, createdAt, playlistState) {
        if (likedSongsState.complete !== true) {
            throw new Error('Liked Songs have not been completely verified.');
        }
        if (playlistState && playlistState.complete !== true) {
            throw new Error('Playlist data has not been completely verified.');
        }
        const savedCount = Array.isArray(collections.saved) ? collections.saved.length : 0;
        if (savedCount !== Number(likedSongsState.count)) {
            throw new Error('Liked Songs count changed before export.');
        }
        const snapshot = JSON.parse(JSON.stringify(collections));
        snapshot.backup = {
            formatVersion: 3,
            createdAt: createdAt,
            likedSongs: {
                complete: likedSongsState.complete === true,
                count: likedSongsState.count,
                expectedTotal: likedSongsState.expectedTotal,
                skipped: likedSongsState.skipped,
                preservesAddedAt: true,
            },
            playlistItems: {
                archivesAddedAt: true,
                restoresAddedAt: false,
            },
        };
        if (playlistState) {
            snapshot.backup.playlists = {
                complete: true,
                count: playlistState.playlistCount,
                trackCount: playlistState.trackCount,
                expectedTrackItems: playlistState.expectedTrackItems,
                skippedTrackItems: playlistState.skippedTrackItems,
                preservesDescriptions: true,
                mergeKeepsExistingDescription: true,
            };
        }
        return snapshot;
    }

    function normalizeSavedTrackRecord(track) {
        if (!track || !track.id) return null;
        return {
            id: track.id,
            uri: track.uri || ('spotify:track:' + track.id),
            addedAt: track.addedAt || track.added_at || null,
        };
    }

    function chunk(items, size) {
        const result = [];
        for (let index = 0; index < items.length; index += size) {
            result.push(items.slice(index, index + size));
        }
        return result;
    }

    function createLikedSongRestoreBatches(imported, current) {
        const currentIds = new Set(
            (current || []).map(normalizeSavedTrackRecord).filter(Boolean).map(track => track.id),
        );
        const seenImportedIds = new Set();
        const timestamped = [];
        const library = [];

        (imported || []).forEach(function (value, sourceIndex) {
            const track = normalizeSavedTrackRecord(value);
            if (!track || seenImportedIds.has(track.id)) return;
            track.sourceIndex = sourceIndex;
            seenImportedIds.add(track.id);
            if (track.addedAt && Number.isFinite(Date.parse(track.addedAt))) timestamped.push(track);
            else if (!currentIds.has(track.id)) library.push(track);
        });

        timestamped.sort(function (left, right) {
            const dateDifference = Date.parse(left.addedAt) - Date.parse(right.addedAt);
            return dateDifference || right.sourceIndex - left.sourceIndex;
        });
        library.sort(function (left, right) {
            return right.sourceIndex - left.sourceIndex;
        });
        timestamped.forEach(track => { delete track.sourceIndex; });
        library.forEach(track => { delete track.sourceIndex; });

        return chunk(timestamped, 40).map(tracks => ({ mode: 'timestamped', tracks }))
            .concat(chunk(library, 40).map(tracks => ({ mode: 'library', tracks })));
    }

    function assessLikedSongsRestore(imported, current) {
        const expected = [];
        const expectedIds = new Set();
        (imported || []).forEach(function (value) {
            const track = normalizeSavedTrackRecord(value);
            if (!track || expectedIds.has(track.id)) return;
            expectedIds.add(track.id);
            expected.push(track.id);
        });

        const actual = [];
        const presentIds = new Set();
        (current || []).forEach(function (value) {
            const track = normalizeSavedTrackRecord(value);
            if (!track || !expectedIds.has(track.id) || presentIds.has(track.id)) return;
            presentIds.add(track.id);
            actual.push(track.id);
        });
        const expectedPresent = expected.filter(id => presentIds.has(id));
        let orderMismatch = 0;
        expectedPresent.forEach(function (id, index) {
            if (actual[index] !== id) orderMismatch += 1;
        });

        return {
            expectedCount: expected.length,
            presentCount: presentIds.size,
            missing: expected.length - presentIds.size,
            orderVerified: expected.length === presentIds.size && orderMismatch === 0,
            orderMismatch,
        };
    }

    function createLikedSongVerificationBatches(savedTracks) {
        const seen = new Set();
        const uris = [];
        (savedTracks || []).forEach(function (value) {
            const track = normalizeSavedTrackRecord(value);
            if (!track || track.uri.indexOf('spotify:local:') === 0 || seen.has(track.uri)) return;
            seen.add(track.uri);
            uris.push(track.uri);
        });
        return chunk(uris, 40);
    }

    function playlistStorageKey(playlist, stored) {
        const base = playlist.id ? 'id:' + playlist.id : 'name:' + playlist.name;
        let key = base;
        let suffix = 2;
        while (Object.prototype.hasOwnProperty.call(stored, key)) {
            key = base + ':' + suffix;
            suffix += 1;
        }
        return key;
    }

    function findPlaylistByName(playlists, name) {
        const keys = Object.keys(playlists || {});
        for (let index = 0; index < keys.length; index += 1) {
            const playlist = playlists[keys[index]];
            if (playlist && (playlist.name || keys[index]) === name) return playlist;
        }
        return null;
    }

    function trackUri(value) {
        return typeof value === 'string' ? value : value && value.uri;
    }

    function missingPlaylistTrackUris(imported, current) {
        const seen = new Set((current || []).map(trackUri).filter(Boolean));
        const missing = [];
        (imported || []).forEach(function (value) {
            const uri = trackUri(value);
            if (!uri || uri.indexOf('spotify:local:') === 0 || seen.has(uri)) return;
            seen.add(uri);
            missing.push(uri);
        });
        return missing;
    }

    function validateImportSnapshot(snapshot) {
        const likedSongCount = Array.isArray(snapshot && snapshot.saved) ? snapshot.saved.length : 0;
        const manifest = snapshot && snapshot.backup && snapshot.backup.likedSongs;
        const playlistManifest = snapshot && snapshot.backup && snapshot.backup.playlists;
        const editablePlaylists = snapshot && snapshot.playlists ? Object.values(snapshot.playlists) : [];
        const followedPlaylistCount = Array.isArray(snapshot && snapshot.followedPlaylists)
            ? snapshot.followedPlaylists.length
            : 0;
        const playlistCount = editablePlaylists.length + followedPlaylistCount;
        const playlistTrackCount = editablePlaylists.reduce(function (total, playlist) {
            return total + (Array.isArray(playlist && playlist.tracks) ? playlist.tracks.length : 0);
        }, 0);
        if (playlistManifest) {
            if (playlistManifest.complete !== true) {
                return {
                    valid: false,
                    verified: false,
                    likedSongCount,
                    message: 'This backup marks its playlist collection as incomplete.',
                };
            }
            if (Number(playlistManifest.count) !== playlistCount) {
                return {
                    valid: false,
                    verified: false,
                    likedSongCount,
                    message: 'This backup declares ' + playlistManifest.count
                        + ' playlists but contains ' + playlistCount + '.',
                };
            }
            if (Number(playlistManifest.trackCount) !== playlistTrackCount) {
                return {
                    valid: false,
                    verified: false,
                    likedSongCount,
                    message: 'This backup declares ' + playlistManifest.trackCount
                        + ' editable playlist tracks but contains ' + playlistTrackCount + '.',
                };
            }
        }
        if (!manifest) {
            return {
                valid: true,
                verified: false,
                likedSongCount,
                message: 'Legacy backup: Liked Songs completeness cannot be verified.',
            };
        }
        if (manifest.complete !== true) {
            return {
                valid: false,
                verified: false,
                likedSongCount,
                message: 'This backup marks its Liked Songs collection as incomplete.',
            };
        }
        if (Number(manifest.count) !== likedSongCount) {
            return {
                valid: false,
                verified: false,
                likedSongCount,
                message: 'This backup declares ' + manifest.count
                    + ' Liked Songs but contains ' + likedSongCount + '.',
            };
        }
        if (manifest.expectedTotal !== undefined
            && Number(manifest.expectedTotal) !== likedSongCount) {
            return {
                valid: false,
                verified: false,
                likedSongCount,
                message: 'This backup expected ' + manifest.expectedTotal
                    + ' Liked Songs but contains ' + likedSongCount + '.',
            };
        }
        return { valid: true, verified: true, likedSongCount, message: '' };
    }

    function shouldRetrySpotifyStatus(status, attempts) {
        return attempts < 3 && (status === 429 || status >= 500);
    }

    function shouldRetrySpotifyPostStatus(status, attempts) {
        return attempts < 3 && status === 429;
    }

    function queuePlaylistTrack(queue, playlistId, uri) {
        if (!playlistId || !uri || uri.indexOf('spotify:local:') === 0) return false;
        const alreadyQueued = queue.some(function (request) {
            return request.playlistId === playlistId && request.uri === uri;
        });
        if (alreadyQueued) return false;
        queue.push({playlistId, uri, attempts: 0});
        return true;
    }

    return {
        assessLikedSongsRestore,
        assessLikedSongsLoad,
        assessPlaylistLibraryLoad,
        createLikedSongRestoreBatches,
        createLikedSongVerificationBatches,
        createExportSnapshot,
        findPlaylistByName,
        missingPlaylistTrackUris,
        normalizeSavedTrackRecord,
        playlistStorageKey,
        playlistItemFromSpotify,
        playlistMetadataFromSpotify,
        queuePlaylistTrack,
        reportedSpotifyTotal,
        savedTrackFromSpotify,
        shouldRetrySpotifyPostStatus,
        shouldRetrySpotifyStatus,
        validateImportSnapshot,
    };
});
