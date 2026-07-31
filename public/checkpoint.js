(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.MySpotCheckpoint = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const DATABASE_NAME = 'myspotbackup-checkpoints';
    const STORE_NAME = 'playlists';
    const DATABASE_VERSION = 1;

    function checkpointKey(accountId, playlistId) {
        return String(accountId || '') + ':' + String(playlistId || '');
    }

    function isReusablePlaylistCheckpoint(
        record,
        accountId,
        playlistId,
        snapshotId,
        expectedTotal
    ) {
        return Boolean(
            record
            && snapshotId
            && record.accountId === accountId
            && record.playlistId === playlistId
            && record.snapshotId === snapshotId
            && Number(record.expectedTotal) === Number(expectedTotal)
            && Number(record.receivedItems) === Number(expectedTotal)
            && Array.isArray(record.tracks)
        );
    }

    function openDatabase() {
        return new Promise(function (resolve, reject) {
            if (!root.indexedDB) {
                resolve(null);
                return;
            }
            const request = root.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
            request.onupgradeneeded = function () {
                if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                    request.result.createObjectStore(STORE_NAME, {keyPath: 'key'});
                }
            };
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () { reject(request.error); };
        });
    }

    function getPlaylist(accountId, playlistId, snapshotId, expectedTotal) {
        return openDatabase().then(function (database) {
            if (!database) return null;
            return new Promise(function (resolve) {
                const transaction = database.transaction(STORE_NAME, 'readonly');
                const request = transaction.objectStore(STORE_NAME).get(
                    checkpointKey(accountId, playlistId)
                );
                request.onsuccess = function () {
                    resolve(isReusablePlaylistCheckpoint(
                        request.result,
                        accountId,
                        playlistId,
                        snapshotId,
                        expectedTotal
                    ) ? request.result : null);
                };
                request.onerror = function () { resolve(null); };
                transaction.oncomplete = function () { database.close(); };
            });
        }).catch(function () { return null; });
    }

    function putPlaylist(record) {
        return openDatabase().then(function (database) {
            if (!database) return false;
            return new Promise(function (resolve) {
                const transaction = database.transaction(STORE_NAME, 'readwrite');
                transaction.objectStore(STORE_NAME).put(Object.assign({}, record, {
                    key: checkpointKey(record.accountId, record.playlistId),
                    savedAt: new Date().toISOString()
                }));
                transaction.oncomplete = function () {
                    database.close();
                    resolve(true);
                };
                transaction.onerror = function () {
                    database.close();
                    resolve(false);
                };
            });
        }).catch(function () { return false; });
    }

    return {
        checkpointKey,
        getPlaylist,
        isReusablePlaylistCheckpoint,
        putPlaylist,
    };
});
