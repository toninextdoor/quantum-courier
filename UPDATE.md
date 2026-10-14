# Room 905 v3.3.0 · Friends and deployment alignment

Upload the FULL ZIP contents to the repository root, preserving public/assets. New required file: friends.js. Commit and choose Render Manual Deploy > Deploy latest commit. Keep npm ci / npm start and your existing DATABASE_URL. The database automatically adds its friendship table without deleting accounts. After deployment, /health must report 3.3.0; reload every browser.

Live diagnosis before this update: server reported 3.2.0; served HTML still contained the lobby artwork and lacked the disclosure. Those updates had not reached Render. This package removes the lobby artwork and displays a disclosure on every page load, before the flipbook. Options > Disclosure reopens it.

Options > Friends requires an account. Send an exact-username request; the recipient accepts it. Both can remove the friendship. Create/join a lobby, then invite an accepted friend. Recipient must be signed in with the game open. Invitations last two minutes, are private to the recipient, do not reserve a slot, and still enforce room capacity/phase. Leave a current crew before accepting another lobby. Offline invitations are not queued. Friends persist in PostgreSQL; live invitations are temporary and disappear on server restart.

Friends tests verify consent, sender/recipient authorization, invitations, room joining and removal. The Guardian replay test now waits for the new round snapshot to avoid confusing a queued old snapshot with the current round.

Public bio details still need to be supplied by the creator; no unseen personal details were added.
