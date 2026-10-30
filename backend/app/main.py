"""WFO attendance API.

Run:  uvicorn app.main:app --reload
Docs: http://localhost:8000/docs
"""
from datetime import date, datetime

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from . import metrics as m
from .db import Base, engine, get_db
from .models import Employee, MonthlyTarget, RecognitionEvent

Base.metadata.create_all(engine)

app = FastAPI(title="WFO Attendance API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def snapshots(db: Session, end: date | None):
    cur, prev = m.periods(db, end)
    return m.Snapshot(db, cur), m.Snapshot(db, prev)


@app.get("/api/meta")
def meta(end: date | None = None, db: Session = Depends(get_db)):
    cur, prev = m.periods(db, end)
    return {
        "policy": {"required_days": m.required_days(db, cur.start),
                   "previous_required_days": m.required_days(db, prev.start),
                   "late_after": m.LATE_AFTER.strftime("%H:%M")},
        "current": cur.as_dict(),
        "previous": prev.as_dict(),
        "departments": sorted({e.dept for e in db.query(Employee).filter(Employee.active)}),
    }


@app.get("/api/months")
def months(db: Session = Depends(get_db)):
    return m.months(db)


@app.get("/api/kpis")
def kpis(end: date | None = None, db: Session = Depends(get_db)):
    cur, prev = snapshots(db, end)
    return {"current": m.kpis(cur), "previous": m.kpis(prev)}


@app.get("/api/daily")
def daily(end: date | None = None, db: Session = Depends(get_db)):
    cur, prev = snapshots(db, end)
    return m.daily(prev) + m.daily(cur)


@app.get("/api/weekday")
def weekday(end: date | None = None, db: Session = Depends(get_db)):
    cur, _ = snapshots(db, end)
    return m.weekday(cur)


@app.get("/api/employees")
def employees(end: date | None = None, dept: str | None = None, db: Session = Depends(get_db)):
    cur, prev = snapshots(db, end)
    rows = m.employee_rows(cur, prev)
    return [r for r in rows if not dept or r["dept"] == dept]


@app.get("/api/departments")
def departments(end: date | None = None, db: Session = Depends(get_db)):
    cur, prev = snapshots(db, end)
    return m.departments(m.employee_rows(cur, prev))


@app.get("/api/recognition")
def recognition(end: date | None = None, db: Session = Depends(get_db)):
    cur, prev = m.periods(db, end)
    return m.recognition(db, m.Period(prev.start, cur.end))


class TargetIn(BaseModel):
    required_days: int = Field(ge=0, le=31)


@app.put("/api/targets/{month}")
def set_target(month: str, body: TargetIn, db: Session = Depends(get_db)):
    """HR sets the office days required for a month, e.g. PUT /api/targets/2026-11 {"required_days": 9}."""
    try:
        first = date.fromisoformat(f"{month}-01")
    except ValueError:
        raise HTTPException(422, "month must look like 2026-11")
    db.merge(MonthlyTarget(month=first, required_days=body.required_days))
    db.commit()
    return {"month": month, "required_days": body.required_days}


# ---------- write side: called by the face recognition script ----------

class EventIn(BaseModel):
    camera_id: str
    result: str = Field(pattern="^(matched|unknown|spoof)$")
    emp_id: str | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    liveness_passed: bool = True
    latency_ms: int | None = None
    ts: datetime | None = None


@app.post("/api/events", status_code=201)
def add_event(ev: EventIn, db: Session = Depends(get_db)):
    if ev.result == "matched" and not (ev.emp_id and db.get(Employee, ev.emp_id)):
        raise HTTPException(422, "matched events need a known emp_id")
    row = RecognitionEvent(**ev.model_dump(exclude={"ts"}), ts=ev.ts or datetime.now())
    db.add(row)
    db.commit()
    return {"id": row.id}
