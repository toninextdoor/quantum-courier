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
Passwords use asynchronous scrypt with independent random salts; plaintext passwords are never stored. Sessions use random 256-bit tokens in HttpOnly, SameSite=Strict cookies; only token hashes are stored in the database. HTTPS deployments set Secure cookies. State-changing account requests require the application's exact Origin. Account endpoints have request and expensive-hash concurrency limits. Database queries are parameterized. Normal accounts never grant access to the developer console.

Account data: username, password hash, chosen badge, creation timestamp, session hash and expiration timestamp. Public players see only a username/callsign and avatar. Account deletion cascades to saved sessions; it does not retract previously displayed crew messages. No email is collected, so there is no forgotten-password recovery. Explain this to players before they register. Back up your database according to your provider's policy.

Changing account or avatar requires leaving the current crew; the client reconnects to bind the current cookie to its next room join. Existing game rounds do not rely on account access. Do not put database credentials, DEV_PASSWORD or private setup files in public source.

## Verification
HTTP/Socket.io integration tests verify registration, password checks, token revocation, deletion, origin checks, rate limits, account-to-room identity, avatar validation and guest fallback using an injected test store. SQL deployment still needs testing against your configured PostgreSQL service. The tests do not claim to verify a live Render database.

References:
https://render.com/docs/postgresql-creating-connecting
https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback
