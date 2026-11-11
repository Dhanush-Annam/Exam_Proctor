import os
import json
import shutil
import tempfile
from pathlib import Path
import pytest
from review import build_prompt, process_session

def test_build_prompt():
    flag = {
        "alert_type": "GAZE_LEFT",
        "detail": "signal=LEFT",
        "yaw_degrees": -22.5,
        "pitch_degrees": 2.1,
        "ear_value": 0.28
    }
    prompt = build_prompt(flag)
    assert "ALERT TYPE  : GAZE_LEFT" in prompt
    assert "Head yaw  : -22.5°" in prompt
    assert "HIGH_RISK" in prompt
    assert "FALSE_ALARM" in prompt

def test_process_session_dry_run():
    temp_dir = Path(tempfile.mkdtemp())
    try:
        session_id = "test_review_session"
        session_dir = temp_dir / session_id
        session_dir.mkdir(parents=True)

        report = {
            "session_id": session_id,
            "total_flags": 1,
            "flags": [
                {
                    "flag_id": "flag_001",
                    "alert_type": "NO_FACE",
                    "detail": "no face in frame",
                    "image_path": "nonexistent.jpg",
                    "ai_verdict": None,
                    "ai_reason": None
                }
            ]
        }
        with open(session_dir / "session_report.json", "w") as f:
            json.dump(report, f)

        res = process_session(session_dir, dry_run=True)
        assert res["session_id"] == session_id
        assert "flags" in res
        assert len(res["flags"]) == 1
        assert res["flags"][0]["ai_verdict"] == "SUSPICIOUS"
        assert "session_verdict" in res
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
