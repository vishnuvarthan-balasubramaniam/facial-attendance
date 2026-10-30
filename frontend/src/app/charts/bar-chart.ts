import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import * as d3 from 'd3';
import { Tooltip } from '../models';
import { ChartBase } from './chart-base';

/** Vertical bar chart: one bar per row. */
@Component({
  selector: 'app-bar-chart',
  template: '',
  host: { class: 'chart', '[style.min-height.px]': 'height()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BarChart<T> extends ChartBase {
  readonly data = input.required<T[]>();
  readonly x = input.required<(d: T) => string>();
  readonly y = input.required<(d: T) => number>();
  readonly yFormat = input<(n: number) => string>(d3.format(','));
  readonly xFormat = input<(s: string) => string>((s) => s);
  readonly yMax = input<number>();
  readonly valueLabels = input(false);
  readonly color = input<(d: T) => string>(() => 'var(--series-1)');
  /** Rows to flag with a dot above the bar (e.g. days a spoof attempt was blocked). */
  readonly marker = input<(d: T) => boolean>();
  readonly tooltip = input<(d: T) => Tooltip>();
  readonly height = input(220);
  readonly labelWidth = input(56);

  protected draw(W: number) {
    const data = this.data();
    const [xOf, yOf, yFmt, xFmt] = [this.x(), this.y(), this.yFormat(), this.xFormat()];
    const H = this.height();
    const color = this.color();
    const marker = this.marker();
    const tooltip = this.tooltip();
    const mb = 24;
    const mt = this.valueLabels() ? 20 : 10;

    d3.select(this.host).select('svg').remove();
    this.hideTip();
    if (!data.length) return;

    const svg = d3.select(this.host).append('svg')
      .attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    const y = d3.scaleLinear([0, this.yMax() ?? (d3.max(data, yOf) || 1)], [H - mb, mt]).nice();
    const ticks = y.ticks(4);

    const grid = svg.append('g');
    const yl = svg.append('g').selectAll('text').data(ticks).join('text').text(yFmt);
    const ml = (d3.max(yl.nodes(), (n) => (n as SVGTextElement).getComputedTextLength()) ?? 0) + 10;
    yl.attr('x', ml - 8).attr('y', (d) => y(d)).attr('dy', '0.32em').attr('text-anchor', 'end');
    grid.selectAll('line').data(ticks.filter((t) => t > 0)).join('line').attr('class', 'grid')
      .attr('x1', ml).attr('x2', W).attr('y1', (d) => Math.round(y(d)) + 0.5).attr('y2', (d) => Math.round(y(d)) + 0.5);

    const x = d3.scaleBand(data.map(xOf), [ml, W]).paddingInner(0.25).paddingOuter(0.1);
    const bw = Math.min(32, x.bandwidth());
    const off = (x.bandwidth() - bw) / 2;
    const cx = (d: T) => (x(xOf(d)) ?? 0) + x.bandwidth() / 2;

    const bars = svg.append('g').selectAll('rect').data(data).join('rect')
      .attr('x', (d) => (x(xOf(d)) ?? 0) + off).attr('width', bw)
      .attr('y', (d) => y(yOf(d))).attr('height', (d) => Math.max(0, y(0) - y(yOf(d))))
      .attr('rx', Math.min(4, bw / 2)).style('fill', color);

    if (this.valueLabels()) {
      svg.append('g').selectAll('text').data(data).join('text').attr('class', 'value')
        .attr('x', cx).attr('y', (d) => y(yOf(d)) - 6).attr('text-anchor', 'middle').text((d) => yFmt(yOf(d)));
    }
    if (marker) {
      svg.append('g').selectAll('circle').data(data.filter(marker)).join('circle')
        .attr('cx', cx).attr('cy', (d) => y(yOf(d)) - 7).attr('r', 3.5).style('fill', 'var(--critical)');
    }

    const every = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor((W - ml) / this.labelWidth()))));
    svg.append('g').selectAll('text').data(data.filter((_, i) => i % every === 0)).join('text')
      .attr('x', cx).attr('y', H - 6).attr('text-anchor', 'middle').text((d) => xFmt(xOf(d)));
    svg.append('line').attr('class', 'axis')
      .attr('x1', ml).attr('x2', W).attr('y1', Math.round(y(0)) + 0.5).attr('y2', Math.round(y(0)) + 0.5);

    if (tooltip) {
      svg.append('g').selectAll('rect').data(data).join('rect')
        .attr('x', (d) => (x(xOf(d)) ?? 0) - (x.step() - x.bandwidth()) / 2).attr('width', x.step())
        .attr('y', 0).attr('height', H - mb).style('fill', 'transparent')
        .on('pointerenter pointermove', (_, d) => {
          bars.classed('dim', (b) => b !== d);
          this.showTip(cx(d), y(yOf(d)), tooltip(d));
        })
        .on('pointerleave', () => {
          bars.classed('dim', false);
          this.hideTip();
        });
    }
  }
}
