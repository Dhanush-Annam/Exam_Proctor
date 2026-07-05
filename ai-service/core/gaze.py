import cv2
import numpy as np
import torch
from l2cs import Pipeline

LEFT_EYE_LEFT    = 263
LEFT_EYE_RIGHT   = 362
RIGHT_EYE_LEFT   = 133
RIGHT_EYE_RIGHT  = 33
LEFT_IRIS_CENTER  = 473
RIGHT_IRIS_CENTER = 468

GAZE_LEFT_THRESHOLD  = 0.43
GAZE_RIGHT_THRESHOLD = 0.57
YAW_OFFSET           = -4.0
YAW_THRESHOLD        = 18.0

def get_point(landmarks, index, w, h):
    lm = landmarks[index]
    return np.array([lm.x * w, lm.y * h])

def get_iris_ratio(landmarks, iris_id, left_id, right_id, w, h):
    iris  = get_point(landmarks, iris_id,  w, h)
    left  = get_point(landmarks, left_id,  w, h)
    right = get_point(landmarks, right_id, w, h)
    width = np.linalg.norm(right - left)
    if width == 0:
        return None
    return (iris[0] - right[0]) / width

class GazeDetector:
    def __init__(self, weights_path):
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.pipeline = Pipeline(
            weights=weights_path,
            arch='ResNet50',
            device=device
        )

    def get_iris_gaze(self, landmarks, w, h):
        left_ratio  = get_iris_ratio(landmarks, LEFT_IRIS_CENTER,
                                     LEFT_EYE_LEFT, LEFT_EYE_RIGHT, w, h)
        right_ratio = get_iris_ratio(landmarks, RIGHT_IRIS_CENTER,
                                     RIGHT_EYE_LEFT, RIGHT_EYE_RIGHT, w, h)
        valid = [r for r in [left_ratio, right_ratio] if r is not None]
        if not valid:
            return "CENTER"
        avg = sum(valid) / len(valid)
        if avg < GAZE_LEFT_THRESHOLD:
            return "LEFT"
        elif avg > GAZE_RIGHT_THRESHOLD:
            return "RIGHT"
        return "CENTER"

    def get_head_gaze(self, frame):
        yaw, pitch = None, None
        head_gaze  = "CENTER"
        try:
            result = self.pipeline.step(frame)
            if result and len(result.yaw) > 0:
                yaw   = float(np.degrees(result.yaw[0]))
                pitch = float(np.degrees(result.pitch[0]))
                corrected = yaw - YAW_OFFSET
                if corrected < -YAW_THRESHOLD:
                    head_gaze = "LEFT"
                elif corrected > YAW_THRESHOLD:
                    head_gaze = "RIGHT"
        except:
            pass
        return head_gaze, yaw, pitch

    def process(self, frame, rgb_frame, landmarks):
        h, w = frame.shape[:2]

        iris_gaze            = "CENTER"
        head_gaze, yaw, pitch = self.get_head_gaze(frame)

        if landmarks:
            iris_gaze = self.get_iris_gaze(landmarks, w, h)

        # Combined decision
        if head_gaze != "CENTER":
            return head_gaze, "HEAD", iris_gaze, head_gaze, yaw, pitch
        elif iris_gaze != "CENTER":
            return iris_gaze, "EYES", iris_gaze, head_gaze, yaw, pitch
        return "CENTER", "", iris_gaze, head_gaze, yaw, pitch