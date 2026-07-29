# MySpotBackup

MySpotBackup exports and restores Spotify playlists and saved library items. It is
a maintained continuation of the discontinued
[SpotMyBackup](https://github.com/secuvera/SpotMyBackup).

The app runs locally and uses Spotify's Authorization Code with PKCE flow. It
does not need a Spotify client secret. Authorization codes and access tokens are
handled only by the local Node.js process and browser session.

## Requirements

- Node.js 18 or newer
- A Spotify developer app
- Spotify Premium on the developer app owner's account (required by Spotify for
  Development Mode apps)

## Set up Spotify

1. Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/)
   and create an app.
2. In the app settings, set:
   - Website: `http://127.0.0.1:8080`
   - Redirect URI: `http://127.0.0.1:8080/callback`
3. Add every Spotify account that will use the tool under User Management.
4. Copy the app's Client ID. A client secret is not needed.

The redirect URI must match exactly. Spotify does not allow `localhost`; use the
literal loopback address `127.0.0.1`.

## Install and run

```powershell
git clone https://github.com/Hugelevin/MySpotBackup.git
cd MySpotBackup
npm install
Copy-Item public/config.example.js public/config.js
```

Open `public/config.js`, replace `yourclientid` with the Spotify Client ID, and
then run:

```powershell
npm start
```

Open <http://127.0.0.1:8080>, select **Login with Spotify**, and approve access.

## Back up and restore

1. Log in to the source Spotify account.
2. Select **Export** and save the JSON backup.
3. Open MySpotBackup in a private/incognito window.
4. Log in to the destination Spotify account.
5. Select **Import** and choose the JSON backup.

Spotify's Development Mode API does not expose the contents of playlists that
the user does not own or collaborate on. MySpotBackup preserves those playlists
by following them on restore, but it cannot copy their individual tracks.
Local-file tracks and original "date added" metadata also cannot be restored.

## Troubleshooting

### `response_type must be code`

This version always starts authentication through its local `/login` route,
which sends Spotify `response_type=code` with PKCE. Make sure:

- you opened `http://127.0.0.1:8080`, not an older hosted copy;
- the Spotify dashboard Redirect URI is exactly
  `http://127.0.0.1:8080/callback`;
- `public/config.js` has the same callback URI; and
- you restarted `npm start` after changing the config.

Run `npm test` to verify the complete local OAuth redirect and callback contract.

### Missing `public/config.js`

Copy `public/config.example.js` to `public/config.js` and add your Client ID.
The real config is ignored by Git so it will not be committed accidentally.

### Spotify returns `403`

Confirm the account is listed in the app's User Management and that the
developer app owner still has Spotify Premium.

## Development

```powershell
npm test
npm audit --omit=dev
```

The tests cover the OAuth `response_type=code` redirect, PKCE verifier pairing,
one-time state validation, redirect URI rules, and Spotify's current generic
library endpoints.

## License

GPL-2.0. See [LICENSE.md](LICENSE.md).
