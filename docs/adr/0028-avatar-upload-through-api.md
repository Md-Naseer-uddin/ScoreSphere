# ADR 0028: Avatars are uploaded through the API and re-encoded server-side

- **Status:** Accepted
- **Date:** 2026-11-14
- **Source:** replaces the signed upload-URL flow in the spec (api §2, backend `MediaModule`)

## Decision and rationale

- `PUT /me/avatar` takes a multipart upload of at most 5 MB. The API:
  - checks the real image format with sharp (JPEG, PNG, WebP or AVIF), ignoring file name and client MIME;
  - applies EXIF orientation;
  - drops all metadata, including GPS;
  - re-encodes to a 512×512 WebP and stores it under a fresh random key.
- Images are served from `GET /media/avatars/<key>.webp` with immutable caching. A new upload gets a new key, and the old file is deleted.
- Why: the spec's two-step flow (signed upload URL, then a "complete" call) requires validating and re-encoding after upload anyway. For files this small, uploading straight to the API removes a round trip and an orphaned-upload cleanup job, and validation happens before anything is stored.
- Storage sits behind `StorageService`:
  - local disk (`STORAGE_DIR`) for development and the pilot;
  - an S3-compatible driver once a host is chosen.
- Large media (if ever added) should revisit direct-to-storage uploads.
