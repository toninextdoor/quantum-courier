# Room 905 v3.3.3 · briefing placement fix

Upload the contents of room-905-v3.3.3.zip to the repository root, preserving public. Keep npm ci / npm start. Verify /health reports 3.3.3 after deployment; reload Safari.

Fixed a CSS regression: the outer briefing grid inherited two columns from introScreen, positioning the header beside the book. It now explicitly uses one column with header in row one, centered book in row two and browser status in row three. The book itself keeps its two-page layout and internally scrolling text; Back/Next stay visible. Startup disclosure sequencing is unchanged.
