# Room 905 v3.1.1 · deployment repair

Upload the full updated project contents, preserving public and its asset directories. Replace BOTH package.json and package-lock.json. In Render keep Build Command npm ci and Start Command npm start. Commit, deploy the latest commit, then hard refresh.

The previous app-version edit accidentally changed nested dependency requirements in package-lock.json, including mime-types. This update regenerates the lock from package.json in a clean directory; future releases must change only the top-level app version, never globally replace dependency versions. Node is pinned to the 24.x release line instead of an unbounded >=20 range.

The new M.V.M key/wave/skyline logo and Toronto-area lakeshore hotel setting stay. OVO and Drake references are removed from the live UI. The footer describes the independent fictional game. About describes the Greater Toronto Area inspiration without claiming affiliation with real hotels or organizations. Guest access, accounts, themes, rules and privacy notices stay available.

Accounts still need DATABASE_URL. Do not upload private developer credentials or database URLs to the repository. This update does not create a database or change your Render settings automatically.
