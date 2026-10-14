# Room 905 v3.4.0

Upload the contents of room-905-v3.4.0.zip to the repository root, preserving public. Render npm ci / npm start; existing DATABASE_URL unchanged. Verify /health returns 3.4.0 and reload every player's browser.

Lobby creator gets Easy / Normal / Hard difficulty tabs. Only the host can change them, before a shift; settings synchronize across the crew and remain locked during play. Normal preserves the current balance. Easy: 240 seconds, 0.75x Sentinel speed, gap/Sentinel penalties 3/7 seconds. Normal: 180 seconds, 1x, 5/10 seconds. Hard: 150 seconds, 1.25x, 7/12 seconds. All retain $600, randomized map, cargo rules and Guardian pulse. Replay retains the selected setting.

A short nonblocking overlay at each round's start displays difficulty and Good luck, crew. The round timer continues normally.

Friends have cleaner cards, colored online/offline badges, online-first sorting and disabled Invite when offline. Online means a connected, signed-in game session, not someone merely logged into a browser cookie. Presence is visible only for accepted friends, refreshes while the panel is open and supports multiple devices. Server still revalidates friend/session/lobby access when inviting.

Verified with host-authority/difficulty-setting/penalty tests and friend presence/disconnect tests. Visual playtest still required.
