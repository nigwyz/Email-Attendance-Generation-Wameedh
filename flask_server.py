import threading
import time
import atexit
import os
from datetime import datetime
from flask import Flask, Response, jsonify, render_template_string, request, send_from_directory
import smtplib

# Reuse email helpers from the existing server.py
try:
    import server as email_server
except Exception:
    email_server = None
try:
    import cv2
except ImportError:
    cv2 = None

qr_detector = cv2.QRCodeDetector() if cv2 else None

app = Flask(__name__, static_folder='web', static_url_path='')

@app.after_request
def add_cors(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    return response

# Shared state
last_frame = None
last_detection = None
frame_lock = threading.Lock()
stop_event = threading.Event()
file_lock = threading.Lock()
camera_stop_event = threading.Event()
camera_thread = None
camera_running = False


def camera_loop(index=0, target_width=640):
    global last_frame, last_detection, camera_running
    if cv2 is None:
        print("Camera disabled: opencv not installed")
        return
    cap = cv2.VideoCapture(index)
    if not cap.isOpened():
        print("Camera not opened at index", index)
    camera_running = True
    while not stop_event.is_set() and not camera_stop_event.is_set():
        try:
            ret, frame = cap.read()
            if not ret or frame is None:
                time.sleep(0.1)
                continue

            # Resize keeping aspect ratio
            h, w = frame.shape[:2]
            if w != target_width:
                r = target_width / float(w)
                frame = cv2.resize(frame, (target_width, int(h * r)), interpolation=cv2.INTER_AREA)

            # Cropping margins similar to the desktop app (10%)
            h, w = frame.shape[:2]
            top = int(h * 0.10)
            bottom = h - top
            left = int(w * 0.10)
            right = w - left
            cropped = frame[top:bottom, left:right]

            gray = cv2.cvtColor(cropped, cv2.COLOR_BGR2GRAY)
            data = qr_detector.detectAndDecode(gray)[0]
            if data:
                with frame_lock:
                    last_detection = {"data": data, "time": time.time()}

            # Mirror image for a natural preview feel
            display = cv2.flip(cropped, 1)
            ok, jpeg = cv2.imencode('.jpg', display, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if ok:
                with frame_lock:
                    last_frame = jpeg.tobytes()

            time.sleep(0.08)
        except Exception as e:
            print('Camera loop error:', e)
            time.sleep(0.2)

    try:
        cap.release()
    except Exception:
        pass
    camera_running = False


def start_camera():
    global camera_thread
    if camera_running:
        return False
    camera_stop_event.clear()
    camera_thread = threading.Thread(target=camera_loop, daemon=True)
    camera_thread.start()
    return True


def stop_camera():
    camera_stop_event.set()
    with frame_lock:
        global last_frame, last_detection
        last_frame = None
        last_detection = None


@app.route('/attendance/append', methods=['POST'])
def attendance_append():
    data = request.get_json() or {}
    email = data.get('email', '').strip()
    first = data.get('first', '').strip()
    last = data.get('last', '').strip()
    ts = data.get('time') or datetime.utcnow().isoformat()
    session = str(data.get('session') or '').strip()

    os.makedirs('attendance', exist_ok=True)
    path = os.path.join('attendance', 'attendance.csv')
    try:
        with file_lock:
            if email:
                dup = None
                if os.path.exists(path):
                    with open(path, 'r', encoding='utf-8') as f:
                        for line_item in f:
                            parts = [p.strip().strip('"') for p in line_item.split(',')]
                            if not parts:
                                continue
                            prior_session = parts[4] if len(parts) > 4 else ''
                            if parts[0] != email:
                                continue
                            if session and prior_session and prior_session != session:
                                continue
                            dup = parts[3] if len(parts) > 3 else ''
                            break
                if dup is not None:
                    return jsonify({'ok': True, 'duplicate': True, 'first_seen': dup})
            with open(path, 'a', encoding='utf-8') as f:
                f.write(f'"{email}","{first}","{last}","{ts}","{session}"\n')
        return jsonify({'ok': True, 'duplicate': False})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@app.route('/attendance/list')
def attendance_list():
    path = os.path.join('attendance', 'attendance.csv')
    if not os.path.exists(path):
        return jsonify({'ok': True, 'items': []})
    items = []
    try:
        with file_lock:
            with open(path, 'r', encoding='utf-8') as f:
                for line in f:
                    parts = [p.strip().strip('"') for p in line.split(',')]
                    if not parts:
                        continue
                    while len(parts) < 4:
                        parts.append('')
                    items.append({'email': parts[0], 'first': parts[1], 'last': parts[2], 'time': parts[3],
                                  'session': parts[4] if len(parts) > 4 else ''})
        return jsonify({'ok': True, 'items': items})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@app.route('/')
def index():
    # Try to serve the real index.html from web/ or current directory
    for candidate in ['web/index.html', 'index.html']:
        if os.path.exists(candidate):
            return send_from_directory(os.path.dirname(os.path.abspath(candidate)) or '.', 'index.html')
    # Fallback to the built-in simple page
    with frame_lock:
        last = last_detection['data'] if last_detection else '—'
    html = '''<!doctype html>
<html>
<head>
    <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>QR Scanner (server-side)</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;background:#f6f7fb;display:flex;flex-direction:column;align-items:center;padding:16px}
    .card{background:#fff;padding:16px;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.06);max-width:900px;width:100%}
    img{max-width:100%;height:auto;border-radius:6px}
    .status{margin-top:12px;font-size:18px}
  </style>
</head>
<body>
  <div class="card">
    <h2>QR Scanner (server-side)</h2>
    <div><img src="/stream.mjpg" alt="camera stream"></div>
    <div class="status">Last detection: <strong>''' + last + '''</strong></div>
  </div>
</body>
</html>'''
    return html


@app.route('/frame.jpg')
def frame_jpg():
    with frame_lock:
        if last_frame is None:
            return Response(status=204)
        return Response(last_frame, mimetype='image/jpeg')


@app.route('/stream.mjpg')
def stream_mjpg():
    if cv2 is None:
        return jsonify({'ok': False, 'error': 'camera disabled: opencv not installed'}), 501
    def generate():
        while not stop_event.is_set():
            with frame_lock:
                frame = last_frame
            if frame:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
            time.sleep(0.05)
    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')


@app.route('/assets/<path:filename>')
def assets(filename):
    return send_from_directory('assets', filename)


@app.route('/<path:filename>')
def static_files(filename):
    """Serve static web files (index.html, app.js, style.css, etc.)"""
    # Check web/ subdirectory first, then current directory
    for base in ['web', '.']:
        path = os.path.join(base, filename)
        if os.path.exists(path) and os.path.isfile(path):
            return send_from_directory(base, filename)
    return '', 404


@app.route('/status')
def status():
    with frame_lock:
        data = last_detection if last_detection else {}
    return jsonify({'ok': True, 'last': data, 'camera_running': camera_running})


@app.route('/camera/start', methods=['POST'])
def camera_start():
    if cv2 is None:
        return jsonify({'ok': False, 'error': 'camera disabled: opencv not installed'}), 501
    started = start_camera()
    return jsonify({'ok': True, 'started': started, 'camera_running': camera_running})


@app.route('/camera/stop', methods=['POST'])
def camera_stop():
    stop_camera()
    return jsonify({'ok': True, 'camera_running': camera_running})


@app.route('/test', methods=['POST'])
def api_test():
    if email_server is None:
        return jsonify({'ok': False, 'error': 'Email server helpers not available'}), 500
    payload = request.get_json() or {}
    cfg = payload.get('email', {})
    try:
        with email_server.smtp_connect(cfg):
            pass
        return jsonify({'ok': True})
    except smtplib.SMTPAuthenticationError:
        return jsonify({'ok': False, 'error': 'Authentication failed — wrong email or app password'})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)})


@app.route('/send', methods=['POST'])
def api_send():
    if email_server is None:
        return jsonify({'ok': False, 'error': 'Email server helpers not available'}), 500
    payload = request.get_json() or {}
    cfg = payload.get('email', {})
    participants = payload.get('participants', [])
    qr_dir = payload.get('qr_dir', 'qr_out')

    if not participants:
        return jsonify({'ok': False, 'error': 'No participants provided'}), 400

    results = []
    for p in participants:
        name = p.get('name', '')
        email = p.get('email', '')
        if not email or '@' not in email:
            results.append({'ok': False, 'name': name, 'email': email, 'error': 'Invalid email'})
            continue
        r = email_server.send_one(cfg, email, name, qr_dir)
        results.append(r)
    return jsonify({'ok': True, 'results': results})


def start_camera_thread():
    t = threading.Thread(target=camera_loop, daemon=True)
    t.start()
    return t


def _stop():
    stop_event.set()
    camera_stop_event.set()


atexit.register(_stop)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
