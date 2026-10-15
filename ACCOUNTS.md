# Room 905 regular accounts · v3.0

Implemented: username/password registration, sign-in, seven-day browser sessions, sign-out, six selectable recovery badges, profile editing and password-confirmed account deletion. The username and avatar are verified on the server when joining a crew. Badges appear in the roster and set the in-game crew suit color. Guests continue to use callsigns without registering. No Google sign-in, email collection, password recovery or score history is included yet.

## Enable on Render
1. Upload this update and deploy. Build command: npm install. Start command: npm start.
2. Create a PostgreSQL database in the same Render region as the game (currently Oregon). Review the current database price and retention terms before choosing a plan.
3. In that database's Connect menu, copy its Internal Database URL. Do not share this URL, paste it into chat, or commit it to GitHub.
4. In the game web service's Environment page, add DATABASE_URL with that URL as its value. Save and redeploy.
5. The game creates its two namespaced account tables on first use. Open SIGN IN, choose a badge and create an account. Test sign-out/sign-in, avatar saving, a second device and persistence after a service restart.

No database URL: registration is clearly marked as awaiting setup, and guest multiplayer still works. Database outages return an error rather than pretending a profile was saved. Users with a saved session need account storage available to authenticate their next room entry.

For local accounts, point DATABASE_URL at your own local PostgreSQL instance. For remote external connections, use the provider's documented TLS connection parameters and certificate requirements. Do not disable TLS certificate verification.

## Security and data
Passwords use asynchronous scrypt with independent random salts; plaintext passwords are never stored. Sessions use random 256-bit tokens in HttpOnly, SameSite=Lax cookies; only token hashes are stored in the database. HTTPS deployments set Secure cookies. State-changing account requests require the application's exact Origin. Account endpoints have request and expensive-hash concurrency limits. Database queries are parameterized. Normal accounts never grant access to the developer console.

Account data: username, password hash, chosen badge, creation timestamp, session hash and expiration timestamp. Public players see only a username/callsign and avatar. Account deletion cascades to saved sessions; it does not retract previously displayed crew messages. No email is collected, so there is no forgotten-password recovery. Explain this to players before they register. Back up your database according to your provider's policy.

Changing account or avatar requires leaving the current crew; the client reconnects to bind the current cookie to its next room join. Existing game rounds do not rely on account access. Do not put database credentials, DEV_PASSWORD or private setup files in public source.

## Verification
HTTP/Socket.io integration tests verify registration, password checks, token revocation, deletion, origin checks, rate limits, account-to-room identity, avatar validation and guest fallback using an injected test store. SQL deployment still needs testing against your configured PostgreSQL service. The tests do not claim to verify a live Render database.

References:
https://render.com/docs/postgresql-creating-connecting
https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback

## v3.3 Friends data
The existing DATABASE_URL is used for the new room905_friends table, added automatically. It stores two usernames, the requester and pending/accepted status. Both must accept a friendship before invitations are permitted. Removing a friend deletes the relationship; deleting an account cascades to friendship rows. Invitation tokens and recipient/lobby information live in process memory for two minutes, with no offline queue. Profiles remain private except usernames/avatars shared in friend lists and rooms. See UPDATE.md for deployment and use.

## v3.6 saved recovery codes
New accounts receive one random 192-bit recovery code, displayed for saving. Existing accounts can generate/replace one from Profile using their current password. Only a SHA-256 hash is stored in the new recovery_hash column, added automatically. Forgot password accepts the username, saved code and a confirmed new password, clears the code and revokes all stored sessions atomically. Sign in normally afterward and generate a replacement recovery code. There is no email verification/recovery; if neither password nor saved code is available, the system cannot prove account ownership. Username, callsign, school information or a claimed identity are not sufficient recovery evidence. Codes must be saved privately, not shared in screenshots or room chat.

For future email recovery, use verified email ownership and a transactional email provider over HTTPS with expiring single-use reset links, rate limits and session invalidation. Do not use security questions or reset solely based on a username. Reference: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html


## v4.0 sessions and progression

Thirty-day HttpOnly SameSite=Lax sessions renew on account GET; the same browser must retain site cookies. Opening another browser/private window or clearing site data requires login. Passwords and session tokens are never stored in localStorage. Mobile resume reloads account state and temporary storage failures retry three times without clearing the last known profile. Existing valid sessions renew; already-expired sessions require one fresh login.

Postgres automatically adds xp, frame and title fields and a unique per-round award ledger. A completed eligible team shift earns 50 base XP, up to 150 cargo XP, and 100 bonus XP on success. Shifts shorter than 30 seconds and developer-controlled rounds do not award XP. All signed-in roles earn equally, capped at level 20 (4750 XP); every 250 XP advances a level. Frames and titles are cosmetic only and are checked on the server when equipping.

The exact normalized usernames toninextdoor, angelnextdoor and steve1234 are max-progression testing profiles. Existing passwords are preserved. Missing accounts must be registered normally; the code does not precreate accounts with passwords. Max progression never grants developer-console access. Remove names from progression.js TEST_USERS and the migration UPDATE when retiring testing profiles.


## v4.1 profile editor and photo review

Optional bios are 160 characters, stored in PostgreSQL and shown to the crew. Server code filters block common profanity, explicit abusive phrases, links and contact details. These limited filters do not detect every language or every harmful intent.

Profile photos are cropped in-browser and decoded/re-encoded to a 256px JPEG with sharp on the server, stripping metadata. Only still JPEG/PNG/WebP input is accepted, with input size/pixel/concurrency limits. One pending and one approved image per account are stored in PostgreSQL, not Render's ephemeral disk. Pending images are accessible only through the owner's authenticated preview and the authenticated developer review queue. Approved image URLs are public; removing an image or deleting the account makes the old URL unavailable.

To approve: open the existing developer console, sign in with DEV_USERNAME/DEV_PASSWORD, choose Load pending photos, then approve or reject each image. Review for nudity, violence, hate symbols, personal information and rights to the image. OG account names and founder crowns never grant reviewer privileges. No AI moderation provider or API key is configured.
