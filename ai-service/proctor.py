import os
import warnings
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['GLOG_minloglevel']      = '3'
warnings.filterwarnings('ignore', category=UserWarning, module='google.protobuf')
warnings.filterwarnings('ignore')

import cv2
import mediapipe as mp
import numpy as np
import time
import json
from datetime import datetime

cv2.setNumThreads(os.cpu_count())

# ── MediaPipe Face Mesh ───────────────────
mp_face_mesh = mp.solutions.face_mesh
face_mesh    = mp_face_mesh.FaceMesh(
    max_num_faces=2,
    refine_landmarks=True,
    min_detection_confidence=0.6,
    min_tracking_confidence=0.6
)

# ── DNN Face Detector (for face count) ───────────────────
net = cv2.dnn.readNetFromCaffe(
    "models/deploy.prototxt",
    "models/res10_300x300_ssd_iter_140000.caffemodel"
)

# ── MediaPipe Eye Landmark Indices ───────────────────────
LEFT_EYE_TOP     = [386, 387, 388, 390]
LEFT_EYE_BOTTOM  = [374, 373, 372, 380]
LEFT_EYE_LEFT    = 263
LEFT_EYE_RIGHT   = 362
RIGHT_EYE_TOP    = [159, 160, 161, 163]
RIGHT_EYE_BOTTOM = [145, 144, 143, 153]
RIGHT_EYE_LEFT   = 133
RIGHT_EYE_RIGHT  = 33

# Iris centers (MediaPipe 478-point model)
LEFT_IRIS_CENTER  = 473
RIGHT_IRIS_CENTER = 468

# Gaze thresholds for iris method
GAZE_LEFT_THRESHOLD  = 0.43
GAZE_RIGHT_THRESHOLD = 0.57

# ── Session Setup ────────────────────────────────────────
SESSION_ID = datetime.now().strftime("session_%Y%m%d_%H%M%S")
FLAGS_DIR  = os.path.join("flags", SESSION_ID)
os.makedirs(FLAGS_DIR, exist_ok=True)

session_report = {
    "session_id" : SESSION_ID,
    "start_time" : datetime.now().isoformat(),
    "flags"      : []
}

flag_counter     = 0
last_alert_times = {}

# ── Constants ────────────────────────────────────────────
EAR_THRESHOLD        = 0.15
EAR_CONSEC_FRAMES    = 8
YAW_OFFSET           = 0.0
PITCH_OFFSET         = 0.0
YAW_THRESHOLD        = 18.0   # degrees left/right
PITCH_THRESHOLD      = 999.0   # degrees up/down
SUSPICIOUS_TIME      = 2.5
COOLDOWN_TIME        = 3.0

# ── State ────────────────────────────────────────────────
ear_counter     = 0
gaze_start_time = None
last_gaze       = "CENTER"

# ── Calibration State ────────────────────────────────────
calibration_frames    = 0
calibration_yaw_sum   = 0.0
calibration_pitch_sum = 0.0
is_calibrated         = False

# ── Helpers ──────────────────────────────────────────────
def get_landmark_point(landmarks, index, w, h):
    lm = landmarks[index]
    return np.array([lm.x * w, lm.y * h])

def eye_aspect_ratio(landmarks, top_ids, bottom_ids, left_id, right_id, w, h):
    top_pts    = np.array([get_landmark_point(landmarks, i, w, h) for i in top_ids])
    bottom_pts = np.array([get_landmark_point(landmarks, i, w, h) for i in bottom_ids])
    left_pt    = get_landmark_point(landmarks, left_id,  w, h)
    right_pt   = get_landmark_point(landmarks, right_id, w, h)

    vertical   = np.mean(np.linalg.norm(top_pts - bottom_pts, axis=1))
    horizontal = np.linalg.norm(right_pt - left_pt)

    if horizontal == 0:
        return 0.0
    return vertical / horizontal

def get_iris_gaze(landmarks, iris_id, left_id, right_id, w, h):
    iris  = get_landmark_point(landmarks, iris_id,  w, h)
    left  = get_landmark_point(landmarks, left_id,  w, h)
    right = get_landmark_point(landmarks, right_id, w, h)

    eye_width = np.linalg.norm(right - left)
    if eye_width == 0:
        return None

    # Swapped for MediaPipe coordinate system
    ratio = (iris[0] - right[0]) / eye_width
    return ratio

def get_head_pose_vector(landmarks, w, h):
    if not landmarks:
        return 0.0, 0.0

    # Get 3D coordinates from landmarks
    p_right_eye = np.array([landmarks[33].x, landmarks[33].y, landmarks[33].z])
    p_left_eye  = np.array([landmarks[263].x, landmarks[263].y, landmarks[263].z])
    p_nose      = np.array([landmarks[1].x, landmarks[1].y, landmarks[1].z])
    p_chin      = np.array([landmarks[152].x, landmarks[152].y, landmarks[152].z])

    # Horizontal axis (right eye to left eye)
    v_x = p_left_eye - p_right_eye
    norm_x = np.linalg.norm(v_x)
    if norm_x == 0:
        return 0.0, 0.0
    u_x = v_x / norm_x

    # Vertical vector (nose to chin)
    v_y_temp = p_chin - p_nose

    # Normal vector (orthogonal to face, pointing towards camera)
    v_z = np.cross(u_x, v_y_temp)
    norm_z = np.linalg.norm(v_z)
    if norm_z == 0:
        return 0.0, 0.0
    u_z = v_z / norm_z
    if u_z[2] > 0:
        u_z = -u_z

    # Extract yaw and pitch directly using trigonometry
    yaw = np.arctan2(u_z[0], -u_z[2])
    pitch = np.arctan2(u_z[1], -u_z[2])

    # Convert to degrees
    yaw = np.degrees(yaw)
    pitch = np.degrees(pitch)
    
    return yaw, pitch

def can_fire(alert_type):
    now = time.time()
    if alert_type not in last_alert_times:
        return True
    return (now - last_alert_times[alert_type]) > COOLDOWN_TIME

def save_flag(frame, alert_type, detail="", ear=None, yaw=None, pitch=None):
    global flag_counter
    if not can_fire(alert_type):
        return

    flag_counter += 1
    last_alert_times[alert_type] = time.time()

    timestamp  = datetime.now().strftime("%H-%M-%S")
    flag_id    = f"flag_{flag_counter:03d}"
    image_name = f"{flag_id}_{timestamp}_{alert_type}.jpg"
    image_path = os.path.join(FLAGS_DIR, image_name)

    flagged_frame = frame.copy()
    cv2.putText(flagged_frame, f"FLAG: {alert_type}", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
    cv2.putText(flagged_frame, timestamp, (10, 60),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 1)
    cv2.imwrite(image_path, flagged_frame)

    flag_entry = {
        "flag_id"    : flag_id,
        "timestamp"  : datetime.now().isoformat(),
        "alert_type" : alert_type,
        "detail"     : detail,
        "image_path" : image_path,
        "ear_value"  : round(ear,   3) if ear   is not None else None,
        "yaw_degrees": round(yaw,   2) if yaw   is not None else None,
        "pitch_degrees": round(pitch, 2) if pitch is not None else None,
        "ai_verdict" : None,
        "ai_reason"  : None
    }

    session_report["flags"].append(flag_entry)
    report_path = os.path.join(FLAGS_DIR, "session_report.json")
    with open(report_path, "w") as f:
        json.dump(session_report, f, indent=2)

    print(f"[{timestamp}] [!] {alert_type} - {detail} -> saved {image_name}")

def end_session():
    session_report["end_time"]    = datetime.now().isoformat()
    session_report["total_flags"] = flag_counter

    report_path = os.path.join(FLAGS_DIR, "session_report.json")
    with open(report_path, "w") as f:
        json.dump(session_report, f, indent=2)

    print(f"\n=== Session ended ===")
    print(f"   Total flags : {flag_counter}")
    print(f"   Report saved: {report_path}")
    print(f"   Run review.py to get AI verdicts.\n")

# ── Main Loop ────────────────────────────────────────────
cap = cv2.VideoCapture(0)

# Camera warmup (give hardware sensor time to initialize and adjust exposure)
print("Warming up camera...")
for _ in range(10):
    cap.read()
    time.sleep(0.05)

print("Starting proctoring session... Press Q to quit.\n")

session_start_time = time.time()
GRACE_PERIOD       = 2.0  # seconds grace period for startup flags

try:
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        yaw = None
        pitch = None

        h, w      = frame.shape[:2]
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        status_text  = ""
        status_color = (0, 255, 0)
        current_gaze = "CENTER"
        current_ear  = None

        # ── Face Count (DNN) ─────────────────────────────
        blob = cv2.dnn.blobFromImage(
            cv2.resize(frame, (300, 300)), 1.0,
            (300, 300), (104.0, 177.0, 123.0)
        )
        net.setInput(blob)
        detections = net.forward()
        face_count = sum(
            1 for i in range(detections.shape[2])
            if detections[0, 0, i, 2] > 0.6
        )

        # ── MediaPipe EAR + Iris Gaze ────────────────────────────
        iris_gaze = "CENTER"
        mp_results = face_mesh.process(rgb_frame)

        landmarks = None
        if mp_results.multi_face_landmarks:
            landmarks = mp_results.multi_face_landmarks[0].landmark

        if landmarks is not None:
            # ── EAR ─────────────────────────────────────────────
            left_ear  = eye_aspect_ratio(
                landmarks,
                LEFT_EYE_TOP, LEFT_EYE_BOTTOM,
                LEFT_EYE_LEFT, LEFT_EYE_RIGHT, w, h
            )
            right_ear = eye_aspect_ratio(
                landmarks,
                RIGHT_EYE_TOP, RIGHT_EYE_BOTTOM,
                RIGHT_EYE_LEFT, RIGHT_EYE_RIGHT, w, h
            )
            current_ear = (left_ear + right_ear) / 2.0

            cv2.putText(frame, f"EAR: {current_ear:.2f}", (10, h - 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)

            if current_ear < EAR_THRESHOLD:
                ear_counter += 1
                if ear_counter >= EAR_CONSEC_FRAMES:
                    save_flag(frame, "EYES_CLOSED",
                            f"EAR={current_ear:.2f}", ear=current_ear)
                    status_text  = "ALERT: Eyes closed!"
                    status_color = (0, 0, 255)
                    cv2.putText(frame, "EYES CLOSED", (10, 90),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            else:
                ear_counter = 0

            # ── Iris Gaze ────────────────────────────────────────
            left_ratio  = get_iris_gaze(landmarks, LEFT_IRIS_CENTER,
                                        LEFT_EYE_LEFT, LEFT_EYE_RIGHT, w, h)
            right_ratio = get_iris_gaze(landmarks, RIGHT_IRIS_CENTER,
                                        RIGHT_EYE_LEFT, RIGHT_EYE_RIGHT, w, h)

            valid = [r for r in [left_ratio, right_ratio] if r is not None]
            if valid:
                avg_ratio = sum(valid) / len(valid)
                if avg_ratio < GAZE_LEFT_THRESHOLD:
                    iris_gaze = "LEFT"
                elif avg_ratio > GAZE_RIGHT_THRESHOLD:
                    iris_gaze = "RIGHT"
                else:
                    iris_gaze = "CENTER"

            # ── Head Gaze Vector ─────────────────────────────────
            raw_yaw, raw_pitch = get_head_pose_vector(landmarks, w, h)
            
            if not is_calibrated:
                calibration_frames += 1
                calibration_yaw_sum += raw_yaw
                calibration_pitch_sum += raw_pitch
                
                status_text = f"Calibrating... {calibration_frames}/15"
                status_color = (0, 255, 255) # Cyan HUD during calibration
                
                if calibration_frames >= 15:
                    YAW_OFFSET = calibration_yaw_sum / 15.0
                    PITCH_OFFSET = calibration_pitch_sum / 15.0
                    is_calibrated = True
                    print(f"\n[Calibration Complete] Dynamic Offsets set to: YAW={YAW_OFFSET:.1f}, PITCH={PITCH_OFFSET:.1f}\n")
                
                yaw, pitch = 0.0, 0.0
            else:
                yaw = raw_yaw - YAW_OFFSET
                pitch = raw_pitch - PITCH_OFFSET
        else:
            ear_counter = 0

        cv2.putText(frame, f"Iris: {iris_gaze}", (10, h - 80),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)

        # ── Combined Gaze Decision ───────────────────────────────
        if yaw is not None:
            corrected_yaw = yaw - YAW_OFFSET

            if corrected_yaw < -YAW_THRESHOLD:
                head_gaze = "LEFT"
            elif corrected_yaw > YAW_THRESHOLD:
                head_gaze = "RIGHT"
            else:
                head_gaze = "CENTER"

            # Either head OR eyes looking away = suspicious
            if head_gaze != "CENTER":
                current_gaze = head_gaze
                signal = "HEAD"
            elif iris_gaze != "CENTER":
                current_gaze = iris_gaze
                signal = "EYES"
            else:
                current_gaze = "CENTER"
                signal = ""

            cv2.putText(frame, f"Head: {head_gaze} (Y:{yaw:.1f}, P:{pitch:.1f})", (10, h - 100),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)
            cv2.putText(frame, f"Gaze: {current_gaze} {signal}",
                        (10, h - 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)

            if current_gaze != "CENTER":
                if last_gaze != current_gaze:
                    gaze_start_time = time.time()
                    last_gaze       = current_gaze
                    print(f"[Gaze] Started tracking deviation to {current_gaze} via {signal}...")
                
                if gaze_start_time is not None:
                    held_duration = time.time() - gaze_start_time
                    cv2.putText(frame, f"Hold: {held_duration:.1f}s / {SUSPICIOUS_TIME}s", (10, h - 120),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)
                    
                    if held_duration > SUSPICIOUS_TIME:
                        save_flag(
                            frame,
                            f"GAZE_{current_gaze}",
                            f"signal={signal} yaw={yaw:.1f}deg iris={iris_gaze}",
                            yaw=yaw, pitch=pitch
                        )
                        status_text  = f"ALERT: Looking {current_gaze} ({signal})!"
                        status_color = (0, 0, 255)
            else:
                gaze_start_time = None
                last_gaze       = "CENTER"

        # ── Face Count Alerts ────────────────────────────
        if face_count == 0:
            if time.time() - session_start_time > GRACE_PERIOD:
                save_flag(frame, "NO_FACE", "no face in frame")
                status_text  = "ALERT: No face detected!"
                status_color = (0, 0, 255)
            else:
                status_text  = "Initializing camera..."
                status_color = (0, 255, 255)
        elif face_count > 1:
            save_flag(frame, "MULTIPLE_FACES",
                      f"{face_count} faces detected")
            status_text  = f"ALERT: {face_count} faces!"
            status_color = (0, 0, 255)
        elif status_text == "":
            status_text  = "OK: All clear"
            status_color = (0, 255, 0)

        # ── HUD ──────────────────────────────────────────
        cv2.rectangle(frame, (0, 0), (w, 45), (0, 0, 0), -1)
        cv2.putText(frame, status_text, (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, status_color, 2)
        cv2.putText(frame,
                    f"Flags: {flag_counter}  |  Session: {SESSION_ID}",
                    (10, h - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1)

        cv2.imshow("Proctor Feed", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

except KeyboardInterrupt:
    print("\nSession stopped by user (Ctrl+C).")
finally:
    end_session()
    face_mesh.close()
    cap.release()
    cv2.destroyAllWindows()