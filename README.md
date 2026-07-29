# MySpotBackup

MySpotBackup exports and restores Spotify playlists and saved library items. It
is a maintained continuation of the discontinued
[SpotMyBackup](https://github.com/secuvera/SpotMyBackup).

The app is hosted on GitHub Pages and uses Spotify's browser-safe Authorization
Code with PKCE flow. It does not need a server or Spotify Client Secret.

## Use the hosted app

Open <https://hugelevin.github.io/MySpotBackup/>.

Before the first login, create a Spotify developer app:

1. Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/).
2. Select **Create app**.
3. Enter any name and description, select **Web API**, accept the terms, and
   create the app.
4. In **Settings**, add:
   - Website: `https://hugelevin.github.io/MySpotBackup/`
   - Redirect URI:
     `https://hugelevin.github.io/MySpotBackup/callback.html`
5. Under **User Management**, add every Spotify account that will use the tool.
6. Copy the **Client ID** shown in the app settings. Do not copy or share the
   Client Secret.
7. Return to MySpotBackup, paste the Client ID into **Spotify Client ID**, and
   select **Save**.
8. Select **Login with Spotify**.

The Client ID is public application metadata. MySpotBackup stores it locally in
your browser. The temporary access token is kept only in that browser tab's
session storage.

Spotify requires the redirect URI to match exactly, including capitalization,
path, and trailing characters.

## Back up and restore

1. Log in to the source Spotify account.
2. Select **Export** and save the JSON backup.
3. Select **Switch account**. On Spotify's authorization page, choose the
   destination account; if Spotify still shows the source account, use its
   **Not you?** or sign-out option first.
4. Confirm that MySpotBackup displays the destination account as the import
   target.
5. Select **Import**, choose the JSON backup, and confirm the target again.

The restore sends Liked Songs from oldest to newest, requests the original
`added_at` timestamps, and reloads the destination library afterward. The
completion card reports Liked Song presence and Recently Added order
separately. Playlist descriptions and public/private status are restored when a
new playlist is created. An existing exact-name playlist is merged without
overwriting its description.

Spotify's Development Mode API does not expose the contents of playlists that
the user does not own or collaborate on. MySpotBackup preserves those playlists
by following them on restore, but it cannot copy their individual tracks.
Local-file or unavailable tracks cannot be restored. Liked Song dates can be
restored when Spotify accepts `timestamped_ids`; Spotify orders those timestamps
at minute-level granularity, so same-minute ties can differ. Playlist item
dates are archived in the JSON but Spotify's playlist add endpoint does not
accept historical dates.

## Run locally

Add this second Redirect URI to the same Spotify app:

`http://127.0.0.1:8080/callback.html`

Then run:

```powershell
git clone https://github.com/Hugelevin/MySpotBackup.git
cd MySpotBackup
npm install
npm start
```

Open <http://127.0.0.1:8080> and set the Client ID in the page. Spotify does not
allow `localhost`; use the literal loopback address `127.0.0.1`.

## Troubleshooting

### `response_type must be code`

This version always sends `response_type=code` with an S256 PKCE challenge.
Confirm that you are using the hosted URL above, then clear the saved Client ID
by saving the Client ID from the correct Spotify app again.

### `INVALID_CLIENT` or invalid Client ID

Use the Client ID from **Spotify Developer Dashboard → your app → Settings**.
The Client Secret is a different value and must not be entered.

### Invalid redirect URI

The Spotify dashboard entry must be exactly:

`https://hugelevin.github.io/MySpotBackup/callback.html`

### Spotify returns `403`

Confirm the Spotify account is listed under the app's User Management and that
the developer app owner has Spotify Premium.

## Development and deployment

```powershell
npm test
npm audit --omit=dev
```

Pushes to `main` run the test suite and deploy the `public` directory through
GitHub Actions and GitHub Pages.

## License

GPL-2.0. See [LICENSE.md](LICENSE.md).
