import io
import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from app import app

client = TestClient(app)

def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["service"] == "Proctor AI Service"

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_analyze_endpoint_no_face():
    # Create black 640x480 JPEG image
    blank = np.zeros((480, 640, 3), dtype=np.uint8)
    _, encoded = cv2.imencode(".jpg", blank)
    image_bytes = encoded.tobytes()

    files = {"frame": ("frame.jpg", io.BytesIO(image_bytes), "image/jpeg")}
    data = {"session_id": "test_fastapi_session"}

    response = client.post("/analyze", files=files, data=data)
    assert response.status_code == 200
    res = response.json()
    assert res["session_id"] == "test_fastapi_session"
    assert res["face_count"] == 0
    assert "NO_FACE" in res["alerts"]

def test_end_session_endpoint():
    session_id = "test_end_session_flow"
    # Call end session directly
    response = client.post(f"/session/{session_id}/end")
    assert response.status_code == 200
    assert response.json()["status"] == "processing"
