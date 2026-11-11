import os
import shutil
import tempfile
import numpy as np
import pytest
from core.flagging import FlagManager

@pytest.fixture
def temp_flags_dir():
    temp_dir = tempfile.mkdtemp()
    yield temp_dir
    shutil.rmtree(temp_dir, ignore_errors=True)

def test_flag_manager_save_and_end(temp_flags_dir):
    session_id = "test_session_flagging"
    mgr = FlagManager(session_id, flags_root=temp_flags_dir)

    # Empty 640x480 frame
    frame = np.zeros((480, 640, 3), dtype=np.uint8)

    # First save should succeed
    entry = mgr.save(frame, "NO_FACE", "no face in frame")
    assert entry is not None
    assert entry["alert_type"] == "NO_FACE"
    assert entry["flag_id"] == "flag_001"

    # Immediate second save of same alert should be blocked by cooldown
    entry_dup = mgr.save(frame, "NO_FACE", "no face in frame")
    assert entry_dup is None

    # End session writes report
    report = mgr.end()
    assert report["session_id"] == session_id
    assert report["total_flags"] == 1
    assert len(report["flags"]) == 1
    assert report["flags"][0]["alert_type"] == "NO_FACE"

    # Verify report file exists
    report_file = os.path.join(temp_flags_dir, session_id, "session_report.json")
    assert os.path.exists(report_file)
