-- M0 spike: temporary open channel for testing Yjs relay over InsForge realtime.
-- Removed in M3 once doc:% channels with membership RLS exist.
INSERT INTO realtime.channels (pattern, description, enabled)
VALUES ('spike:%', 'M0 sync spike (temporary)', true)
ON CONFLICT (pattern) DO UPDATE
SET description = EXCLUDED.description, enabled = EXCLUDED.enabled;
