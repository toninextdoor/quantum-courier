# Quantum Courier: Ghost Shift

An original asymmetric multiplayer 3D salvage game for 2–4 players. The Navigator sits in a 3D mission-command trailer with a translucent warehouse hologram; the other players explore in first person, retrieve fragile valuables, and depend on the Navigator's guidance.

## Run locally

Requires Node.js 20+ and a WebGL-capable browser.

```sh
npm ci
npm start
```

Open http://localhost:3000. For another device on your LAN, use http://YOUR-COMPUTER-IP:3000. To play from different locations, deploy the entire Node app as a Web Service, following UPDATE.md. `PORT` is supplied by the hosting provider or defaults to 3000.

## Mission rules

- The first player is the Navigator. Everyone else is a Scavenger (up to three).
- Extract $600 worth of valuables within 3 minutes to win.
- Navigator: the mission-command trailer contains a real miniature 3D warehouse hologram showing crew, valuables, invisible breaches and the Sentinel. FOCUS HOLOGRAM switches to a closer perspective; WIDE TRAILER VIEW returns to the desk. Click an open tile on the hologram to place a 12-second waypoint. Quick commands last 4.5 seconds and describe movements relative to the Scavenger's view.
- Scavenger: the bodycam cannot detect breaches or the Sentinel, cargo appears only within grabbing range (1.8m), and fog limits distant visibility. Depend on the Navigator for safe routing, warnings and target locations. Ordinary walls remain visible for basic movement. WASD moves. Mouse capture or left/right arrows turn your view. E grabs the nearest available valuable within 1.8m; E again drops it. On mobile, use touch arrows, swipe the scene to look, and tap GRAB/DROP. Carry valuable objects into the green extraction pad to deposit automatically.
- Hold Shift or RUN to sprint. Cargo slows you down. Sprinting into walls damages cargo by 12 condition points (at most once per 1.1 seconds). Dropping damages it by 8 points. Sale value is rounded base value × condition / 100. Condition cannot fall below 10%.
- Breaches appear only on the Navigator hologram. They return you to extraction, subtract 5 seconds, drop held cargo, and damage it by 20 condition points.
- The Sentinel is invisible to Scavengers and receives no visible warning marker or proximity sound. Only the Navigator can track it. It patrols through actual doorways. It can spot players within 7.5m with unobstructed sight, or hear unloaded sprinting players within 10m. Getting caught returns you to extraction, subtracts 10 seconds, drops cargo and damages it by 35 condition points. Extraction is safe; respawns have 3 seconds of protection.
- Built-in crew chat, Navigator commands and waypoint bearings work without a voice call. Talking aloud or using a separate voice call is also useful. Built-in microphone/voice chat is not included.
- The host can launch a new shift after winning or losing. If anyone disconnects mid-shift, the crew returns to the lobby and roles are reassigned. Reconnecting players must rejoin with the code.

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move | WASD; up/down arrows also move | Direction buttons |
| Look | Click Enter first-person view, then mouse; or left/right arrows | Swipe the 3D view |
| Grab / drop | E | GRAB / DROP |
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

Development browser checks also passed with three Chromium clients, including a 390px touch viewport: WebGL, both asymmetric views, map waypoint clicks, commands, chat, mouse capture, keyboard and touch movement, pickup, extraction, loss results, replay and no horizontal mobile overflow. Physical-device/network playtesting is still needed to tune difficulty and confirm performance on your users' devices.

## Technology

Node.js, Express, Socket.io, Three.js, vanilla HTML/CSS and Web Audio. The server simulates movement, wall collision, cargo condition, scoring, enemy navigation and the timer at a 20 Hz fixed step. Clients interpolate positions and render views; the server never accepts client-provided coordinates or scores. Scavengers receive only cargo within 1.8m with an unobstructed path (plus their held cargo), no breach locations, and no Sentinel data. Navigator receives the full tactical state. The bodycam has short visibility; mission command guides routes around unseen threats. Input expires after 350ms without updates. Names/messages use text nodes, and room actions, interaction distance, roles and message rates are checked server-side.
