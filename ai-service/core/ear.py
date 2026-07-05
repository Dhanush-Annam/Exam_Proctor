import numpy as np
import mediapipe as mp

LEFT_EYE_TOP     = [386, 387, 388, 390]
LEFT_EYE_BOTTOM  = [374, 373, 372, 380]
LEFT_EYE_LEFT    = 263
LEFT_EYE_RIGHT   = 362
RIGHT_EYE_TOP    = [159, 160, 161, 163]
RIGHT_EYE_BOTTOM = [145, 144, 143, 153]
RIGHT_EYE_LEFT   = 133
RIGHT_EYE_RIGHT  = 33

def get_point(landmarks, index, w, h):
    lm = landmarks[index]
    return np.array([lm.x * w, lm.y * h])

def compute_ear(landmarks, top_ids, bottom_ids, left_id, right_id, w, h):
    top_pts    = np.array([get_point(landmarks, i, w, h) for i in top_ids])
    bottom_pts = np.array([get_point(landmarks, i, w, h) for i in bottom_ids])
    left_pt    = get_point(landmarks, left_id,  w, h)
    right_pt   = get_point(landmarks, right_id, w, h)

    vertical   = np.mean(np.linalg.norm(top_pts - bottom_pts, axis=1))
    horizontal = np.linalg.norm(right_pt - left_pt)

    if horizontal == 0:
        return 0.0
    return vertical / horizontal

class EARDetector:
    def __init__(self, threshold=0.15, consec_frames=8):
        self.threshold    = threshold
        self.consec_frames = consec_frames
        self.face_mesh    = mp.solutions.face_mesh.FaceMesh(
            max_num_faces=2,
            refine_landmarks=True,
            min_detection_confidence=0.6,
            min_tracking_confidence=0.6
        )

    def process(self, rgb_frame, ear_counter):
        """
        Returns: (ear_value, is_closed, new_counter, landmarks)
        """
        h, w       = rgb_frame.shape[:2]
        results    = self.face_mesh.process(rgb_frame)
        landmarks  = None
        ear        = None
        is_closed  = False

        if results.multi_face_landmarks:
            landmarks = results.multi_face_landmarks[0].landmark

            left_ear  = compute_ear(landmarks,
                LEFT_EYE_TOP, LEFT_EYE_BOTTOM,
                LEFT_EYE_LEFT, LEFT_EYE_RIGHT, w, h)
            right_ear = compute_ear(landmarks,
                RIGHT_EYE_TOP, RIGHT_EYE_BOTTOM,
                RIGHT_EYE_LEFT, RIGHT_EYE_RIGHT, w, h)
            ear = (left_ear + right_ear) / 2.0

            if ear < self.threshold:
                ear_counter += 1
                if ear_counter >= self.consec_frames:
                    is_closed = True
            else:
                ear_counter = 0

        return ear, is_closed, ear_counter, landmarks

    def close(self):
        self.face_mesh.close()