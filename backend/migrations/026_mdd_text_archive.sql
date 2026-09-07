-- 026 — let the fact-sheet archive hold text as well as the document.
--
-- `fund_factsheet_snapshots.extracted_text_ref` has existed since migration 024
-- and has never been written, because there was nowhere to write it to: the
-- `mdd` bucket accepts `application/pdf` and nothing else, so an upload of a
-- sheet's text layer was refused by storage.
--
-- Why the text is worth keeping next to the PDF at all:
--
-- **Audit.** The catalogue's claim is that every figure came off a document a
-- manager published. The document proves the figure exists; the text is what
-- makes checking it a search rather than a reading. A snapshot's evidence quotes
-- can be re-verified against the text years later without re-opening a PDF, and
-- without the manager's link still working — one platform-hosted sheet found
-- during design was five years stale.
--
-- **Cheap re-reading.** A reading is cached against the document's sha256, so
-- re-extracting a stored sheet is free of a download but not of a model call.
-- With the text stored, a changed verification rule can be re-applied to what
-- the document actually says without fetching anything.
--
-- ⚠ NOT for re-serving to users. Users are linked to the management company's
-- own URL, because that is the authoritative publication; our copy is the
-- fallback for a rotted link. Re-serving a manager's content is a per-ManCo
-- terms question nobody has asked, and storing it for internal use is not the
-- same act. The bucket stays private and stays unlisted.

update storage.buckets
   set allowed_mime_types = array['application/pdf', 'text/plain']
 where id = 'mdd';

-- Should the bucket not exist yet — a database migrated past 024 with the
-- storage schema stubbed, which is how the migration tests run — create it in
-- the shape 024 intended, with text allowed.
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('mdd', 'mdd', false, array['application/pdf', 'text/plain'])
on conflict (id) do nothing;
