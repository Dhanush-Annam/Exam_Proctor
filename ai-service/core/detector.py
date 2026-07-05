import cv2
import numpy as np

class FaceDetector:
    def __init__(self, prototxt, caffemodel, confidence=0.6):
        self.net        = cv2.dnn.readNetFromCaffe(prototxt, caffemodel)
        self.confidence = confidence

    def count_faces(self, frame):
        h, w = frame.shape[:2]
        blob = cv2.dnn.blobFromImage(
            cv2.resize(frame, (300, 300)), 1.0,
            (300, 300), (104.0, 177.0, 123.0)
        )
        self.net.setInput(blob)
        detections = self.net.forward()
        return sum(
            1 for i in range(detections.shape[2])
            if detections[0, 0, i, 2] > self.confidence
        )