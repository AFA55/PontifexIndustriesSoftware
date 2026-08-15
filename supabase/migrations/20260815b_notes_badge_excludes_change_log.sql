-- The notes badge on a job card counted EVERY job_notes row; the panel that
-- opens when you press it filters `change_log` out. So Simpsonville read "2"
-- over "No notes yet" — the two rows were a status flip and a door code being
-- added by an edit, never anything a human wrote.
--
-- A badge that disagrees with the thing it counts trains people to stop
-- trusting badges, which is expensive on a screen whose whole job is telling
-- the office what needs attention.
--
-- change_log rows are no longer written at all (founder, Aug 15 — he weighed
-- the audit trail and decided the storage was not worth it; the real one lives
-- in job_history). Historical rows stay; they are simply not counted.
DO $$
DECLARE def text;
BEGIN
  def := pg_get_viewdef('public.schedule_board_view'::regclass);
  def := replace(
    def,
    'FROM job_notes jn
          WHERE (jn.job_order_id = jo.id)) AS notes_count',
    'FROM job_notes jn
          WHERE ((jn.job_order_id = jo.id) AND (jn.note_type IS DISTINCT FROM ''change_log''))) AS notes_count'
  );
  EXECUTE 'CREATE OR REPLACE VIEW public.schedule_board_view AS ' || def;
END $$;
