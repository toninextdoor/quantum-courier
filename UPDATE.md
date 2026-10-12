# Deploy Room 905 v2.7.0

Keep your existing GitHub repository and Render Web Service.

1. Download room-905.zip and unzip it. Open the extracted room-905 folder.
2. In your existing GitHub repository, choose Add file → Upload files. Drag the CONTENTS of that folder into the page, including public and test. Do not upload the outer room-905 folder or node_modules.
3. Confirm server.js, package.json and package-lock.json are at the repository root, and public/game.js, public/index.html and public/style.css retain their public/ prefix. Commit the replacements.
4. Download the separate private DEV-SETUP.txt. In Render → your service → Environment, add DEV_USERNAME and DEV_PASSWORD using the values in that file. Do not upload DEV-SETUP.txt to GitHub. Without these variables developer access stays disabled.
5. Save the environment changes and deploy the latest commit. Keep Build Command npm ci, Start Command npm start, and Root Directory blank.
6. When Live, reopen the game. Its /health endpoint and ONLINE badge must show 2.7.0. All testers should close old tabs and reload the new version.
7. Tap/click the SOUND button ten times, leaving less than three seconds between consecutive taps. The developer login opens. Use the credentials from DEV-SETUP.txt. Sessions last 30 minutes and end on disconnect; repeat the ten taps to reopen an authenticated console.
8. Create/join a normal room with at least two players and launch a shift. Select one Scavenger or All Scavengers. Developer controls affect only your current room.

## Test controls

- Red-screen, heartbeat, ambience, or combined previews last five seconds. Clear removes the preview; real proximity warnings can still remain.
- Near/far Sentinel placement requires ONE selected Scavenger and freezes the Sentinel. Freeze/resume toggles its movement. Other players' warnings still depend on their own positions.
- Go to parkour start, return to extraction, give premium cargo, grant 60 seconds of protection, or damage held cargo by 20%.
- Simulate breach/catch resets, add 30 seconds, complete the quota to test a win, or end the round to test a loss. New randomized round launches after a round ends.
- Diagnostics show your audio status, warning intensity and render draw calls while the console is open. Close it before moving; controls release when it opens.
- Browsers require each player to interact with their own device before audio works. Remote previews cannot override browser audio permissions. That player can click SOUND ON or ENABLE SOUND.

Regular sign-in is a future-account placeholder; guest play remains available without registration. The previous public effect-test button is replaced by the protected developer console. No developer password is included in the public files or ZIP.

Audio checks: use THIS DEVICE → Test speaker tone, Local heartbeat, or Local ambience when listening on the developer’s own computer. Selected Scavengers room tests play on the selected players’ devices. Each target must interact to unlock audio. ENABLE SOUND resumes a blocked context. The console output meter shows the generated audio amplitude, not whether the hardware speakers are muted. Version 2.7.0 makes ambience stronger and heartbeat pitches easier to hear on small speakers.

Room 905 theme v2.7.0: the name, lobby, HUD, story, property names, floor/wall finishes, room plaque and signage use an original hotel setting. Physics, roles, timers and scores are unchanged. Replace artwork using ASSETS.md. Review RULES-REVIEW.md before final contest submission. Developer credentials remain unchanged.

V2.6 adds the intro and browser-readiness panel. Close old tabs and reopen after deployment. Try Enter/Skip, check the recommended quality, and choose RUN CHECK or USE RECOMMENDED between rounds. Graphics cycles Normal / Low / Minimal. The scene and instructions now frame play as hotel-authorized recovery with non-graphic signal interruptions.

Signal interruptions now display a private cause-and-penalty card for 1.2 seconds before controls return. Players are returned to the hallway and cargo is dropped immediately on the server; movement and grabbing are disabled during the brief reconnect countdown. Other players keep playing. No death or injury is depicted.

V2.7: the intro is now a four-page illustrated mission flipbook. Next/Back, page dots, keyboard arrows and Skip work; HOW TO PLAY reopens it from the lobby footer. The browser check still runs in the background. USE RECOMMENDED collapses the readiness panel, and BROWSER SETTINGS reopens it.
