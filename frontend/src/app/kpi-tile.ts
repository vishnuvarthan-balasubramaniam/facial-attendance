import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** A headline number with its change from the previous period. */
@Component({
  selector: 'app-kpi-tile',
  template: `
    <div class="label">{{ label() }}</div>
    <div class="value">{{ value() }}</div>
    @if (delta() !== undefined) {
      <div class="sub">
        <span [class.good]="tone() === 'good'" [class.bad]="tone() === 'bad'">{{ deltaText() }}</span>
        vs previous {{ period() }}
      </div>
    } @else if (note()) {
      <div class="sub">{{ note() }}</div>
    }
  `,
  host: { class: 'card tile' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KpiTile {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  /** Change from the previous period, already in display units. */
  readonly delta = input<number>();
  readonly unit = input('');
  readonly better = input<'up' | 'down'>('up');
  readonly period = input('month');
  readonly note = input('');

  protected readonly deltaText = computed(() => {
    const d = this.delta() ?? 0;
    const s = Math.abs(d) < 0.05 ? '±' : d > 0 ? '+' : '−';
    return `${s}${Math.abs(d).toFixed(1)}${this.unit() ? ' ' + this.unit() : ''}`;
  });

  protected readonly tone = computed(() => {
    const d = this.delta() ?? 0;
    if (Math.abs(d) < 0.05) return 'flat';
    return d > 0 === (this.better() === 'up') ? 'good' : 'bad';
  });
}
