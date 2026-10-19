# Room 905 v4.3.1

- Options → Watch Trailer opens the approved film in a responsive, dismissible player. It fetches no video before clicking. Closing, Escape, or the start of a shift stops playback and releases the video download.
- Lobby music pauses while watching and resumes afterward when sound is enabled. Hidden tabs pause the film. Native fullscreen, playback controls, optional English scene captions and a download link are included.
- The optimized 720p trailer is about 10 MB, bundled locally under public/media. No video account, API key, external embed, or new environment variable is needed. Preserve that folder when uploading.

## Retained v4.3.0 fixes

- Moderation/error banners dismiss automatically after six seconds, have a close button, and clear when editing chat or sending a valid message. Version mismatch warnings remain until dismissed.
- Brief transport interruptions hold the player's slot for 15 seconds. During an active shift, simulation, countdown, grip, respawn and cooldown clocks pause together. The same browser session can reconnect automatically. Intentional Leave remains immediate; expired recovery returns the crew to the lobby. Refreshes, server restarts and deployments cannot restore a running shift.
- Reconnection revalidates authenticated accounts and clears developer authority. No developer password is included.
- Briefing now describes the mobile joystick. Hotel wall print is an original geometric lakeshore scene with no placeholder label.

## Upload and deploy

Extract this ZIP. Upload its contents into your existing repository, preserving public/ and test/ folders and replacing existing files. server.js and package.json belong at the repository root. Do not upload the ZIP as the application or include node_modules. Keep your Render environment variables, database and service unchanged. Build: npm ci. Start: npm start. Node: 24.x.

After deployment, open /health: version must be 4.3.1. Reload all devices. Check one normal 2–4-player round, moderated chat recovery, a brief connection interruption, mobile joystick/sprint, and replay before submitting.

Automated integration tests run locally; this does not establish production capacity or replace real-device visual/audio testing. Keep one web service instance: rooms remain in process memory. Paid hosting does not guarantee a player count.

## Trailer smoke test

Open Options → Watch Trailer on desktop and phone. Check play, pause, seeking, volume, CC and fullscreen. Close with Close or Escape; verify no audio continues. The video must not download before clicking. If your crew starts a shift while watching, the player must close automatically.
