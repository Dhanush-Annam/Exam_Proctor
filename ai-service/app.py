import os
import warnings
import json
from pathlib import Path
import google.generativeai as genai
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
gaze_detector = GazeDetector(weights_path="models/L2CSNet_gaze360.pkl")

# ── Session State ────────────────────────────────────────
sessions      = {}
sessions_lock = threading.Lock()

def get_session(session_id: str):
    with sessions_lock:
        if session_id not in sessions:
            sessions[session_id] = {
                "flag_manager": FlagManager(session_id),
                "ear_counter" : 0,
            }
        return sessions[session_id]

# ── Routes ───────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "message": "Proctor AI service running"}

@app.post("/analyze")
async def analyze(
    frame     : UploadFile = File(...),
    session_id: str        = Form(...)
):
    session     = get_session(session_id)
    flag_manager = session["flag_manager"]

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
    ear, is_closed, session["ear_counter"], landmarks = \
        ear_detector.process(rgb, session["ear_counter"])

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

@app.get("/session/{session_id}/report")
def get_report(session_id: str):
    import json
    path = os.path.join("flags", session_id, "session_report.json")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Session not found")
    with open(path) as f:
        return JSONResponse(content=json.load(f))

def run_review_and_callback(session_dir: Path, session_id: str):
    import urllib.request
    # 3. Configure Gemini and run the review script logic
    if GEMINI_API_KEY:
        genai.configure(api_key=GEMINI_API_KEY)
        report = process_session(session_dir, dry_run=False)
    else:
        report = process_session(session_dir, dry_run=True)
        
    # 4. Callback to backend
    try:
        backend_url = os.environ.get("BACKEND_URL", "http://localhost:3001")
        url = f"{backend_url}/api/proctor/session/{session_id}/review-complete"
        req = urllib.request.Request(
            url,
            data=json.dumps(report).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        with urllib.request.urlopen(req) as response:
            print(f"Callback response status: {response.status}")
    except Exception as e:
        print(f"Failed to send review callback to backend: {e}")

@app.post("/session/{session_id}/end")
def end_session(session_id: str, background_tasks: BackgroundTasks):
    # 1. End the active session if in memory to write the initial report
    with sessions_lock:
        session = sessions.get(session_id)
        if session:
            session["flag_manager"].end()
            del sessions[session_id]
            
    # 2. Check if the directory and report exist
    session_dir = Path("flags") / session_id
    report_path = session_dir / "session_report.json"
    if not report_path.exists():
        raise HTTPException(status_code=404, detail="Session report not found")
        
    # Schedule the Gemini review in the background
    background_tasks.add_task(run_review_and_callback, session_dir, session_id)
    
    return {"status": "processing", "message": "Post-exam AI review scheduled in background."}