"""Tables.

The face recognition script only writes to `recognition_events`.
Attendance (check-in, check-out, hours) is derived from those events,
so there is one source of truth and nothing to keep in sync.
"""
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class Employee(Base):
    __tablename__ = "employees"
    emp_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    dept: Mapped[str] = mapped_column(String(50), index=True)
    location: Mapped[str] = mapped_column(String(50))
    manager_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Face embedding is stored here (not the photo) — see README "Privacy".
    face_embedding: Mapped[bytes | None] = mapped_column(nullable=True)


class Holiday(Base):
    __tablename__ = "holidays"
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))


class MonthlyTarget(Base):
    """Office days HR requires in a month (any days of the month count). Missing month = default."""
    __tablename__ = "monthly_targets"
    month: Mapped[date] = mapped_column(Date, primary_key=True)  # first day of the month
    required_days: Mapped[int] = mapped_column(Integer)


class Leave(Base):
    __tablename__ = "leaves"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    emp_id: Mapped[str] = mapped_column(ForeignKey("employees.emp_id"), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    # leave, client_visit, travel, medical ... — all excused from the WFO count
    kind: Mapped[str] = mapped_column(String(30), default="leave")


class RecognitionEvent(Base):
    __tablename__ = "recognition_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime, index=True)
    camera_id: Mapped[str] = mapped_column(String(30))
    # matched = known employee, unknown = face not enrolled, spoof = failed liveness
    result: Mapped[str] = mapped_column(String(10), index=True)
    emp_id: Mapped[str | None] = mapped_column(ForeignKey("employees.emp_id"), nullable=True, index=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    liveness_passed: Mapped[bool] = mapped_column(Boolean, default=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
