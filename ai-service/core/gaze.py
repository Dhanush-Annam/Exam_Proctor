import cv2
import numpy as np

LEFT_EYE_LEFT    = 263
LEFT_EYE_RIGHT   = 362
RIGHT_EYE_LEFT   = 133
RIGHT_EYE_RIGHT  = 33
LEFT_IRIS_CENTER  = 473
RIGHT_IRIS_CENTER = 468

GAZE_LEFT_THRESHOLD  = 0.43
GAZE_RIGHT_THRESHOLD = 0.57
YAW_OFFSET           = 0.0
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
    def __init__(self, weights_path=None):
        # weights_path is kept as an optional legacy parameter to prevent breaking external calls
        pass

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

    def get_head_gaze_vector(self, landmarks, w, h):
        if not landmarks:
            return "CENTER", 0.0, 0.0

        # Get 3D coordinates from MediaPipe landmarks
        p_right_eye = np.array([landmarks[33].x, landmarks[33].y, landmarks[33].z])
        p_left_eye  = np.array([landmarks[263].x, landmarks[263].y, landmarks[263].z])
        p_nose      = np.array([landmarks[1].x, landmarks[1].y, landmarks[1].z])
        p_chin      = np.array([landmarks[152].x, landmarks[152].y, landmarks[152].z])

        # Horizontal axis (right eye to left eye)
        v_x = p_left_eye - p_right_eye
        norm_x = np.linalg.norm(v_x)
        if norm_x == 0:
            return "CENTER", 0.0, 0.0
        u_x = v_x / norm_x

        # Vertical vector (nose to chin)
        v_y_temp = p_chin - p_nose

        # Normal vector (orthogonal to face, pointing towards camera)
        v_z = np.cross(u_x, v_y_temp)
        norm_z = np.linalg.norm(v_z)
        if norm_z == 0:
            return "CENTER", 0.0, 0.0
        u_z = v_z / norm_z
        if u_z[2] > 0:
            u_z = -u_z

        # Extract yaw and pitch directly using trigonometry
        yaw = np.arctan2(u_z[0], -u_z[2])
        pitch = np.arctan2(u_z[1], -u_z[2])

        # Convert to degrees
        yaw = np.degrees(yaw)
        pitch = np.degrees(pitch)

        head_gaze = "CENTER"
        corrected_yaw = yaw - YAW_OFFSET
        if corrected_yaw < -YAW_THRESHOLD:
            head_gaze = "LEFT"
        elif corrected_yaw > YAW_THRESHOLD:
            head_gaze = "RIGHT"

        return head_gaze, yaw, pitch

    def process(self, frame, rgb_frame, landmarks):
        h, w = frame.shape[:2]

        iris_gaze = "CENTER"
        if landmarks:
            iris_gaze = self.get_iris_gaze(landmarks, w, h)

        head_gaze, yaw, pitch = self.get_head_gaze_vector(landmarks, w, h)

        # Combined decision
        if head_gaze != "CENTER":
            return head_gaze, "HEAD", iris_gaze, head_gaze, yaw, pitch
        elif iris_gaze != "CENTER":
            return iris_gaze, "EYES", iris_gaze, head_gaze, yaw, pitch
        return "CENTER", "", iris_gaze, head_gaze, yaw, pitch