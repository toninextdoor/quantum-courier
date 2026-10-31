# Room 905 V4.5.0

Upload this ZIP’s contents to the repository root and deploy the complete update. Keep existing Render environment variables. No new configuration is needed for the game code.

## Player onboarding

Interactive 3D training now uses the live hotel geometry, cargo, trolley, Sentinel and Navigator mission-control renderer. It starts with the selected role; the player can practice another role or enter the lobby after completing one. Recorded examples remain optional. Recovery teaches look, movement, sprint, pickup, repeated grip and extraction. Navigator teaches teammate selection, hidden fault identification, alerts and waypoints. Guardian teaches look, range and a pulse-assisted crossing. Each action advances only after success and Continue.

Movement displacement is shared between training and server rounds. The practice scene is a safe, simplified hotel suite; it teaches the core actions and is not a complete multiplayer simulation. Drop/expired grip resets the practice case for an immediate retry. Jump, mouse capture, drag-look and touch joystick are available. Desktop live mouse-look also supports the existing click-to-look flow.

Practice has no public room, score or XP awards. Completion uses the existing browser/account storage. Login, Skip and Options → Practice / How to Play remain available. Existing completed tutorials can be replayed from Options.

Round results now state whether the quota was reached or how much was missing. Hosts can replay with the same crew and roles on a new layout.

## Hosting before sharing

This ZIP does not change your Render compute plan. If the web service is still Free, change the quantum-courier web service’s Compute plan to an always-on paid instance in Render to remove idle wake-up screens. The workspace plan and database plan are separate. No purchase was made by this update.

The Recovery display name now maps consistently to the server role when returning from training; role selection and completion checks preserve that mapping.
