# Put Ghost Shift on your existing live URL

This is the complete version 2.3.1 replacement. Keep your existing GitHub repository and Render Web Service. You do not need a new URL or another hosting service.

1. Download the new quantum-courier.zip and unzip it. Open the extracted quantum-courier folder.
2. Open your existing GitHub quantum-courier repository. Choose Add file → Upload files.
3. From Finder, drag the CONTENTS of the extracted folder into GitHub's upload area: server.js, package.json, package-lock.json, README.md, UPDATE.md, public folder and test folder. Drag the folders onto the web page rather than selecting their individual files in the file picker. Keep the outer quantum-courier folder out of the upload.
4. Before committing, confirm the paths include public/index.html, public/style.css, public/game.js, and test/game.test.js. The server.js and package files should have no folder prefix. GitHub will replace files with matching paths. Commit the changes with the message "Add Sentinel warnings and safer varied parkour".
5. In Render, open the existing service and select Manual Deploy → Deploy latest commit. This works even if your public-repository connection does not auto-deploy. Keep Build Command = npm ci, Start Command = npm start, Root Directory blank, and one Free instance.
6. Wait until the deployment is Live. Open your existing game URL and reload. You should see QUANTUM COURIER / GHOST SHIFT, the GRAPHICS NORMAL button, warehouse rules, and crew terminal. When you launch, Navigator sees a command trailer and the FOCUS HOLOGRAM button; Scavenger sees no breaches or Sentinel. If the old page appears, try a hard reload or a private window.
7. Test with a friend on another device: host creates room (Navigator), friend joins (Scavenger), host launches. Navigator sends a waypoint and a command. Scavenger picks up a valuable and brings it to the green pad. Check that the score increases on both devices. Confirm only the Navigator sees breaches and the Sentinel; Scavenger should see cargo only when close enough to grab it.
8. Submit the public game URL after that test. A GitHub repository link or localhost address is not the playable submission URL.

Important: upload package.json AND package-lock.json together. The new dependency is Three.js; leaving the old package files in place will prevent the 3D module from loading. Do not upload node_modules or browser-check files. Dependencies are installed by Render.

If the deploy fails, copy the error from Render's logs into the chat. If it loads but something fails during play, describe which role/device you used, the action you took, and what happened.

After deployment: play two shifts and check that the sector seed and warehouse layout change. Test Space / touch JUMP. Navigator should see a $450 SKYLINE ARTIFACT on the highest cyan/gold platform. Normal cargo still lets you win without using parkour.

Performance update: repeated walls and trim are batched, default rendering uses at most 1x pixel density, unnecessary point lights are removed, and unchanged cargo lists no longer rebuild 20 times per second. If your device still struggles, click GRAPHICS NORMAL to switch to GRAPHICS LOW. Rules, randomized maps, parkour and server synchronization are unchanged.

Version 2.3: BODYCAM red edges grow stronger as the Sentinel approaches. Click SOUND OFF to enable the heartbeat; it becomes faster and louder nearby. This gives no direction or exact monster position. Warnings now remain active near extraction and during respawn protection. Parkour now varies between horizontal and vertical courses, reverses direction, moves within its reserved area, and changes step size/height. Steps touch to prevent narrow gap traps, with server recovery for embedded players.

Deploy verification for v2.3.1: upload server.js as well as all public files and both package files. After Render finishes, open your game URL followed by /health; it must report version 2.3.1. In the game, ONLINE / v2.3.1 confirms the server version. Scavengers can click TEST AUDIO / RED to preview effects. Sound starts ON and unlocks on the first player click. Assets use versioned URLs to avoid stale browser copies.
