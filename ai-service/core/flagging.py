import cv2
import os
import json
import time
from datetime import datetime
import redis

redis_url = os.environ.get("REDIS_URL")
redis_host = os.environ.get("REDIS_HOST")
redis_port = int(os.environ.get("REDIS_PORT", 6379))
redis_client = None

if redis_url:
    try:
        redis_client = redis.Redis.from_url(redis_url, decode_responses=True)
        redis_client.ping()
        print(f"[Redis] Connected successfully via REDIS_URL")
    except Exception as e:
        print(f"[Redis] Connection error via REDIS_URL: {e}. Falling back to local in-memory store.")
        redis_client = None
elif redis_host:
    try:
        redis_client = redis.Redis(host=redis_host, port=redis_port, db=0, decode_responses=True)
        redis_client.ping()
        print(f"[Redis] Connected successfully to {redis_host}:{redis_port}")
    except Exception as e:
        print(f"[Redis] Connection error to {redis_host}:{redis_port}: {e}. Falling back to local in-memory store.")
        redis_client = None

class FlagManager:
    def __init__(self, session_id, flags_root="flags"):
        self.session_id  = session_id
        self.flags_dir   = os.path.join(flags_root, session_id)
        os.makedirs(self.flags_dir, exist_ok=True)
        self._load_state()

    def _load_state(self):
        global redis_client
        if redis_client:
            try:
                state_json = redis_client.get(f"proctor:session:{self.session_id}:state")
                if state_json:
                    state = json.loads(state_json)
                    self.flag_counter = state.get("flag_counter", 0)
                    self.last_alert_times = state.get("last_alert_times", {})
                    self.flags = state.get("flags", [])
                    return
            except Exception as e:
                print(f"[Redis] Error loading state for {self.session_id}: {e}")
        
        self.flag_counter = 0
        self.last_alert_times = {}
        self.flags = []

    def _save_state(self):
        global redis_client
        if redis_client:
            try:
                state = {
                    "flag_counter": self.flag_counter,
                    "last_alert_times": self.last_alert_times,
                    "flags": self.flags
                }
                redis_client.setex(f"proctor:session:{self.session_id}:state", 86400, json.dumps(state))
            except Exception as e:
                print(f"[Redis] Error saving state for {self.session_id}: {e}")

    def can_fire(self, alert_type, cooldown=3.0):
        self._load_state()
        now  = time.time()
        last = self.last_alert_times.get(alert_type, 0)
        return (now - last) > cooldown

    def save(self, frame, alert_type, detail="",
             ear=None, yaw=None, pitch=None):
        self._load_state()
        if not self.can_fire(alert_type):
            return None

        self.flag_counter += 1
        self.last_alert_times[alert_type] = time.time()

        timestamp  = datetime.now().strftime("%H-%M-%S")
        flag_id    = f"flag_{self.flag_counter:03d}"
        image_name = f"{flag_id}_{timestamp}_{alert_type}.jpg"
        image_path = os.path.join(self.flags_dir, image_name)

        flagged = frame.copy()
        cv2.putText(flagged, f"FLAG: {alert_type}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
        cv2.putText(flagged, timestamp, (10, 60),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 1)
        cv2.imwrite(image_path, flagged)

        # Upload to Supabase Storage if configured
        supabase_url = os.environ.get("SUPABASE_URL")
        supabase_key = os.environ.get("SUPABASE_KEY")
        supabase_bucket = os.environ.get("SUPABASE_BUCKET", "proctor-screenshots")

        if supabase_url and supabase_key:
            try:
                supabase_url = supabase_url.rstrip("/")
                success, encoded_img = cv2.imencode('.jpg', flagged)
                if success:
                    img_bytes = encoded_img.tobytes()
                    destination_path = f"{self.session_id}/{image_name}"
                    upload_url = f"{supabase_url}/storage/v1/object/{supabase_bucket}/{destination_path}"
                    
                    import urllib.request
                    req = urllib.request.Request(
                        upload_url,
                        data=img_bytes,
                        headers={
                            "apikey": supabase_key,
                            "Authorization": f"Bearer {supabase_key}",
                            "Content-Type": "image/jpeg"
                        },
                        method="POST"
                    )
                    with urllib.request.urlopen(req) as response:
                        if response.status in [200, 201]:
                            private_url = f"{supabase_url}/storage/v1/object/{supabase_bucket}/{destination_path}"
                            image_path = private_url
                            print(f"[Supabase] Screenshot uploaded successfully to private storage: {private_url}")
            except Exception as e:
                import urllib.error
                if isinstance(e, urllib.error.HTTPError):
                    try:
                        err_body = e.read().decode('utf-8')
                        print(f"[Supabase] Screenshot upload failed: {e} - Response: {err_body}")
                    except Exception:
                        print(f"[Supabase] Screenshot upload failed: {e}")
                else:
                    print(f"[Supabase] Screenshot upload failed: {e}")

        entry = {
            "flag_id"      : flag_id,
            "timestamp"    : datetime.now().isoformat(),
            "alert_type"   : alert_type,
            "detail"       : detail,
            "image_path"   : image_path,
            "ear_value"    : round(ear,   3) if ear   is not None else None,
            "yaw_degrees"  : round(yaw,   2) if yaw   is not None else None,
            "pitch_degrees": round(pitch, 2) if pitch is not None else None,
            "ai_verdict"   : None,
            "ai_reason"    : None
        }
        self.flags.append(entry)
        self._save_report()
        self._save_state()
        return entry

    def _upload_report_to_supabase(self, report):
        supabase_url = os.environ.get("SUPABASE_URL")
        supabase_key = os.environ.get("SUPABASE_KEY")
        supabase_bucket = os.environ.get("SUPABASE_BUCKET", "proctor-screenshots")

        if supabase_url and supabase_key:
            try:
                supabase_url = supabase_url.rstrip("/")
                report_bytes = json.dumps(report, indent=2).encode('utf-8')
                upload_url = f"{supabase_url}/storage/v1/object/{supabase_bucket}/{self.session_id}/session_report.json"
                
                import urllib.request
                req = urllib.request.Request(
                    upload_url,
                    data=report_bytes,
                    headers={
                        "apikey": supabase_key,
                        "Authorization": f"Bearer {supabase_key}",
                        "Content-Type": "application/json"
                    },
                    method="POST"
                )
                with urllib.request.urlopen(req) as response:
                    if response.status in [200, 201]:
                        print(f"[Supabase] Session report uploaded successfully.")
            except Exception as e:
                # If it already exists, try putting/overwriting it (PUT method)
                try:
                    import urllib.request
                    req = urllib.request.Request(
                        upload_url,
                        data=report_bytes,
                        headers={
                            "apikey": supabase_key,
                            "Authorization": f"Bearer {supabase_key}",
                            "Content-Type": "application/json"
                        },
                        method="PUT"
                    )
                    with urllib.request.urlopen(req) as response:
                        if response.status in [200, 201]:
                            print(f"[Supabase] Session report updated successfully (PUT).")
                except Exception as put_err:
                    import urllib.error
                    if isinstance(put_err, urllib.error.HTTPError):
                        try:
                            err_body = put_err.read().decode('utf-8')
                            print(f"[Supabase] Session report upload and update failed: {put_err} - Response: {err_body}")
                        except Exception:
                            print(f"[Supabase] Session report upload and update failed: {put_err}")
                    else:
                        print(f"[Supabase] Session report upload and update failed: {put_err}")

    def _save_report(self):
        report = {
            "session_id": self.session_id,
            "flags"     : self.flags
        }
        path = os.path.join(self.flags_dir, "session_report.json")
        with open(path, "w") as f:
            json.dump(report, f, indent=2)
        self._upload_report_to_supabase(report)

    def end(self):
        self._load_state()
        report = {
            "session_id" : self.session_id,
            "end_time"   : datetime.now().isoformat(),
            "total_flags": self.flag_counter,
            "flags"      : self.flags
        }
        path = os.path.join(self.flags_dir, "session_report.json")
        with open(path, "w") as f:
            json.dump(report, f, indent=2)
        self._upload_report_to_supabase(report)

        # Clear Redis state since session has ended
        global redis_client
        if redis_client:
            try:
                redis_client.delete(f"proctor:session:{self.session_id}:state")
                redis_client.delete(f"proctor:session:{self.session_id}:ear_counter")
            except Exception as e:
                print(f"[Redis] Error clearing state for {self.session_id}: {e}")

        return report