# Room 905 v4.1.0

Skip Briefing moved below page navigation. Profile now has a live bio preview, saved moderated bio and photo uploader with square preview. Images decode and re-encode on the server (256px JPEG, metadata stripped); SVG/animation/oversize or corrupt files are rejected. Images persist in PostgreSQL. Pending images are private to the owner and authenticated developer reviewer; public avatars stay on a preset or previously approved photo until approval.

Moderation: deterministic text filters reject common severe phrases, links/contact details and abusive profile text; chat profanity masks, duplicate/burst limits and host mutes remain. These are limited filters, not semantic AI moderation or a guarantee that all harmful content is caught. Photos require human review through Developer Console > Profile photo moderation. Review checks pending-photo revision to prevent approving a replacement accidentally. Existing DEV_USERNAME/DEV_PASSWORD apply; OG crowns alone grant no review access.

Upload all contents. npm ci installs the added sharp image decoder; Node 24.x remains required. Existing DATABASE_URL is sufficient; profile/photo columns migrate automatically. No AI key or paid moderation API required. Visual/mobile and live migration testing still needed.
