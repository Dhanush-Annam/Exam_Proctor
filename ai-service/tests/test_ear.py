import pytest
import numpy as np
from core.ear import compute_ear, LEFT_EYE_TOP, LEFT_EYE_BOTTOM, LEFT_EYE_LEFT, LEFT_EYE_RIGHT

class MockLandmark:
    def __init__(self, x, y, z=0.0):
        self.x = x
        self.y = y
        self.z = z

def test_compute_ear_open_eyes():
    landmarks = [None] * 500
    w, h = 640, 480
    
    # Outer / inner corners with horizontal width = 50px
    landmarks[LEFT_EYE_LEFT]  = MockLandmark(100.0 / w, 200.0 / h)
    landmarks[LEFT_EYE_RIGHT] = MockLandmark(150.0 / w, 200.0 / h)

    # Top points at y = 190 (10px above baseline)
    for idx in LEFT_EYE_TOP:
        landmarks[idx] = MockLandmark(125.0 / w, 190.0 / h)

    # Bottom points at y = 210 (10px below baseline) -> vertical distance = 20px
    for idx in LEFT_EYE_BOTTOM:
        landmarks[idx] = MockLandmark(125.0 / w, 210.0 / h)

    ear = compute_ear(landmarks, LEFT_EYE_TOP, LEFT_EYE_BOTTOM, LEFT_EYE_LEFT, LEFT_EYE_RIGHT, w, h)
    # vertical = 20, horizontal = 50 -> 20/50 = 0.40
    assert abs(ear - 0.40) < 0.01

def test_compute_ear_closed_eyes():
    landmarks = [None] * 500
    w, h = 640, 480
    
    landmarks[LEFT_EYE_LEFT]  = MockLandmark(100.0 / w, 200.0 / h)
    landmarks[LEFT_EYE_RIGHT] = MockLandmark(150.0 / w, 200.0 / h)

    # Eyelids almost touching -> vertical distance = 2px
    for idx in LEFT_EYE_TOP:
        landmarks[idx] = MockLandmark(125.0 / w, 199.0 / h)

    for idx in LEFT_EYE_BOTTOM:
        landmarks[idx] = MockLandmark(125.0 / w, 201.0 / h)

    ear = compute_ear(landmarks, LEFT_EYE_TOP, LEFT_EYE_BOTTOM, LEFT_EYE_LEFT, LEFT_EYE_RIGHT, w, h)
    # vertical = 2, horizontal = 50 -> 2/50 = 0.04
    assert ear < 0.10
