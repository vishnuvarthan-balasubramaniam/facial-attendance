import { DestroyRef, Directive, ElementRef, effect, inject, signal } from '@angular/core';
import { Tooltip } from '../models';

/**
 * Shared plumbing for D3 charts:
 * - tracks the host's width so charts redraw on resize
 * - redraws whenever any signal read inside draw() changes
 * - a small tooltip positioned inside the host
 */
@Directive()
export abstract class ChartBase {
  protected readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly width = signal(0);
  private tip?: HTMLDivElement;

  constructor() {
    const ro = new ResizeObserver(([entry]) => this.width.set(Math.floor(entry.contentRect.width)));
    ro.observe(this.host);
    inject(DestroyRef).onDestroy(() => ro.disconnect());
    effect(() => {
      const w = this.width();
      if (w > 0) this.draw(w);
    });
  }

  /** Read input signals here; D3 renders into this.host. */
  protected abstract draw(width: number): void;

  protected showTip(x: number, y: number, t: Tooltip) {
    if (!this.tip) {
      this.tip = document.createElement('div');
      this.tip.className = 'chart-tip';
    }
    this.host.append(this.tip);
    this.tip.replaceChildren();
    const h = document.createElement('div');
    h.className = 'chart-tip-title';
    h.textContent = t.title;
    this.tip.append(h);
    for (const [k, v] of t.lines) {
      const row = document.createElement('div');
      row.className = 'chart-tip-row';
      const a = document.createElement('span');
      a.textContent = k;
      const b = document.createElement('b');
      b.textContent = v;
      row.append(a, b);
      this.tip.append(row);
    }
    this.tip.hidden = false;
    const tw = this.tip.offsetWidth;
    const th = this.tip.offsetHeight;
    this.tip.style.left = `${Math.max(0, Math.min(this.host.clientWidth - tw, x - tw / 2))}px`;
    this.tip.style.top = `${y - th - 10 < 0 ? y + 12 : y - th - 10}px`;
  }

  protected hideTip() {
    if (this.tip) this.tip.hidden = true;
  }
}
