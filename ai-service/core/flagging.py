import cv2
import os
import json
import time
from datetime import datetime

class FlagManager:
    def __init__(self, session_id, flags_root="flags"):
        self.session_id  = session_id
        self.flags_dir   = os.path.join(flags_root, session_id)
        self.flag_counter = 0
        self.last_alert_times = {}
        self.flags       = []
        os.makedirs(self.flags_dir, exist_ok=True)

    def can_fire(self, alert_type, cooldown=3.0):
        now  = time.time()
        last = self.last_alert_times.get(alert_type, 0)
        return (now - last) > cooldown

    def save(self, frame, alert_type, detail="",
             ear=None, yaw=None, pitch=None):
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
        return entry

    def _save_report(self):
        report = {
            "session_id": self.session_id,
            "flags"     : self.flags
        }
        path = os.path.join(self.flags_dir, "session_report.json")
        with open(path, "w") as f:
            json.dump(report, f, indent=2)

    def end(self):
        report = {
            "session_id" : self.session_id,
            "end_time"   : datetime.now().isoformat(),
            "total_flags": self.flag_counter,
            "flags"      : self.flags
        }
        path = os.path.join(self.flags_dir, "session_report.json")
        with open(path, "w") as f:
            json.dump(report, f, indent=2)
        return report