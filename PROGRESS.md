# Folders & Disposable Notes — Feature Progress

See `plan.md` for full design spec.

## Status: Phase 2 — UI Management Features

---

## Completed

### Database Schema
- [x] `folders` table (id, user_id, name, created_at, updated_at) with RLS
- [x] `transcripts` table new columns: `folder_id`, `series_id`, `series_order`, `is_disposable`
- [x] Migration SQL ready in `supabase/migrations/`

### Backend API (server.js + lambda/index.mjs)
- [x] `GET /api/folders` — list user's folders
- [x] `POST /api/folders` — create folder
- [x] `PUT /api/folders/:id` — rename folder
- [x] `DELETE /api/folders/:id` — delete folder (recordings become unfiled)
- [x] `PUT /api/transcripts/:id/move` — move recording to a folder
- [x] `POST /api/transcripts/:id/series` — link recording to a series
- [x] `DELETE /api/transcripts/disposable` — bulk delete all disposable notes
- [x] `POST /api/transcribe` — accepts `folderId`, `seriesId`, `isDisposable`
- [x] `GET /api/transcripts` — returns folder/series/disposable data
- [x] Lambda handler mirrors all Express routes (route ordering verified)

### Frontend — Core UI (app.js + index.html + styles.css)
- [x] Folder selector dropdown before recording (with "New Folder" button)
- [x] Quick Note toggle (disposable mode) with visual feedback
- [x] Continue Series checkbox
- [x] View tabs: History | Folders | Disposable | Shared
- [x] Folder filter dropdown in folders view
- [x] Disposable count badge + "Empty All" button
- [x] Recording cards show folder badge, series badge, disposable badge
- [x] Recording cards have play, copy, share, delete buttons

---

### Frontend — Management Features (Phase 2)
- [x] Folder rename — edit icon appears next to folder dropdown when a specific folder is selected
- [x] Folder delete — trash icon appears next to folder dropdown, "type DELETE" confirmation
- [x] Move recording to folder — folder icon button on every recording card, modal with folder picker
- [x] "Type DELETE to confirm" pattern on all destructive actions (delete recording, delete folder, empty disposable)
- [x] Multi-select mode — checkbox toggle button, click cards to select, floating action bar with Select All / Delete Selected / Cancel
- [x] Bulk delete with "type DELETE" confirmation modal

## Remaining / Future

- [ ] Series linking after recording (retroactive series assignment UI)
- [ ] Deploy and test on production Lambda
- [ ] Run SQL migration in Supabase

---

## Architecture Notes

### Key Files
| File | Purpose |
|------|---------|
| `app/server.js` | Express backend (dev server) |
| `lambda/index.mjs` | Production Lambda handler (mirrors server.js) |
| `app/public/index.html` | Main SPA page |
| `app/public/app.js` | Frontend logic |
| `app/public/styles.css` | All styles |
| `app/public/uploader.js` | File upload logic |
| `supabase/migrations/` | Database migration SQL |

### Conventions
- Auth: Supabase JWT via `authFetch()` wrapper
- Modals: `.modal` > `.modal-content` > `.modal-header` + `.modal-actions`
- Buttons on cards: `.icon-button` with type class (e.g. `.play-btn`)
- Badges: `.recording-folder-badge`, `.recording-series-badge`, `.recording-disposable-badge`
- Views: `currentRecordingsView` state controls which tab is active
- Folder data: `folders` array populated by `loadFolders()` → `populateFolderSelects()`
