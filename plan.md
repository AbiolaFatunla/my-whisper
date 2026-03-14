# Plan: Folders & Disposable Notes Features

## Feature 1: Folders (Subject-based Organization)

### Concept
Users can create **folders** (subjects) to organize their recordings. Within a folder, recordings can be **linked as a series** (Part 1, Part 2, etc.) while preserving the AI-generated title for each individual recording.

### How It Works

**Folder Management:**
- A "Folders" section in the sidebar/history area showing all user folders
- "New Folder" button lets users name a subject (e.g., "Business Ideas", "Journal", "Meeting Notes")
- Recordings can be assigned to a folder at recording time or moved later
- Default behavior: recordings without a folder go to a general "Unfiled" area

**Series/Grouping within Folders:**
- Inside a folder, users can **link recordings as a series** — each recording keeps its AI-generated title but gets a series label (e.g., "Part 1", "Part 2")
- When starting a new recording inside a folder, a toggle/option: **"Continue series"** — this links it to the previous recording as the next part
- Display format: `AI Title — Part 2` (AI title stays, series number appended)
- Series are collapsible in the UI — expand to see all parts

**Folder Selection at Record Time:**
- Before/when hitting record, a small dropdown shows available folders (+ "No Folder" option)
- Quick "+" to create a new folder inline

### Database Changes

**New `folders` table:**
```sql
CREATE TABLE folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**New columns on `transcripts` table:**
```sql
ALTER TABLE transcripts ADD COLUMN folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;
ALTER TABLE transcripts ADD COLUMN series_id UUID;        -- groups related recordings
ALTER TABLE transcripts ADD COLUMN series_order INTEGER;  -- 1, 2, 3...
```

**RLS policies** on `folders` table (same pattern as transcripts — users see only their own).

### API Changes

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/folders` | List user's folders |
| POST | `/api/folders` | Create folder |
| PUT | `/api/folders/:id` | Rename folder |
| DELETE | `/api/folders/:id` | Delete folder (recordings become unfiled) |
| PUT | `/api/transcripts/:id/move` | Move recording to a folder |
| POST | `/api/transcripts/:id/series` | Link recording to a series |

### UI Changes

- **History panel:** Add folder list view (collapsible folders with recording counts)
- **Record section:** Add folder selector dropdown above record button
- **Inside folder view:** Show recordings grouped by series (collapsible) + standalone ones
- **Recording card:** Show folder badge + series indicator if applicable

---

## Feature 2: Disposable Notes (Quick Speech-to-Text)

### Concept
A **quick capture mode** for throwaway thoughts. Toggle it on, record, and the note goes into a special "Disposable Notes" area. Users can review and bulk-delete later.

### How It Works

**Toggle Mechanism:**
- A clearly visible toggle switch near the record button: **"Quick Note"** (or "Disposable")
- When ON: the record button changes appearance (different color/style) to indicate disposable mode
- When OFF: normal recording behavior

**Disposable Notes Behavior:**
- Recordings made in disposable mode go into a system-managed "Disposable Notes" folder
- Still get transcribed and AI-titled (so you can scan them later)
- Displayed in their own section/tab in history
- **Bulk actions available:** "Empty All" button + individual delete + multi-select delete
- No series linking in disposable mode (they're meant to be standalone quick captures)

**Toggle State:**
- The toggle state persists during the session (localStorage) so you don't have to re-toggle between quick notes
- Visual indicator stays visible so you always know which mode you're in
- When disposable mode is ON, the folder selector is hidden (disposable notes don't go into user folders)

### Database Changes

**New column on `transcripts` table:**
```sql
ALTER TABLE transcripts ADD COLUMN is_disposable BOOLEAN DEFAULT FALSE;
```

### API Changes

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/transcripts?disposable=true` | List disposable notes |
| DELETE | `/api/transcripts/disposable` | Bulk delete all disposable notes |

### UI Changes

- **Record section:** "Quick Note" toggle switch next to record button
- **History panel:** "Disposable Notes" tab/section with count badge
- **Disposable section:** "Empty All" button + multi-select with delete
- **Visual feedback:** Record button color change when in disposable mode (e.g., orange tint)

---

## Implementation Order

1. **Database migrations** — Add folders table, new columns on transcripts
2. **Backend API** — Folder CRUD, transcript move/series endpoints, disposable query/bulk-delete
3. **Frontend: Folders UI** — Folder list, folder selector, series linking
4. **Frontend: Disposable Notes UI** — Toggle, disposable section, bulk delete
5. **Lambda sync** — Mirror backend changes in production Lambda handler
6. **Testing** — End-to-end flow for both features

## Key Design Decisions

- **AI titles preserved:** Series recordings show `{AI Title} — Part N`, the AI title is never overridden
- **Folders are optional:** No recording is forced into a folder; "Unfiled" is the default
- **Disposable is a flag, not a folder:** Simpler implementation, avoids folder clutter, enables dedicated bulk-delete API
- **Series uses a shared `series_id`:** All parts of a series share the same UUID, `series_order` determines sequence — simple and flexible
