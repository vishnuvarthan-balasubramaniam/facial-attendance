"""Example: how your face recognition script reports to the API.

Not needed for the demo (seed.py fills sample data). It shows the
contract: every detection becomes one POST /api/events.

    pip install opencv-python face_recognition requests
    python face_client_example.py
"""
import time

import requests

API = "http://localhost:8000/api/events"
CAMERA_ID = "lobby-1"
MATCH_THRESHOLD = 0.55  # face_recognition distance; lower = stricter


def report(result: str, emp_id: str | None = None, confidence: float | None = None,
           liveness_passed: bool = True, latency_ms: int | None = None):
    requests.post(API, json={
        "camera_id": CAMERA_ID, "result": result, "emp_id": emp_id,
        "confidence": confidence, "liveness_passed": liveness_passed, "latency_ms": latency_ms,
    }, timeout=5)


def run(known_encodings, known_ids, is_live):
    """known_encodings/known_ids: loaded from employees.face_embedding at startup.
    is_live(frame) -> bool: your anti-spoofing check (blink detection, a liveness model, etc.)."""
    import cv2
    import face_recognition
    import numpy as np

    cam = cv2.VideoCapture(0)
    last_seen: dict[str, float] = {}
    while True:
        ok, frame = cam.read()
        if not ok:
            break
        t0 = time.perf_counter()
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        for enc in face_recognition.face_encodings(rgb):
            ms = int((time.perf_counter() - t0) * 1000)
            if not is_live(frame):
                report("spoof", liveness_passed=False, latency_ms=ms)
                continue
            dist = face_recognition.face_distance(known_encodings, enc)
            best = int(np.argmin(dist)) if len(dist) else -1
            if best >= 0 and dist[best] <= MATCH_THRESHOLD:
                emp = known_ids[best]
                if time.time() - last_seen.get(emp, 0) > 60:  # one event a minute per person
                    report("matched", emp, round(1 - float(dist[best]), 3), latency_ms=ms)
                    last_seen[emp] = time.time()
            else:
                report("unknown", latency_ms=ms)
