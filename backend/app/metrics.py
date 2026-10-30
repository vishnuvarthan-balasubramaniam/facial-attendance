"""All dashboard numbers are worked out here, from the raw tables.

Definitions
-----------
Working day      Mon–Fri that is not a holiday.
Eligible day     A working day the employee was not on approved leave.
Office day       An eligible day with at least one 'matched' recognition event.
Attendance rate  office days / eligible days.
Required days    Office days HR requires in the month (monthly_targets table, default
                 WFO_DAYS_PER_MONTH = 12), capped at the employee's eligible days that month.
                 Any days of the month count; there is no per-week rule.
Progress         office days / required days (capped at 100%).
Status           Compliant: office days >= required.
                 At risk: short, but office days + remaining eligible days >= required.
                 Below policy: can no longer reach the requirement this month.
Period           Current = the month of the latest data (month to date); previous = the month before.
Late check-in    First recognition of the day after LATE_AFTER.
Hours in office  First to last recognition of the day.
"""
from __future__ import annotations

import os
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from statistics import mean

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Employee, Holiday, Leave, MonthlyTarget, RecognitionEvent

DEFAULT_REQUIRED_DAYS = int(os.getenv("WFO_DAYS_PER_MONTH", "12"))
LATE_AFTER = time.fromisoformat(os.getenv("WFO_LATE_AFTER", "10:00"))


# ---------- periods ----------

@dataclass
class Period:
    start: date
    end: date

    def as_dict(self):
        return {"start": self.start.isoformat(), "end": self.end.isoformat()}


def latest_day(db: Session) -> date:
    ts = db.scalar(select(func.max(RecognitionEvent.ts)))
    return ts.date() if ts else date.today()


def periods(db: Session, end: date | None = None) -> tuple[Period, Period]:
    """Current = the calendar month of `end` up to `end`; previous = the whole month before."""
    end = end or latest_day(db)
    cur_start = end.replace(day=1)
    prev_end = cur_start - timedelta(days=1)
    return Period(cur_start, end), Period(prev_end.replace(day=1), prev_end)


def month_end(d: date) -> date:
    return (d.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)


def months(db: Session) -> list[dict]:
    """Months that have recognition data, newest first, each with the day to report up to."""
    first_ts = db.scalar(select(func.min(RecognitionEvent.ts)))
    if not first_ts:
        return []
    last, d = latest_day(db), first_ts.date().replace(day=1)
    out = []
    while d <= last:
        out.append({"month": d.strftime("%Y-%m"), "end": min(month_end(d), last).isoformat()})
        d = month_end(d) + timedelta(days=1)
    return out[::-1]


def required_days(db: Session, month: date) -> int:
    row = db.get(MonthlyTarget, month.replace(day=1))
    return row.required_days if row else DEFAULT_REQUIRED_DAYS


# ---------- raw data for a period ----------

@dataclass
class DayVisit:
    first: datetime
    last: datetime

    @property
    def hours(self) -> float:
        return (self.last - self.first).total_seconds() / 3600


class Snapshot:
    """Everything needed for one period, loaded once."""

    def __init__(self, db: Session, p: Period):
        self.period = p
        self.required = required_days(db, p.start)
        full_end = month_end(p.start)
        self.employees = list(db.scalars(select(Employee).where(Employee.active).order_by(Employee.emp_id)))
        hol = set(db.scalars(select(Holiday.day).where(Holiday.day.between(p.start, p.end))))
        self.working_days = [
            p.start + timedelta(days=i)
            for i in range((p.end - p.start).days + 1)
            if (p.start + timedelta(days=i)).weekday() < 5 and (p.start + timedelta(days=i)) not in hol
        ]
        # Days of the month after the period end (still to come when the month is in progress).
        all_hol = set(db.scalars(select(Holiday.day).where(Holiday.day.between(p.start, full_end))))
        self.month_days = [
            p.start + timedelta(days=i)
            for i in range((full_end - p.start).days + 1)
            if (p.start + timedelta(days=i)).weekday() < 5 and (p.start + timedelta(days=i)) not in all_hol
        ]
        self.leaves = {
            (e, d) for e, d in db.execute(select(Leave.emp_id, Leave.day).where(Leave.day.between(p.start, full_end)))
        }
        start_ts = datetime.combine(p.start, time.min)
        end_ts = datetime.combine(p.end, time.max)
        rows = db.execute(
            select(RecognitionEvent.emp_id, func.date(RecognitionEvent.ts),
                   func.min(RecognitionEvent.ts), func.max(RecognitionEvent.ts))
            .where(RecognitionEvent.result == "matched", RecognitionEvent.ts.between(start_ts, end_ts))
            .group_by(RecognitionEvent.emp_id, func.date(RecognitionEvent.ts))
        )
        self.visits: dict[tuple[str, date], DayVisit] = {}
        for emp, d, first, last in rows:
            d = d if isinstance(d, date) else date.fromisoformat(str(d))
            self.visits[(emp, d)] = DayVisit(first, last)

    def eligible(self, emp_id: str) -> list[date]:
        return [d for d in self.working_days if (emp_id, d) not in self.leaves]

    def required_for(self, emp_id: str) -> int:
        """HR requirement, reduced when leave leaves fewer eligible days in the month than that."""
        month_eligible = sum(1 for d in self.month_days if (emp_id, d) not in self.leaves)
        return min(self.required, month_eligible)

    def remaining(self, emp_id: str) -> int:
        """Eligible working days after the period end, in the same month."""
        return sum(1 for d in self.month_days if d > self.period.end and (emp_id, d) not in self.leaves)

    def office(self, emp_id: str) -> list[date]:
        return [d for d in self.eligible(emp_id) if (emp_id, d) in self.visits]


def _status(office: int, required: int, remaining: int) -> str:
    if office >= required:
        return "Compliant"
    return "At risk" if office + remaining >= required else "Below policy"


def _hhmm(hours: float) -> str:
    h = int(hours)
    m = round((hours - h) * 60)
    if m == 60:
        h, m = h + 1, 0
    return f"{h:02d}:{m:02d}"


def _rate(n, d):
    return round(n / d, 3) if d else 0.0


def _progress(office: int, required: int) -> float:
    return round(min(office / required, 1.0), 3) if required else 1.0


# ---------- metrics ----------

def employee_rows(cur: Snapshot, prev: Snapshot) -> list[dict]:
    out = []
    for e in cur.employees:
        el, of = cur.eligible(e.emp_id), cur.office(e.emp_id)
        req, left = cur.required_for(e.emp_id), cur.remaining(e.emp_id)
        rate = _progress(len(of), req)
        prate = _progress(len(prev.office(e.emp_id)), prev.required_for(e.emp_id)) if prev.visits else rate
        visits = [cur.visits[(e.emp_id, d)] for d in of]
        ins = [v.first.hour + v.first.minute / 60 for v in visits]
        out.append({
            "emp_id": e.emp_id, "name": e.name, "dept": e.dept, "location": e.location,
            "office_days": len(of), "eligible_days": len(el), "wfo_pct": rate,
            "required_days": req, "days_left": left,
            "change_pts": round((rate - prate) * 100, 1),
            "avg_check_in": _hhmm(mean(ins)) if ins else None,
            "avg_hours": round(mean(v.hours for v in visits), 1) if visits else None,
            "status": _status(len(of), req, left),
        })
    return out


def kpis(s: Snapshot) -> dict:
    visits = [v for (e, d), v in s.visits.items() if d in s.working_days]
    tot_el = tot_of = compliant = 0
    for e in s.employees:
        el, of = len(s.eligible(e.emp_id)), len(s.office(e.emp_id))
        tot_el += el
        tot_of += of
        compliant += of >= s.required_for(e.emp_id)
    return {
        **s.period.as_dict(),
        "required_days": s.required,
        "avg_daily_in_office": round(len(visits) / len(s.working_days), 1) if s.working_days else 0,
        "wfo_pct": _rate(tot_of, tot_el),
        "compliant_share": _rate(compliant, len(s.employees)),
        "late_share": _rate(sum(v.first.time() > LATE_AFTER for v in visits), len(visits)),
        "avg_hours": round(mean(v.hours for v in visits), 2) if visits else 0,
    }


def daily(s: Snapshot) -> list[dict]:
    rows = []
    for d in s.working_days:
        visits = [v for (e, dd), v in s.visits.items() if dd == d]
        rows.append({
            "date": d.isoformat(),
            "in_office": len(visits),
            "on_leave": sum(1 for (e, dd) in s.leaves if dd == d),
            "late_arrivals": sum(v.first.time() > LATE_AFTER for v in visits),
        })
    return rows


def weekday(s: Snapshot) -> list[dict]:
    by = defaultdict(list)
    for r in daily(s):
        by[date.fromisoformat(r["date"]).strftime("%a")].append(r["in_office"])
    n = len(s.employees) or 1
    return [
        {"weekday": k, "avg_in_office": round(mean(by[k]), 1), "occupancy": round(mean(by[k]) / n, 3)}
        for k in ["Mon", "Tue", "Wed", "Thu", "Fri"] if by[k]
    ]


def departments(rows: list[dict]) -> list[dict]:
    by = defaultdict(list)
    for r in rows:
        by[r["dept"]].append(r)
    return [
        {
            "dept": d, "employees": len(rs),
            "wfo_pct": round(mean(r["wfo_pct"] for r in rs), 3),
            "compliant": sum(r["status"] == "Compliant" for r in rs),
            "compliant_share": _rate(sum(r["status"] == "Compliant" for r in rs), len(rs)),
        }
        for d, rs in sorted(by.items())
    ]


def recognition(db: Session, p: Period) -> list[dict]:
    start_ts, end_ts = datetime.combine(p.start, time.min), datetime.combine(p.end, time.max)
    rows = db.execute(
        select(func.date(RecognitionEvent.ts), RecognitionEvent.result, func.count(),
               func.avg(RecognitionEvent.confidence), func.avg(RecognitionEvent.latency_ms))
        .where(RecognitionEvent.ts.between(start_ts, end_ts))
        .group_by(func.date(RecognitionEvent.ts), RecognitionEvent.result)
    )
    by = defaultdict(lambda: {"matched": 0, "unknown": 0, "spoof": 0, "conf": None, "lat": []})
    for d, result, n, conf, lat in rows:
        r = by[str(d)]
        r[result] = n
        if result == "matched":
            r["conf"] = conf
        if lat is not None:
            r["lat"].append((lat, n))
    out = []
    for d in sorted(by):
        r = by[d]
        lat_n = sum(n for _, n in r["lat"])
        out.append({
            "date": d,
            "recognized": r["matched"],
            "unknown_faces": r["unknown"],
            "spoof_blocked": r["spoof"],
            "avg_confidence": round(r["conf"], 3) if r["conf"] is not None else None,
            "avg_latency_ms": round(sum(l * n for l, n in r["lat"]) / lat_n) if lat_n else None,
        })
    return out
