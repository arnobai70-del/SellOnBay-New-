-- SellOnBay 2.0: approving a source file no longer needs a clean malware scan (owner decision 2026-10-29: malware scanning REMOVED BY
-- OWNER, SECURITY RISK ACCEPTED; docs/DECISIONS.md). Everything else an approved file needs stays: SHA-256, size, the private approved
-- copy and the reviewing admin. The scan_* columns and every recorded scan result are kept (history); nothing writes them any more.
-- Removes a rule only: no row, column or privilege changes. Every row that met the old rule meets the new one, so validation cannot fail.
-- Apply BEFORE the application release that stops scanning; the old code keeps working with it (it only ever approved with a clean scan).
-- requires: 0058

alter table file_objects drop constraint if exists file_objects_check;
alter table file_objects add constraint file_objects_approved_complete
  check (state <> 'approved' or (sha256 is not null and size_bytes is not null and approved_path is not null and reviewed_by is not null));
