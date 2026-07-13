import pytest
import numpy as np
from core.gaze import GazeDetector

# Mock Landmark class structure matching MediaPipe
class MockLandmark:
    def __init__(self, x, y, z=0.0):
        self.x = x
        self.y = y
        self.z = z

def test_iris_gaze_center():
    detector = GazeDetector()
    
    # Setup coordinates where pupil is exactly centered in the eye socket width
    landmarks = [None] * 500
    # Left eye: LEFT_EYE_LEFT = 263, LEFT_EYE_RIGHT = 362, LEFT_IRIS_CENTER = 473
    landmarks[263] = MockLandmark(0.60, 0.50) # Left eye outer corner
    landmarks[362] = MockLandmark(0.50, 0.50) # Left eye inner corner
    # Width is 0.10. Middle x coordinate is 0.55
    landmarks[473] = MockLandmark(0.55, 0.50) # Iris center (exactly in the middle of left/right)
    
    # Right eye: RIGHT_EYE_LEFT = 133, RIGHT_EYE_RIGHT = 33, RIGHT_IRIS_CENTER = 468
    landmarks[133] = MockLandmark(0.40, 0.50)
    landmarks[33]  = MockLandmark(0.30, 0.50)
    # Width is 0.10. Middle x is 0.35
    landmarks[468] = MockLandmark(0.35, 0.50)

    # Under get_iris_ratio:
    # width = np.linalg.norm(right - left) = 0.10
    # ratio = (iris[0] - right[0]) / width
    # For left eye: (0.55 - 0.50) / 0.10 = 0.50 (in between 0.43 and 0.57 threshold -> CENTER)
    gaze = detector.get_iris_gaze(landmarks, w=640, h=480)
    assert gaze == "CENTER"

def test_iris_gaze_left():
    detector = GazeDetector()
    
    landmarks = [None] * 500
    # Left eye: LEFT_EYE_LEFT = 263, LEFT_EYE_RIGHT = 362, LEFT_IRIS_CENTER = 473
    landmarks[263] = MockLandmark(0.60, 0.50)
    landmarks[362] = MockLandmark(0.50, 0.50)
    # Move iris to the right side of screen (which is student's left eye corner/left gaze)
    # ratio = (0.52 - 0.50) / 0.10 = 0.20 (< 0.43 threshold -> LEFT)
    landmarks[473] = MockLandmark(0.52, 0.50)
    
    landmarks[133] = MockLandmark(0.40, 0.50)
    landmarks[33]  = MockLandmark(0.30, 0.50)
    landmarks[468] = MockLandmark(0.32, 0.50)

    gaze = detector.get_iris_gaze(landmarks, w=640, h=480)
    assert gaze == "LEFT"

def test_iris_gaze_right():
    detector = GazeDetector()
    
    landmarks = [None] * 500
    landmarks[263] = MockLandmark(0.60, 0.50)
    landmarks[362] = MockLandmark(0.50, 0.50)
    # Move iris closer to inner corner
    # ratio = (0.58 - 0.50) / 0.10 = 0.80 (> 0.57 threshold -> RIGHT)
    landmarks[473] = MockLandmark(0.58, 0.50)
    
    landmarks[133] = MockLandmark(0.40, 0.50)
    landmarks[33]  = MockLandmark(0.30, 0.50)
    landmarks[468] = MockLandmark(0.38, 0.50)

    gaze = detector.get_iris_gaze(landmarks, w=640, h=480)
    assert gaze == "RIGHT"
