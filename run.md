# create venv (only if you don't already have one)
python3 -m venv .venv
source .venv/bin/activate

# install deps
pip install -r requirements.txt

# notes:
#   QR decoding uses OpenCV's built-in QRCodeDetector (pyzbar/libzbar is no longer needed)
#   QRScanner_fixed.py is a legacy Kivy desktop app (would need python-kivy separately) — not covered by requirements.txt

# run server (or use existing .venv python)
python flask_server.py
# or, if you already have the configured venv:
./.venv/bin/python flask_server.py


Where to open the UI

Full UI: http://localhost:5000/index.html
Small server preview: http://localhost:5000/ (useful for quick camera checks