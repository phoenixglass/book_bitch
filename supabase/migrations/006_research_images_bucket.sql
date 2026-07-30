-- Run this in your Supabase SQL editor (https://supabase.com/dashboard → SQL Editor)
-- Creates the Storage bucket that imported document images are uploaded to.
--
-- Before this, mammoth's default image handling inlined every embedded image
-- into the imported HTML as a base64 data URI. That binary then lived in the
-- project JSON, which is rewritten in full on every autosave and copied in full
-- into every revision snapshot — so one illustrated research document could
-- outweigh the manuscript many times over and, multiplied by the revision
-- retention policy, fill the database on its own.
--
-- Must be applied before the app can import documents containing images:
-- uploads into a bucket that does not exist fail, and the importer drops the
-- image rather than falling back to inlining it.

INSERT INTO storage.buckets (id, name, public)
VALUES ('research-images', 'research-images', true)
ON CONFLICT (id) DO NOTHING;

-- Objects are stored under a <user-id>/ prefix, so ownership is the first path
-- segment. storage.foldername() splits the object name on '/'.
DROP POLICY IF EXISTS "Users can upload their own research images" ON storage.objects;
DROP POLICY IF EXISTS "Users can read research images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own research images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own research images" ON storage.objects;

CREATE POLICY "Users can upload their own research images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'research-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- The bucket is public so <img src> works without signing every URL; this
-- policy covers authenticated reads through the API for the same objects.
CREATE POLICY "Users can read research images" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'research-images');

CREATE POLICY "Users can update their own research images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'research-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own research images" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'research-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
