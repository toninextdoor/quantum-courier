# Put Ghost Shift on your existing live URL

This is the complete version 2.1 replacement. Keep your existing GitHub repository and Render Web Service. You do not need a new URL or another hosting service.

1. Download the new quantum-courier.zip and unzip it. Open the extracted quantum-courier folder.
2. Open your existing GitHub quantum-courier repository. Choose Add file → Upload files.
3. From Finder, drag the CONTENTS of the extracted folder into GitHub's upload area: server.js, package.json, package-lock.json, README.md, UPDATE.md, public folder and test folder. Drag the folders onto the web page rather than selecting their individual files in the file picker. Keep the outer quantum-courier folder out of the upload.
4. Before committing, confirm the paths include public/index.html, public/style.css, public/game.js, and test/game.test.js. The server.js and package files should have no folder prefix. GitHub will replace files with matching paths. Commit the changes with the message "Add classified mission command".
5. In Render, open the existing service and select Manual Deploy → Deploy latest commit. This works even if your public-repository connection does not auto-deploy. Keep Build Command = npm ci, Start Command = npm start, Root Directory blank, and one Free instance.
6. Wait until the deployment is Live. Open your existing game URL and reload. You should see QUANTUM COURIER / GHOST SHIFT, the new warehouse rules, and the crew terminal. When you launch, Navigator sees a command trailer and the FOCUS HOLOGRAM button; Scavenger sees no breaches or Sentinel. If the old page appears, try a hard reload or a private window.
7. Test with a friend on another device: host creates room (Navigator), friend joins (Scavenger), host launches. Navigator sends a waypoint and a command. Scavenger picks up a valuable and brings it to the green pad. Check that the score increases on both devices. Confirm only the Navigator sees breaches and the Sentinel; Scavenger should see cargo only when close enough to grab it.
8. Submit the public game URL after that test. A GitHub repository link or localhost address is not the playable submission URL.

Important: upload package.json AND package-lock.json together. The new dependency is Three.js; leaving the old package files in place will prevent the 3D module from loading. Do not upload node_modules or browser-check files. Dependencies are installed by Render.

If the deploy fails, copy the error from Render's logs into the chat. If it loads but something fails during play, describe which role/device you used, the action you took, and what happened.
