-- ============================================================
-- MANPOWER BRUDERSCHAFT – Supabase Setup VOLLVERSION
-- Führe dieses SQL KOMPLETT im SQL Editor aus (Strg+A, Strg+C, einfügen, Run)
-- ============================================================

-- TABELLE 1: Mitglieder (Benutzername + Passwort)
CREATE TABLE IF NOT EXISTS members (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  username   text UNIQUE NOT NULL,
  password   text NOT NULL,
  active     boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  notes      text
);

-- TABELLE 2: Feedback (Lernsystem der Community)
CREATE TABLE IF NOT EXISTS feedback (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES members(id) ON DELETE SET NULL,
  username      text,
  tone          text,
  vibe_score    text,
  dynamik       text,
  used_reply    text,
  used_label    text,
  feedback_type text CHECK (feedback_type IN ('worked','mixed','failed')),
  situation     text,
  created_at    timestamptz DEFAULT now()
);

-- TABELLE 3: Community Insights (gesammelte Erkenntnisse)
CREATE TABLE IF NOT EXISTS community_insights (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  insight    text NOT NULL,
  category   text,
  upvotes    int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Sicherheit aktivieren
ALTER TABLE members           ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback          ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_insights ENABLE ROW LEVEL SECURITY;

-- Zugriffsregeln
CREATE POLICY "members_lesen"    ON members           FOR SELECT USING (true);
CREATE POLICY "members_kein_add" ON members           FOR INSERT WITH CHECK (false);
CREATE POLICY "feedback_lesen"   ON feedback          FOR SELECT USING (true);
CREATE POLICY "feedback_add"     ON feedback          FOR INSERT WITH CHECK (true);
CREATE POLICY "feedback_update"  ON feedback          FOR UPDATE USING (true);
CREATE POLICY "insights_lesen"   ON community_insights FOR SELECT USING (true);
CREATE POLICY "insights_kein_add"ON community_insights FOR INSERT WITH CHECK (false);

-- START-NUTZER (ändere Passwörter!)
INSERT INTO members (username, password, active, notes) VALUES
  ('mo',      'dein-passwort-hier', true, 'Admin'),
  ('bruder1', 'passwort-bruder1',   true, 'Member')
ON CONFLICT (username) DO NOTHING;

-- START-INSIGHTS
INSERT INTO community_insights (insight, category) VALUES
  ('Kürzer antworten als sie schreibt erzeugt Spannung und Neugier', 'timing'),
  ('Konkrete Einladungen funktionieren besser als vage Formulierungen', 'direktheit'),
  ('Echter Bezug auf ihr Profil beim Opener schlägt jede Pickup-Line', 'opener'),
  ('Humor der sie einbezieht schlägt Humor auf ihre Kosten', 'humor'),
  ('Nach 3-5 guten Nachrichten ist der richtige Zeitpunkt für die Nummer', 'timing'),
  ('Selbstironie zeigt Selbstsicherheit', 'selbstsicherheit'),
  ('Antworten in ihrer Sprache zeigt Respekt und baut Vertrauen auf', 'international')
ON CONFLICT DO NOTHING;

-- ============================================================
-- NUTZER VERWALTEN (im Table Editor oder per SQL):
-- Neuer Nutzer:    INSERT INTO members (username, password, active) VALUES ('name', 'pw', true);
-- Sperren:         UPDATE members SET active = false WHERE username = 'name';
-- Entsperren:      UPDATE members SET active = true  WHERE username = 'name';
-- Passwort ändern: UPDATE members SET password = 'neues-pw' WHERE username = 'name';
-- Löschen:         DELETE FROM members WHERE username = 'name';
-- Alle anzeigen:   SELECT username, active, created_at FROM members;
-- ============================================================
