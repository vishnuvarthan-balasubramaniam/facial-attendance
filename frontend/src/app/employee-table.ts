import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { DecimalPipe, PercentPipe } from '@angular/common';
import { EmployeeRow, Status } from './models';

type Col = keyof EmployeeRow;

interface Column {
  key: Col;
  label: string;
  num?: boolean;
  hideNarrow?: boolean;
}

const COLUMNS: Column[] = [
  { key: 'emp_id', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: 'dept', label: 'Department' },
  { key: 'location', label: 'Location', hideNarrow: true },
  { key: 'office_days', label: 'Days in office', num: true },
  { key: 'required_days', label: 'Required', num: true },
  { key: 'eligible_days', label: 'Working days', num: true, hideNarrow: true },
  { key: 'wfo_pct', label: 'Progress', num: true },
  // { key: 'change_pts', label: 'Change (pts)', num: true },
  { key: 'days_left', label: 'Working days left', num: true, hideNarrow: true },
  // { key: 'avg_check_in', label: 'Avg check-in' },
  // { key: 'avg_hours', label: 'Avg hours', num: true, hideNarrow: true },
  { key: 'status', label: 'Status' },
];

@Component({
  selector: 'app-employee-table',
  imports: [PercentPipe, DecimalPipe],
  templateUrl: './employee-table.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmployeeTable {
  readonly rows = input.required<EmployeeRow[]>();
  readonly departments = input<string[]>([]);
  readonly policy = input(0.6);

  protected readonly columns = COLUMNS;
  protected readonly statuses: Status[] = ['Compliant', 'At risk', 'Below policy'];
  protected readonly query = signal('');
  protected readonly dept = signal('');
  protected readonly status = signal('');
  protected readonly sortKey = signal<Col>('wfo_pct');
  protected readonly sortDir = signal<1 | -1>(1);

  protected readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    const [dept, status, key, dir] = [this.dept(), this.status(), this.sortKey(), this.sortDir()];
    const num = COLUMNS.find((c) => c.key === key)?.num;
    return this.rows()
      .filter((r) => (!dept || r.dept === dept) && (!status || r.status === status)
        && (!q || `${r.name} ${r.emp_id}`.toLowerCase().includes(q)))
      .sort((a, b) => dir * (num
        ? Number(a[key] ?? -1) - Number(b[key] ?? -1)
        : String(a[key] ?? '').localeCompare(String(b[key] ?? ''))));
  });

  protected sortBy(key: Col) {
    if (this.sortKey() === key) this.sortDir.update((d) => (d === 1 ? -1 : 1));
    else {
      this.sortKey.set(key);
      this.sortDir.set(1);
    }
  }

  protected ariaSort(key: Col) {
    if (this.sortKey() !== key) return 'none';
    return this.sortDir() === 1 ? 'ascending' : 'descending';
  }

  protected pillClass(s: Status) {
    return s === 'Compliant' ? 'ok' : s === 'At risk' ? 'warn' : 'bad';
  }

  /** Downloads exactly the rows on screen (after search, filters and sort). */
  protected exportCsv() {
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [COLUMNS.map((c) => c.key).join(',')]
      .concat(this.visible().map((r) => COLUMNS.map((c) => esc(r[c.key])).join(',')));
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wfo-compliance.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
}
