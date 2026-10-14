# Room 905 v3.3.2 · uniquely named verified package

This ZIP is named room-905-v3.3.2.zip, with files directly at its top level. Extract it into a new empty folder. Upload server.js, accounts.js, friends.js, package.json, package-lock.json, BUILD.txt and the public folder to the repository root. Do not put them inside an extra room-905 folder. Preserve public/assets paths. README and tests are also included.

Check package.json in GitHub: version must be 3.3.2. In Render deploy the latest main commit, wait for Live, then open /health. It must report version 3.3.2 and build room905-3.3.2-startup-fix. Use npm ci / npm start; keep DATABASE_URL and developer credentials private in Render Environment.

The archive contains the smooth disclosure -> briefing -> lobby startup fix, neutral disclosure background, concise CREW ROLES page and book navigation kept outside scrolling text. Friends, Guardian and account storage remain included. Archive bytes were checked after packing, rather than relying only on the source folder version.
