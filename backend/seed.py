"""Fill the database with sample data for the demo.

    python seed.py            # 40 employees, Sep 7 – Oct 30 2026
    python seed.py --reset    # wipe tables first
"""
import random
import sys
from datetime import date, datetime, timedelta

from app.db import Base, SessionLocal, engine
from app.models import Employee, Holiday, Leave, RecognitionEvent

START, END = date(2026, 9, 7), date(2026, 10, 30)
HOLIDAYS = {date(2026, 10, 2): "Gandhi Jayanti", date(2026, 10, 20): "Diwali"}
DEPTS = {"HR": 3, "Finance": 4, "Management": 3, "Administration": 4, "Support": 7, "Consultation": 8, "Development": 11}
LOCATIONS = ["Chennai"]
FIRST = ["Arun", "Priya", "Karthik", "Divya", "Vikram", "Sneha", "Rahul", "Anjali", "Suresh", "Meera",
         "Ganesh", "Lakshmi", "Ravi", "Kavya", "Ajay", "Pooja", "Naveen", "Deepa", "Hari", "Swathi",
         "Manoj", "Nithya", "Sanjay", "Revathi", "Arjun", "Keerthi", "Vijay", "Harini", "Prakash", "Janani",
         "Ashok", "Bhavya", "Dinesh", "Gayathri", "Kiran", "Madhu", "Senthil", "Yamini", "Varun", "Indu"]
LAST = ["Kumar", "Sharma", "Reddy", "Iyer", "Nair", "Rao", "Menon", "Pillai", "Das", "Shetty"]
WEEKDAY_PULL = [0.85, 1.15, 1.2, 1.05, 0.55]  # Mon..Fri


def at(d: date, hours: float) -> datetime:
    return datetime.combine(d, datetime.min.time()) + timedelta(hours=hours)


def main():
    rnd = random.Random(7)
    if "--reset" in sys.argv:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    db = SessionLocal()

    emps, i = [], 0
    for dept, n in DEPTS.items():
        for _ in range(n):
            e = Employee(emp_id=f"E{1001 + i}", name=f"{FIRST[i]} {rnd.choice(LAST)}",
                         dept=dept, location=rnd.choice(LOCATIONS))
            e._p = rnd.choice([0.95, 0.85, 0.75, 0.7, 0.6, 0.5, 0.4, 0.3])  # how often they come in
            e._arrive = rnd.gauss(9.6, 0.5)
            emps.append(e)
            i += 1
    db.add_all(emps)
    db.add_all(Holiday(day=d, name=n) for d, n in HOLIDAYS.items())

    d = START
    while d <= END:
        if d.weekday() < 5 and d not in HOLIDAYS:
            cams = ["lobby-1", "lobby-2"]
            for e in emps:
                if rnd.random() < 0.04:
                    db.add(Leave(emp_id=e.emp_id, day=d, kind="leave"))
                    continue
                p = e._p * WEEKDAY_PULL[d.weekday()] * (1.08 if d >= date(2026, 10, 1) else 1)
                if rnd.random() >= min(0.98, p):
                    continue
                arrive = e._arrive + rnd.gauss(0, 0.35) + (0.25 if d.weekday() == 0 else 0)
                leave = arrive + max(3.5, rnd.gauss(8.3, 0.9))
                conf = min(0.999, rnd.gauss(0.965, 0.02))
                if conf < 0.94:  # a failed first try before the match
                    db.add(RecognitionEvent(ts=at(d, arrive - 0.01), camera_id=rnd.choice(cams), result="unknown",
                                            confidence=None, latency_ms=rnd.randint(200, 340)))
                for t in (arrive, leave):
                    db.add(RecognitionEvent(ts=at(d, t), camera_id=rnd.choice(cams), result="matched",
                                            emp_id=e.emp_id, confidence=round(conf, 3),
                                            latency_ms=rnd.randint(180, 320)))
            for _ in range(rnd.randint(0, 4)):
                db.add(RecognitionEvent(ts=at(d, rnd.uniform(9, 18)), camera_id=rnd.choice(cams), result="unknown",
                                        latency_ms=rnd.randint(200, 340)))
            if rnd.random() < 0.12:
                db.add(RecognitionEvent(ts=at(d, rnd.uniform(9, 18)), camera_id=rnd.choice(cams), result="spoof",
                                        liveness_passed=False, latency_ms=rnd.randint(250, 400)))
        d += timedelta(days=1)
    db.commit()
    print(f"Seeded {len(emps)} employees, {db.query(RecognitionEvent).count()} recognition events.")


if __name__ == "__main__":
    main()
