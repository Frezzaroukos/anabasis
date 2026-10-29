-- 0008_week_xp.sql — XP τελευταίων 7 ημερών για εβδομαδιαίο leaderboard.
-- Ο client στέλνει το week_xp μαζί με το συνολικό snapshot· ο server το clamp-άρει
-- και κρατά πότε μετρήθηκε (week_xp_at) ώστε ανενεργά προφίλ να μη μένουν για
-- πάντα στο weekly board. Καμία νέα πηγή αλήθειας: ίδιο trust model με το xp.
ALTER TABLE profile_stats ADD COLUMN week_xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profile_stats ADD COLUMN week_xp_at TEXT;
