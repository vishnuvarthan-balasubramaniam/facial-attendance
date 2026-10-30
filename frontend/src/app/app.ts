import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import * as d3 from 'd3';
import { BarChart } from './charts/bar-chart';
import { DeptChart } from './charts/dept-chart';
import { EmployeeTable } from './employee-table';
import { KpiTile } from './kpi-tile';
import {
  DailyRow, DeptRow, EmployeeRow, Kpis, Meta, MonthOption, RecognitionRow, Tooltip, WeekdayRow,
} from './models';

const pct = d3.format('.0%');
const pct1 = d3.format('.1%');
const int = d3.format(',');
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const shortDate = (s: string) => d3.utcFormat('%b %-d')(day(s));
const longDate = (s: string) => d3.utcFormat('%a, %b %-d')(day(s));
const rangeText = (r?: { start: string; end: string }) => (r ? `${shortDate(r.start)} – ${shortDate(r.end)}` : '');

@Component({
  selector: 'app-root',
  imports: [KpiTile, BarChart, DeptChart, EmployeeTable],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  // ---- month selection: '' = latest month ----
  protected readonly months = httpResource<MonthOption[]>(() => '/api/months', { defaultValue: [] });
  protected readonly selectedEnd = signal('');
  protected readonly q = computed(() => (this.selectedEnd() ? `?end=${this.selectedEnd()}` : ''));
  protected readonly monthLabel = (o: MonthOption) => d3.utcFormat('%B %Y')(day(`${o.month}-01`));

  // ---- data (all from the FastAPI backend, proxied at /api) ----
  protected readonly meta = httpResource<Meta>(() => `/api/meta${this.q()}`);
  protected readonly kpis = httpResource<Kpis>(() => `/api/kpis${this.q()}`);
  protected readonly daily = httpResource<DailyRow[]>(() => `/api/daily${this.q()}`, { defaultValue: [] });
  protected readonly weekday = httpResource<WeekdayRow[]>(() => `/api/weekday${this.q()}`, { defaultValue: [] });
  protected readonly depts = httpResource<DeptRow[]>(() => `/api/departments${this.q()}`, { defaultValue: [] });
  protected readonly employees = httpResource<EmployeeRow[]>(() => `/api/employees${this.q()}`, { defaultValue: [] });
  protected readonly recognition = httpResource<RecognitionRow[]>(() => `/api/recognition${this.q()}`, { defaultValue: [] });

  protected readonly failed = computed(() => !!(this.meta.error() || this.kpis.error() || this.employees.error()));
  protected readonly requiredDays = computed(() => this.meta.value()?.policy.required_days ?? 12);
  protected readonly monthName = computed(() => {
    const c = this.meta.value()?.current;
    return c ? d3.utcFormat('%B %Y')(day(c.start)) : '';
  });
  protected readonly currentRange = computed(() => rangeText(this.meta.value()?.current));
  protected readonly fullRange = computed(() => {
    const m = this.meta.value();
    return m ? rangeText({ start: m.previous.start, end: m.current.end }) : '';
  });

  // ---- headline ----
  protected readonly summary = computed(() => {
    const rows = this.employees.value();
    const lowest = [...this.depts.value()].sort((a, b) => a.compliant_share - b.compliant_share)[0];
    return {
      compliant: rows.filter((r) => r.status === 'Compliant').length,
      total: rows.length,
      lowestDept: lowest?.dept ?? '—',
      lowestPct: lowest ? pct(lowest.compliant_share) : '—',
    };
  });

  protected readonly tiles = computed(() => {
    const k = this.kpis.value();
    if (!k) return [];
    const c = k.current;
    const p = k.previous;
    const hasPrev = p.avg_daily_in_office > 0;
    // const late = this.meta.value()?.policy.late_after ?? '10:00';
    return [
      { label: 'Office attendance rate', value: pct(c.wfo_pct), delta: hasPrev ? (c.wfo_pct - p.wfo_pct) * 100 : undefined, unit: 'pts', better: 'up' as const },
      { label: 'Employees meeting policy', value: pct(c.compliant_share), delta: hasPrev ? (c.compliant_share - p.compliant_share) * 100 : undefined, unit: 'pts', better: 'up' as const },
      { label: 'People in office, daily average', value: c.avg_daily_in_office.toFixed(1), delta: hasPrev ? c.avg_daily_in_office - p.avg_daily_in_office : undefined, unit: '', better: 'up' as const },
      // Hidden from the UI for now:
      // { label: `Late check-ins (after ${late})`, value: pct(c.late_share), delta: (c.late_share - p.late_share) * 100, unit: 'pts', better: 'down' as const },
      // { label: 'Hours in office per visit', value: c.avg_hours.toFixed(1), delta: c.avg_hours - p.avg_hours, unit: 'h', better: 'up' as const },
    ];
  });

  protected readonly recogTiles = computed(() => {
    const r = this.recognition.value();
    if (!r.length) return [];
    const matched = d3.sum(r, (d) => d.recognized);
    const conf = d3.sum(r, (d) => (d.avg_confidence ?? 0) * d.recognized) / (matched || 1);
    return [
      { label: 'Face matches', value: int(matched), note: 'Check-ins and check-outs' },
      { label: 'Average match confidence', value: pct1(conf), note: 'Across all matches' },
      { label: 'Unknown faces at the door', value: int(d3.sum(r, (d) => d.unknown_faces)), note: 'Visitors or unenrolled staff' },
      { label: 'Spoof attempts blocked', value: int(d3.sum(r, (d) => d.spoof_blocked)), note: 'Failed the liveness check' },
      { label: 'Recognition time', value: `${int(Math.round(d3.mean(r, (d) => d.avg_latency_ms ?? 0) ?? 0))} ms`, note: 'Daily average' },
    ];
  });

  // ---- chart accessors ----
  protected readonly dailyChart = {
    x: (d: DailyRow) => d.date,
    y: (d: DailyRow) => d.in_office,
    xFormat: shortDate,
    tooltip: (d: DailyRow): Tooltip => ({
      title: longDate(d.date),
      lines: [['In office', int(d.in_office)], ['On leave', int(d.on_leave)]]  /* , ['Late check-ins', int(d.late_arrivals)] */,
    }),
  };

  protected readonly weekdayChart = {
    x: (d: WeekdayRow) => d.weekday,
    y: (d: WeekdayRow) => d.occupancy,
    yFormat: pct,
    tooltip: (d: WeekdayRow): Tooltip => ({
      title: d.weekday,
      lines: [['Occupancy', pct(d.occupancy)], ['People in office', d.avg_in_office.toFixed(1)]],
    }),
  };

  protected readonly recogChart = {
    x: (d: RecognitionRow) => d.date,
    y: (d: RecognitionRow) => d.unknown_faces,
    xFormat: shortDate,
    color: () => 'var(--series-2)',
    marker: (d: RecognitionRow) => d.spoof_blocked > 0,
    tooltip: (d: RecognitionRow): Tooltip => ({
      title: longDate(d.date),
      lines: [
        ['Unknown faces', int(d.unknown_faces)],
        ['Spoof attempts blocked', int(d.spoof_blocked)],
        ['Match confidence', d.avg_confidence == null ? '—' : pct1(d.avg_confidence)],
        ['Recognition time', d.avg_latency_ms == null ? '—' : `${d.avg_latency_ms} ms`],
      ],
    }),
  };

  protected readonly recogMax = computed(() => Math.max(5, (d3.max(this.recognition.value(), (d) => d.unknown_faces) ?? 0) + 1));

  protected readonly pct = pct;
}
