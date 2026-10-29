-- Login failure counters; migration must run before enabling admin login.
CREATE TABLE IF NOT EXISTS admin_login_attempts (
 ip_hash TEXT PRIMARY KEY,
 failure_count INTEGER NOT NULL DEFAULT 0 CHECK(failure_count >= 0),
 window_start_ms INTEGER NOT NULL DEFAULT 0,
 blocked_until_ms INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_admin_login_blocked ON admin_login_attempts(blocked_until_ms);
