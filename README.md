# WFO Attendance Dashboard

Face recognition marks attendance; HR sees office attendance and WFO-policy compliance.

```
camera ─▶ Python face recognition ─▶ POST /api/events ─▶ FastAPI ─▶ SQLite / PostgreSQL
                                                            │
                                    Angular 22 + D3  ◀── GET /api/*
```

## Run it

**Backend** (Python 3.10+)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python seed.py --reset          # 40 sample employees, Sep 7 – Oct 30 2026
uvicorn app.main:app --reload   # http://localhost:8000/docs
```

**Frontend** (Node 22+)

```bash
cd frontend
npm install
npm start                       # http://localhost:4200  (proxies /api to :8000)
```

## How it fits together

| Folder | What's in it |
|---|---|
| `backend/app/models.py` | Tables: `employees`, `holidays`, `leaves`, `recognition_events` |
| `backend/app/metrics.py` | Every dashboard number, worked out from the raw tables (definitions at the top) |
| `backend/app/main.py` | API: `/api/meta`, `/kpis`, `/daily`, `/weekday`, `/departments`, `/employees`, `/recognition`, and `POST /api/events` |
| `backend/seed.py` | Sample data generator |
| `backend/face_client_example.py` | How the face recognition script reports each detection to the API |
| `frontend/src/app/app.*` | Dashboard page; loads data with `httpResource` |
| `frontend/src/app/charts/` | D3 chart components (`ChartBase` handles resize and tooltips) |
| `frontend/src/app/employee-table.*` | Search, department/status filters, sorting, CSV export |
| `frontend/src/app/kpi-tile.ts` | Headline number with change vs previous period |

**One source of truth.** The recognition script only writes events (`matched`, `unknown`, `spoof`).
Check-in, check-out, hours and compliance are all derived from them, so nothing has to be kept in sync.

## Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./wfo.db` | e.g. `postgresql+psycopg://user:pass@localhost/wfo` (uncomment psycopg in requirements) |
| `WFO_DAYS_PER_MONTH` | `12` | Default office days required per month (any days count). HR overrides a month with `PUT /api/targets/2026-11` `{"required_days": 9}` |
| `WFO_LATE_AFTER` | `10:00` | First recognition after this counts as late |

## Privacy (worth saying in the pitch)

- Store face **embeddings**, not photos (`employees.face_embedding`); they can't be turned back into a picture.
- Take consent at enrollment and delete embeddings when someone leaves.
- Keep raw events for a fixed period (e.g. 90 days) and keep only daily summaries after that.
- Add login and roles before real use: HR sees everyone, managers see their own team.

## Next steps

- Login (JWT/SSO) and a manager-only view
- Exceptions: employees log client visits or travel (`leaves.kind`) so those days don't count against them
- Weekly nudges to employees who are "At risk"
- Headcount forecast per weekday for desk and cafeteria planning
