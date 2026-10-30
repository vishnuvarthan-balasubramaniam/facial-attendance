import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import * as d3 from 'd3';
import { DeptRow } from '../models';
import { ChartBase } from './chart-base';

/** Horizontal bars per department: share of employees who met the monthly office-day requirement. */
@Component({
  selector: 'app-dept-chart',
  template: '',
  host: { class: 'chart' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeptChart extends ChartBase {
  readonly data = input.required<DeptRow[]>();

  protected draw(W: number) {
    const rows = [...this.data()].sort((a, b) => b.compliant_share - a.compliant_share);
    const pct = d3.format('.0%');
    d3.select(this.host).select('svg').remove();
    this.hideTip();
    if (!rows.length) return;

    const rowH = 30;
    const mt = 22;
    const H = Math.max(220, mt + rows.length * rowH + 8);
    const svg = d3.select(this.host).append('svg')
      .attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);

    const labels = svg.append('g').selectAll('text').data(rows).join('text').text((r) => r.dept);
    const ml = (d3.max(labels.nodes(), (n) => (n as SVGTextElement).getComputedTextLength()) ?? 0) + 12;
    const vals = svg.append('g').selectAll('text').data(rows).join('text').attr('class', 'value').text((r) => pct(r.compliant_share));
    const mr = (d3.max(vals.nodes(), (n) => (n as SVGTextElement).getComputedTextLength()) ?? 0) + 10;

    const x = d3.scaleLinear([0, 1], [ml, W - mr]);
    const y = d3.scaleBand(rows.map((r) => r.dept), [mt, mt + rows.length * rowH]).padding(0.3);
    const mid = (r: DeptRow) => (y(r.dept) ?? 0) + y.bandwidth() / 2;

    labels.attr('x', ml - 8).attr('y', mid).attr('dy', '0.32em').attr('text-anchor', 'end');
    const bars = svg.insert('g', ':first-child').selectAll('rect').data(rows).join('rect')
      .attr('x', ml).attr('y', (r) => y(r.dept) ?? 0).attr('height', y.bandwidth())
      .attr('width', (r) => Math.max(0, x(r.compliant_share) - ml)).attr('rx', 3)
      .style('fill', 'var(--series-1)');
    vals.attr('x', (r) => x(r.compliant_share) + 6).attr('y', mid).attr('dy', '0.32em');

    svg.append('g').selectAll('rect').data(rows).join('rect')
      .attr('x', 0).attr('width', W).attr('y', (r) => (y(r.dept) ?? 0) - (y.step() - y.bandwidth()) / 2)
      .attr('height', y.step()).style('fill', 'transparent')
      .on('pointerenter pointermove', (_, r) => {
        bars.classed('dim', (b) => b !== r);
        this.showTip(x(r.compliant_share), y(r.dept) ?? 0, {
          title: r.dept,
          lines: [['Met requirement', `${r.compliant} of ${r.employees}`], ['Share', pct(r.compliant_share)]],
        });
      })
      .on('pointerleave', () => {
        bars.classed('dim', false);
        this.hideTip();
      });
  }
}
