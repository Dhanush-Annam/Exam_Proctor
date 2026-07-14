import os
import warnings
import json
from pathlib import Path
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['GLOG_minloglevel']      = '3'
warnings.filterwarnings('ignore')

from dotenv import load_dotenv
load_dotenv()

import cv2
import numpy as np
import threading
from datetime import datetime
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse

from core.detector  import FaceDetector
from core.ear       import EARDetector
from core.gaze      import GazeDetector
from core.flagging  import FlagManager
from review import process_session, GEMINI_API_KEY

# ── App ──────────────────────────────────────────────────
app = FastAPI(
    title="Proctor AI Service",
    description="AI-powered exam proctoring microservice",
    version="1.0.0"
)

# ── Load Models Once at Startup ──────────────────────────
face_detector = FaceDetector(
    prototxt   ="models/deploy.prototxt",
    caffemodel ="models/res10_300x300_ssd_iter_140000.caffemodel"
)
ear_detector  = EARDetector(threshold=0.15, consec_frames=8)
gaze_detector = GazeDetector()

# ── Session State ────────────────────────────────────────
import redis

redis_url = os.environ.get("REDIS_URL")
redis_host = os.environ.get("REDIS_HOST")
redis_port = int(os.environ.get("REDIS_PORT", 6379))
redis_client = None

if redis_url:
    try:
        kwargs = {"decode_responses": True}
        if redis_url.startswith("rediss://"):
            kwargs["ssl_cert_reqs"] = "none"
        redis_client = redis.Redis.from_url(redis_url, **kwargs)
        redis_client.ping()
        print(f"[Redis] Connected successfully in app.py via REDIS_URL")
    except Exception as e:
        print(f"[Redis] Connection error in app.py via REDIS_URL: {e}. Falling back to in-memory fallback store.")
        redis_client = None
elif redis_host:
    try:
        redis_client = redis.Redis(host=redis_host, port=redis_port, db=0, decode_responses=True)
        redis_client.ping()
        print(f"[Redis] Connected successfully in app.py to {redis_host}:{redis_port}")
    except Exception as e:
        print(f"[Redis] Connection error in app.py to {redis_host}:{redis_port}: {e}. Falling back to in-memory fallback store.")
        redis_client = None

local_sessions = {}
local_sessions_lock = threading.Lock()

def get_ear_counter(session_id: str) -> int:
    global redis_client
    if redis_client:
        try:
            val = redis_client.get(f"proctor:session:{session_id}:ear_counter")
            if val is not None:
                return int(val)
        except Exception as e:
            print(f"[Redis] Error getting ear_counter: {e}")
    with local_sessions_lock:
        return local_sessions.get(session_id, {}).get("ear_counter", 0)

def set_ear_counter(session_id: str, count: int):
    global redis_client
    if redis_client:
        try:
            redis_client.setex(f"proctor:session:{session_id}:ear_counter", 86400, count)
            return
        except Exception as e:
            print(f"[Redis] Error setting ear_counter: {e}")
    with local_sessions_lock:
        if session_id not in local_sessions:
            local_sessions[session_id] = {}
        local_sessions[session_id]["ear_counter"] = count

# ── Routes ───────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "message": "Proctor AI service running"}

@app.post("/analyze")
async def analyze(
    frame     : UploadFile = File(...),
    session_id: str        = Form(...)
):
    flag_manager = FlagManager(session_id)
    ear_counter  = get_ear_counter(session_id)

    # Decode frame
    contents = await frame.read()
    npimg    = np.frombuffer(contents, np.uint8)
    img      = cv2.imdecode(npimg, cv2.IMREAD_COLOR)

    if img is None:
        raise HTTPException(status_code=400, detail="Could not decode frame")

    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    alerts     = []
    flag_saved = False

    saved_flags = []

    # ── Face Count ───────────────────────────────────────
    face_count = face_detector.count_faces(img)

    # ── EAR ──────────────────────────────────────────────
    ear, is_closed, new_ear_counter, landmarks = \
        ear_detector.process(rgb, ear_counter)
    
    set_ear_counter(session_id, new_ear_counter)

    if is_closed:
        alerts.append("EYES_CLOSED")
        entry = flag_manager.save(img, "EYES_CLOSED",
                                  f"EAR={ear:.2f}", ear=ear)
        if entry:
            flag_saved = True
            saved_flags.append(entry)

    # ── Gaze ─────────────────────────────────────────────
    gaze, signal, iris_gaze, head_gaze, yaw, pitch = \
        gaze_detector.process(img, rgb, landmarks)

    if gaze != "CENTER":
        alerts.append(f"GAZE_{gaze}")
        entry = flag_manager.save(img, f"GAZE_{gaze}",
                                  f"signal={signal}", yaw=yaw, pitch=pitch)
        if entry:
            flag_saved = True
            saved_flags.append(entry)

    # ── Face Alerts ───────────────────────────────────────
    if face_count == 0:
        alerts.append("NO_FACE")
        entry = flag_manager.save(img, "NO_FACE", "no face in frame")
        if entry:
            flag_saved = True
            saved_flags.append(entry)
    elif face_count > 1:
        alerts.append("MULTIPLE_FACES")
        entry = flag_manager.save(img, "MULTIPLE_FACES",
                                  f"{face_count} faces")
        if entry:
            flag_saved = True
            saved_flags.append(entry)

    return {
        "session_id" : session_id,
        "face_count" : face_count,
        "ear"        : round(ear, 3) if ear else None,
        "gaze"       : gaze,
        "signal"     : signal,
        "iris_gaze"  : iris_gaze,
        "head_gaze"  : head_gaze,
        "yaw"        : round(yaw,   2) if yaw   else None,
        "pitch"      : round(pitch, 2) if pitch else None,
        "alerts"     : alerts,
        "flag_saved" : flag_saved,
        "flag_count" : flag_manager.flag_counter,
        "saved_flags": saved_flags
    }

def ensure_local_report(session_id: str) -> bool:
    session_dir = Path("flags") / session_id
    report_path = session_dir / "session_report.json"
    if report_path.exists():
        return True

    # Try downloading from Supabase
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")
    supabase_bucket = os.environ.get("SUPABASE_BUCKET", "proctor-screenshots")

    if supabase_url and supabase_key:
        try:
            supabase_url = supabase_url.rstrip("/")
            download_url = f"{supabase_url}/storage/v1/object/{supabase_bucket}/{session_id}/session_report.json"
            import urllib.request
            req = urllib.request.Request(
                download_url,
                headers={
                    "apikey": supabase_key,
                    "Authorization": f"Bearer {supabase_key}"
                }
            )
            with urllib.request.urlopen(req) as response:
                if response.status == 200:
                    session_dir.mkdir(parents=True, exist_ok=True)
                    with open(report_path, "wb") as f:
                        f.write(response.read())
                    print(f"[Supabase] Downloaded session report for {session_id} from cloud storage")
                    return True
        except Exception as e:
            print(f"[Supabase] Failed to download session report for {session_id}: {e}")
    return False

@app.get("/session/{session_id}/report")
def get_report(session_id: str):
    import json
    ensure_local_report(session_id)
    path = os.path.join("flags", session_id, "session_report.json")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Session not found")
    with open(path) as f:
        return JSONResponse(content=json.load(f))

def run_review_and_callback(session_dir: Path, session_id: str):
    import urllib.request
    import hmac
    import hashlib
    # 3. Run the review script logic (review.py automatically handles Gemini Client initialization)
    if GEMINI_API_KEY:
        report = process_session(session_dir, dry_run=False)
    else:
        report = process_session(session_dir, dry_run=True)
        
    # 4. Callback to backend
    try:
        webhook_secret = os.environ.get("WEBHOOK_SECRET", "super-secret-webhook-key")
        payload_bytes = json.dumps(report, separators=(',', ':')).encode('utf-8')
        
        # Calculate HMAC SHA256 signature
        sig = hmac.new(
            webhook_secret.encode('utf-8'),
            payload_bytes,
            hashlib.sha256
        ).hexdigest()

        backend_url = os.environ.get("BACKEND_URL", "http://localhost:3001")
        url = f"{backend_url}/api/proctor/session/{session_id}/review-complete"
        
        req = urllib.request.Request(
            url,
            data=payload_bytes,
            headers={
                'Content-Type': 'application/json',
                'x-webhook-signature': sig
            },
            method='POST'
        )
        with urllib.request.urlopen(req) as response:
            print(f"Callback response status: {response.status}")
    except Exception as e:
        print(f"Failed to send review callback to backend: {e}")

@app.post("/session/{session_id}/end")
def end_session(session_id: str, background_tasks: BackgroundTasks):
    # 1. End the active session if in memory to write the initial report
    flag_manager = FlagManager(session_id)
    flag_manager.end()
    
    with local_sessions_lock:
        if session_id in local_sessions:
            del local_sessions[session_id]
            
    # 2. Check if the directory and report exist (checks local and pulls from Supabase if needed)
    if not ensure_local_report(session_id):
        raise HTTPException(status_code=404, detail="Session report not found")
        
    session_dir = Path("flags") / session_id
    # Schedule the Gemini review in the background
    background_tasks.add_task(run_review_and_callback, session_dir, session_id)
    
    return {"status": "processing", "message": "Post-exam AI review scheduled in background."}