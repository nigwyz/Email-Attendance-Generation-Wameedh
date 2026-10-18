# UX Improvement Plan — Events Department Head & Assistants

> Audience: the department head (oversight + final send authority) and his assistants
> (operational: participant setup, door check-in). Grounded in the current codebase
> (`web/index.html`, `web/app.js`, `flask_server.py`, `server.py`).

## Personas

| Role | Goal on event day | Current experience of the app |
|---|---|---|
| Head of events | Confirm send-out completed, monitor check-in rate, deliver absentee evidence | Must trust others; no live dashboard beyond 2 stat cards; exports raw CSV |
| Assistant | Import list, send QR emails, check people in at the door fast | Works, but scanning is locked to the machine running the server (server-side camera), rescans create duplicate rows, no instant feedback on unknown codes |

## Confirmed pain points (with code references)

1. **Check-in is single-device** — `app.js:493-545` drives the *server's* webcam via
   `/camera/start` + `/stream.mjpg`; only the laptop running `flask_server.py` can scan.
   Assistants cannot check people in from their own phones/tablets/second door.
2. **Blind append, no dedupe** — `flask_server.py:108-125` (`/attendance/append`) writes a row
   per scan event; scanning twice = phantom attendees later.
3. **Session selector is cosmetic** — `index.html:45-51` picks Session 1-4 but
   `/attendance/append` stores only email/first/last/time; exported CSV cannot be split
   per session — the head cannot report per-session rates.
4. **No participant resolution on scan** — `app.js:519` polls `/status` and displays the raw
   decoded string; an unknown QR or a guest gets identical treatment as a valid participant.
5. **Two servers, one job** — README (:5050 `server.py`) vs run.md (:5000 `flask_server.py`);
   the UI uses only :5000 (`app.js:287-288`). Assistants running the wrong script is a
   daily support incident.
6. **Send-blast has no head gate** — `Send All Emails` button chats every participant from any
   browser with zero confirmation state; a mis-click by an assistant = wrong audience, no way
   to "retry failed only".
7. **Reporting is copy-paste** — attendance export is a raw CSV dump (`app.js:715-735`);
   no per-session attendance rate, absent list, or one-tap shareable summary.

## Improvement roadmap

### Phase 0 — Day-of reliability (≈ half a day, P0)
- Add `session` + dedupe to `/attendance/append`: reject-or-tag repeated check-in within the
  same session; return `{"ok": true, "duplicate": true, "first_seen": "..."}`
  (`flask_server.py:108`).
- Persist the global session selector into each append + export (fixes #3).
- Startup card in the UI: which command runs what; hide legacy `:5050` route from docs
  (`run.md`, README "Quick start") (#5).
- On rescan, overlay shows **"already checked in at 10:42"** in gold instead of success green
  (fixes #4 partial).

### Phase 1 — Scan from anywhere (≈ 1-2 days, P1)
- Browser-side scanning: `getUserMedia` + `BarcodeDetector` (native in Chrome/Android/iOS 17+,
  ~0 KB) with jsQR (~20 KB) fallback; post decoded payload to the existing
  `/attendance/append`. The server camera (`/stream.mjpg`) remains as a fallback tile
  (`app.js:493-545` refactor).
- Enablers unlocked: second door, assistants' own laptops/phones, live concurrent check-ins.
- Scan result card resolves against the imported participant list: green = participant,
  red = unknown. Uses the already-client-side list (fixes #4).
- Mobile-friendly scanner layout (`style.css` `@media` pass; big tap targets; camera select
  list becomes device picker).

### Phase 2 — Head cockpit (≈ 2 days, P2)
- Simple PIN roles (no accounts drama): **Head PIN** unlocks Send-all, resend-failed, config
  export; assistants get scan + read-only. Endpoints `/send`, `/attendance/list` export gated
  in `flask_server.py` (fail-closed: refuse when no head session).
- Live dashboard cards on Participants page: Invited (N), Sent X%, Checked-in Y%, Absent list
  (per current session), updated from `/attendance/list` every 10s.
- Send improvements: per-batch progress with per-person `ok/error` chips (data already returned
  by `/send`, `flask_server.py:253-274`), **Retry failed only**, dry-run preview mode
  (first recipient previewed before blast — head gate = preview approve).
- Absentee report: one-tap copy/print list (name + email), per session (#7).

### Phase 3 — Polish (ongoing, P3)
- Draft email editor with inline preview (matches `server.py` HTML template variables) instead
  of raw SMTP fields for assistants; SMTP config stays in a "danger zone" card.
- Audit log: who scanned what, when, from which device.
- Optional: self-service re-send link per participant (helps no-show QR requests at the door).

## Success metrics

| Metric | Baseline | Target |
|---|---|---|
| Setup time (start → scanning) | manual, multi-step | ≤ 5 min |
| Check-in attribution | raw string | resolved name + status, < 1.5 s |
| Duplicate rows in final CSV | unbounded | 0 |
| Absentee report drill-down | CSV + formulas | ≤ 2 taps |
| Send-blast wrong-audience risk | unguarded | head-PIN + preview |

## Constraint notes
- No new heavy dependencies allowed (dep trim just shipped): `BarcodeDetector` is native,
  jsQR is a single 20 KB library; `opencv-python-headless` stays optional (lazy import
  already in place, `flask_server.py:14-19`).
- App remains LAN-local; no cloud services — head's SMTP credentials never leave the machine.
- Backward compatible: existing `attendance/attendance.csv` keeps its columns; session and
  dedupe are additive.
