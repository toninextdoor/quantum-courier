# Room 905

An original asymmetric multiplayer 3D salvage game for 2–4 players. The Navigator sits in a 3D mission-command trailer with a translucent hotel suite hologram; the other players explore in first person, retrieve fragile valuables, and depend on the Navigator's guidance.

## Run locally

Requires Node.js 20+ and a WebGL-capable browser.

```sh
npm ci
npm start
```

Open http://localhost:3000. For another device on your LAN, use http://YOUR-COMPUTER-IP:3000. To play from different locations, deploy the entire Node app as a Web Service, following UPDATE.md. `PORT` is supplied by the hosting provider or defaults to 3000.

## Randomized shifts and parkour (v2.2)

Every launch generates new hotel suite partitions, cargo locations, breach positions and Sentinel patrol points. The seed is shown in the HUD. Generation checks that floor cells are connected, and ordinary cargo is selected from the breach-free area reachable from extraction. The entrance and parkour area are reserved. All ordinary cargo is on the floor and provides more than enough value for the $600 quota.

An optional four-platform route changes direction and position between rounds. Use Space or the touch JUMP button, release, then press again for each jump. The highest platform contains a $450 SKYLINE ARTIFACT. Jumping, gravity, collision, landings and cargo pickup height are decided on the server. Cargo cannot be grabbed from the floor beneath the final platform. Carry it down and back to extraction to score its remaining value. Falling off returns you to the floor; the course does not add a separate fall penalty.

## Mission rules

- The first player is the Navigator. Everyone else is a Scavenger (up to three).
- Extract $600 worth of valuables within 3 minutes to win.
- Navigator: the mission-command trailer contains a real miniature 3D hotel suite hologram showing crew, valuables, invisible breaches and the Sentinel. FOCUS HOLOGRAM switches to a closer perspective; WIDE TRAILER VIEW returns to the desk. Click an open tile on the hologram to place a 12-second waypoint. Quick commands last 4.5 seconds and describe movements relative to the Scavenger's view.
- Scavenger: the bodycam cannot detect breaches or the Sentinel, cargo appears only within grabbing range (1.8m), and fog limits distant visibility. Depend on the Navigator for safe routing, warnings and target locations. Ordinary walls remain visible for basic movement. WASD moves. Mouse capture or left/right arrows turn your view. E grabs the nearest available valuable within 1.8m; Keep tapping E at least every 2 seconds to refresh grip; Q drops it. On mobile, use the analog joystick, swipe the scene to look, and tap GRAB / GRIP and use DROP to release it. Carry valuable objects into the green extraction pad to deposit automatically.
- Hold Shift or RUN to sprint. Cargo slows you down. Sprinting into walls damages cargo by 12 condition points (at most once per 1.1 seconds). Dropping damages it by 8 points. Sale value is rounded base value × condition / 100. Condition cannot fall below 10%.
- Breaches appear only on the Navigator hologram. They return you to extraction, subtract 5 seconds, drop held cargo, and damage it by 20 condition points.
- The Sentinel is invisible to Scavengers and has no position marker; proximity produces a red tint and heartbeat. Only the Navigator can track it. It patrols through actual doorways. It can spot players within 7.5m with unobstructed sight, or hear unloaded sprinting players within 10m. A signal interruption returns you to extraction, subtracts 10 seconds, drops cargo and damages it by 35 condition points. Extraction is safe; respawns have 3 seconds of protection.
- Built-in crew chat, Navigator commands and waypoint bearings work without a voice call. Talking aloud or using a separate voice call is also useful. Built-in microphone/voice chat is not included.
- The host can launch a new shift after winning or losing. If anyone disconnects mid-shift, the crew returns to the lobby and roles are reassigned. Reconnecting players must rejoin with the code.

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move | WASD; up/down arrows also move | Analog joystick |
| Look | Click Enter first-person view, then mouse; or left/right arrows | Swipe the 3D view |
| Grab / refresh grip | E (tap every 2 seconds) | GRAB / GRIP |
| Drop deliberately | Q | DROP |
| Jump | Space (release between jumps) | JUMP button |
| Sprint | Hold Shift | Hold RUN |
| Release mouse | Esc | Not required |
| Guidance | Navigator clicks floor / command buttons | Navigator taps floor / command buttons |

Sound starts off. Toggle SOUND ON for pickup, damage, delivery, footstep and threat sounds. Graphics use procedural geometry and textures, with no external game assets or CDN requests.

## Hosting

Deploy a single Node instance with long-lived WebSocket support. The browser assets and Three.js module are served by Express from the same origin. Render settings: Node, blank root directory, build `npm ci`, start `npm start`. See UPDATE.md for uploading replacements to an existing repository and manually deploying.

Rooms live in memory. Empty rooms are removed; restarting, sleeping or redeploying the server clears all rooms. There are no accounts, persistent scores or distributed instances. Do not scale to multiple instances without implementing shared room state and compatible Socket.io routing.

## Validation

```sh
npm test
```

The tests use six real Socket.io clients to check room codes, capacity, role assignment, host permissions, snapshot visibility, input authority, stale-input expiry, guidance restrictions, pickup/drop, damage, extraction values, breach/catch penalties, win/loss, replay, disconnect cleanup and asset serving. Navigation tests verify a walkable path from extraction to every valuable and wall sight blocking.

Current v4.0 checks: 26 automated tests cover multiplayer rules, account sessions and restoration with a test store, XP persistence/deduplication, gated cosmetics and joystick release/cancellation. The current phone layout and live PostgreSQL migration still require deployment and physical-device testing.

Additional v2.2 checks cover 200 reproducible seeds with 200 distinct wall layouts, safe floor-cargo access, patrol reachability, and an integration test that jumps up every platform using actual movement inputs, lands, retrieves premium cargo, extracts it, and verifies a new map on replay.

## Technology

Node.js, Express, Socket.io, Three.js, vanilla HTML/CSS and Web Audio. The server simulates movement, wall collision, cargo condition, scoring, enemy navigation and the timer at a 20 Hz fixed step. Clients interpolate positions and render views; the server never accepts client-provided coordinates or scores. Scavengers receive only cargo within 1.8m with an unobstructed path (plus their held cargo), no breach locations, and no Sentinel data. Navigator receives the full tactical state. The bodycam has short visibility; mission command guides routes around unseen threats. Input expires after 350ms without updates. Names/messages use text nodes, and room actions, interaction distance, roles and message rates are checked server-side.

### Graphics performance

Rendering uses a maximum 1x pixel density and batches repeated static walls and trim. Click GRAPHICS NORMAL to select GRAPHICS LOW on slower devices; it reduces render resolution to 65%. The server still simulates and broadcasts at 20 Hz in either mode. Hidden tabs skip rendering; finished rounds render at most four times per second.

### Sentinel ambience and parkour safety

Scavengers receive a coarse proximity intensity, never Sentinel coordinates. A red vignette grows with proximity, and SOUND ON enables a faster/louder low heartbeat. Warnings remain visible near extraction and while respawn protection is active. Sound starts enabled and unlocks on a player click/key. A quiet hotel suite drone plays during the shift. The protected developer console previews effects. The optional four-step course varies position, orientation, step size and rise each shift. Steps touch; the server moves overlapping players to the nearest clear side instead of allowing them to become stuck inside boxes. Release Space/JUMP before each new jump.

### Developer console

Set DEV_USERNAME and DEV_PASSWORD (12+ characters) on the server; access is disabled without both. Ten sound-button clicks reveal sign-in. Server-verified sessions expire after 30 minutes or disconnect. Login is rate limited. Controls are restricted to the signed-in socket’s current room: individual/all-player effect previews, Sentinel freeze/placement, extraction/parkour relocation, premium cargo, protection, timer extension, simulated breach/catch resets, cargo damage, win/loss and replay. Regular player accounts are a future feature. Do not commit credentials.

Audio debugging: local console tests play on the developer device, including Navigator. Room effect buttons play on selected Scavengers. Output is metered after the volume control; an audio context can be running while device or browser output is muted.

## Intro and browser readiness (v2.6)

A skippable four-page illustrated hotel field guide appears after disclosure at startup. Next/Back, page dots, keyboard arrows and Escape provide navigation. Enter on the last page or Skip dismisses it and plays an original layered mystical entrance chime when sound is enabled. HOW TO PLAY reopens it. The same-time local readiness check renders a sample scene, estimates FPS at progressively lower pixel densities, and recommends Normal, Low or Minimal. No performance results or hardware identifiers are uploaded. WebGL failure blocks room creation/join until a successful rerun. RUN CHECK works between rounds, USE RECOMMENDED restores automatic mode, and the graphics button cycles manual settings. Automatic mode can lower quality after sustained low frame rate; manual choices remain under the player’s control. The check is an estimate and is not a substitute for actual multiplayer playtesting.

Hotel staff have authorized recovery of abandoned property. The Sentinel is an abstract signal beacon; encounters cause sensor resets, timer and property-condition penalties, never injury or attacks.

Signal interruptions now display a private cause-and-penalty card for 1.2 seconds before controls return. Players are returned to the hallway and cargo is dropped immediately on the server; movement and grabbing are disabled during the brief reconnect countdown. Other players keep playing. No death or injury is depicted.

V2.7: the intro is now a four-page illustrated mission flipbook. Next/Back, page dots, keyboard arrows and Skip work; HOW TO PLAY reopens it from the lobby footer. The browser check still runs in the background. USE RECOMMENDED collapses the readiness panel, and BROWSER SETTINGS reopens it.

V2.8: tap E / GRIP at least every 2 seconds while carrying. Q / DROP releases deliberately. Grip expiration drops property and costs 8% condition; a server-driven countdown is shown on the carrying panel. Recovery area uses a brass luggage trolley, green carpet and rectangular corner markings instead of the old circle. Walls have wood wainscot, chair rails, flush sconces and framed art; parkour platforms use padded luggage/ottoman finishes. Decorative geometry does not create new obstacles. Audio is unchanged in this update.

## v2.9: creator notes and recovery display
The footer ABOUT panel explains the game and its development. The attached bird emblem is used in the header and favicon; confirm artwork rights before submitting. Trolley bundles show quota progress, filling four levels at $600 with final-delivery excess beside the trolley. See ACCOUNTS.md for optional Google account setup.

## v3.0 optional accounts
Username/password accounts save one of six recovery badges. Add DATABASE_URL for persistent PostgreSQL storage; read ACCOUNTS.md. Guests can play without a database. Saved avatars appear in the lobby and color the crew suits. Regular accounts are separate from developer access.

## v3.1 UI
Dark/light themes, top navigation, player identity next to ONLINE, browser settings under the brand and a simplified footer/briefing. The supplied M.V.M key/wave logo replaces the bird. Theme preference persists locally; game visibility and physics do not change. Real leaderboards are not implemented.

## v3.1.1 deployment repair
Rebuilt dependency lock, Node 24.x, independent GTA-inspired hotel identity. On Render use npm ci and npm start. Replace both package files from this package. Never globally replace versions in package-lock.json.

## v3.1.2 layout
Options beside ONLINE consolidates navigation and preferences. The footer sits at the bottom of short pages and follows content on longer pages. Hotel art has no placeholder caption.

## v3.2 Guardian
The second player becomes Guardian in crews of three or four. F / SIGNAL PULSE pauses the Sentinel for 3 seconds within 6m and line of sight; recharge takes 12 seconds. Signal gaps remain Navigator-only. Two-player mode stays Navigator + Recovery.

## v3.2.1 deployment alignment and disclosures
The full lobby artwork block is removed. A project disclosure precedes the flipbook once per tab. Client/server mismatch blocks room entry. Verify /health reports 3.2.1 and reload all players before testing Guardian.

## v3.3 Friends
Options > Friends supports exact-username requests and mutual acceptance, then private online lobby invitations. Friend relationships persist in the existing PostgreSQL database. Invitations last two minutes and are not stored across restarts. Upload the new friends.js along with the full update; verify /health is 3.3.0. The disclosure appears each page load, and the lobby artwork block is removed.

## v3.3.1 onboarding
Disclosure, briefing and lobby appear in that order without a lobby flash. Shorter role explanations and internally scrolling pages keep book navigation visible on small screens.

## Verified v3.3.2 package
Use room-905-v3.3.2.zip. Its files are directly at the archive root; verify BUILD.txt and package.json before uploading. /health must report 3.3.2 and room905-3.3.2-startup-fix after deployment.

## v3.3.3 briefing placement
Outer onboarding layout explicitly uses one centered column; the book retains its two-page design. Use the uniquely named room-905-v3.3.3.zip.

## v3.4 difficulty and Friends presence
The lobby creator selects Easy, Normal or Hard; settings are server-authoritative and fixed for the round. A brief launch notice announces the difficulty. Friends cards show active game-session presence and sort online friends first.

## v3.5 electromagnetic hazards
EM Flux Faults affect players and the Sentinel security automaton. The robot reboots for four seconds on entry, allowing coordinated lure tactics. Navigator sees fault locations; Guardian sees the robot but not the faults. The robot uses an original articulated biped model with a blue disabled status.

## v3.6 polish
Failed premium parkour descents respawn the same damaged artifact. Recovery codes support password resets without email; existing users must generate a code before losing access. Baseline server chat moderation, host mutes and distinct Navigator audio cues improve communication. Read UPDATE.md and ACCOUNTS.md.

## v3.7 chosen roles
Select a role before entry. Slots are reserved on the server; unavailable roles produce a clear error. Interactive lobby cards show avatars, names, roles, host/self markers and vacancies. Roles can change before launch and persist through replay. Host and Navigator are independent.

See UPDATE.md for v4.0 progression, joystick and testing-profile details.


## v4.1 profile photos and moderation

Profile now includes a live bio editor and photo preview. Photos remain private until approved through the existing developer console; use Load pending photos to review. Approved photos appear in the header, profile, crew lobby and Friends. Removing a photo returns to the preset avatar. Existing DATABASE_URL and developer credentials are used; migrations are automatic. npm ci now installs sharp for validated image decoding/re-encoding. See ACCOUNTS.md for retention and access details.


## v4.2 profile access, crop tools and menu audio

Click your top-right username to open the full-screen profile editor. Upload a photo, drag the preview or use pan sliders, zoom, rotate, mirror or reset before submitting. The existing moderator review still applies to the final edited crop. Original synthesized menu clicks are limited to menus outside gameplay; the briefing exit has a separate mystical entrance chord. Both respect Sound Off and stop at round start or when the tab hides.
