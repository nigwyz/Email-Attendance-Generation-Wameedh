# Wameedh SC — Local Email + QR Server

> Local HTTP server to test SMTP settings and send QR code emails.

Summary
-------
This project provides a local Flask app (`flask_server.py`) that serves the attendance UI
(Participants / QR & Email / Scanner), accepts JSON POST requests to test SMTP
connectivity (`/test`) and to send QR code emails to participants (`/send`), and records
check-ins (`/attendance/append`) with per-session dedupe.

Quick requirements
------------------
- Python 3.10+
- Dependencies: `pip install -r requirements.txt`
  (Flask, qrcode, pillow; opencv is only needed for the optional live camera scanner and
  is guarded so the app still boots without it)

Install dependencies
------------------------------
```bash
python -m pip install -r requirements.txt
```

Quick start
-----------
Run the app from the project root:

```bash
python flask_server.py
```

Open your browser at http://localhost:5000/index.html.

Run the app in an isolated folder (prevents the server serving unrelated project files):

```bash
python launch_server_clean.py
```

Files added
-----------
- [docs/server.md](docs/server.md) — API reference and curl examples
- [requirements.txt](requirements.txt) — optional Python packages for QR generation
- [examples/test.json](examples/test.json) — example payload for `/test`
- [examples/send.json](examples/send.json) — example payload for `/send`
- [launch_server_clean.py](launch_server_clean.py) — creates an isolated run folder and starts `server.py`

Endpoints (overview)
--------------------
- `POST /test` — test SMTP connection. Body: `{ "email": { ... } }`
- `POST /send` — send to participants. Body: `{ "email": { ... }, "participants": [{"name":...,"email":...}], "qr_dir": "qr_out" }`

Notes about "clean" launches
----------------------------
The included `launch_server_clean.py` script copies only the minimal files the server needs (server binary, frontend files, `qr_out` directory if present and `logoBootcamp.png`) into a temporary `server_isolated/` folder and runs `server.py` from there. This prevents the HTTP server from exposing other project files when you open http://localhost:5050.

Security
--------
- Do not commit real SMTP credentials to source control. Use environment variables or ephemeral test accounts.

Support
-------
See [docs/server.md](docs/server.md) for full usage and examples.
