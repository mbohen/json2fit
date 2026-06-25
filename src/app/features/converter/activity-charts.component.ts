import { CommonModule } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { I18nPipe } from '@app/core/i18n/i18n.pipe';
import { I18nService } from '@app/core/i18n/i18n.service';
import { NormalizedActivity } from '@shared/models';
import { ActivityChartLabels, buildActivityCharts, ChartPreviewModel } from './activity-preview.utils';

@Component({
  selector: 'app-activity-charts',
  standalone: true,
  imports: [CommonModule, I18nPipe],
  template: `
    <section class="min-w-0 space-y-3" data-testid="activity-charts">
      <h3 class="text-base font-semibold text-ink">{{ 'charts.title' | t }}</h3>

      <div class="grid min-w-0 gap-4 lg:grid-cols-2">
        <article
          *ngFor="let chart of charts(); trackBy: trackByChartId"
          class="min-w-0 rounded-md border border-line p-3"
          [attr.data-testid]="'activity-chart-' + chart.id"
        >
          <div class="flex min-w-0 items-start justify-between gap-3">
            <div class="min-w-0">
              <h4 class="break-words text-sm font-semibold text-ink">{{ chart.title }}</h4>
              <p *ngIf="chart.hasData" class="text-xs text-slate-500">
                {{ 'charts.pointsUnit' | t: { rendered: chart.renderedPoints, total: chart.totalPoints, unit: chart.unit } }}
              </p>
            </div>
            <p *ngIf="chart.hasData" class="shrink-0 text-right text-xs text-slate-500">
              {{ chart.minLabel }}<br />
              {{ chart.maxLabel }}
            </p>
          </div>

          <ng-container *ngIf="chart.hasData; else noSeries">
            <svg class="mt-3 block h-36 w-full" viewBox="0 0 640 220" role="img" [attr.aria-label]="chart.title">
              <rect x="0" y="0" width="640" height="220" fill="#ffffff"></rect>
              <g stroke="#e2e8f0" stroke-width="1">
                <line x1="16" y1="55" x2="624" y2="55"></line>
                <line x1="16" y1="110" x2="624" y2="110"></line>
                <line x1="16" y1="165" x2="624" y2="165"></line>
              </g>
              <polyline
                data-testid="activity-chart-polyline"
                [attr.points]="chart.polyline"
                fill="none"
                stroke="#2563eb"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
              ></polyline>
            </svg>
          </ng-container>

          <ng-template #noSeries>
            <p class="mt-3 rounded-md border border-dashed border-line bg-slate-50 px-3 py-6 text-center text-sm text-slate-600">
              {{ chart.emptyLabel }}
            </p>
          </ng-template>
        </article>
      </div>
    </section>
  `
})
export class ActivityChartsComponent {
  private readonly i18n = inject(I18nService);

  readonly activity = input<NormalizedActivity | null>(null);
  private readonly chartLabels = computed<ActivityChartLabels>(() => {
    this.i18n.currentLanguage();
    return {
      pace: this.i18n.t('charts.pace'),
      speed: this.i18n.t('charts.speed'),
      heartRate: this.i18n.t('charts.heartRate'),
      altitude: this.i18n.t('charts.altitude'),
      cadence: this.i18n.t('charts.cadence'),
      power: this.i18n.t('charts.power'),
      emptyPace: this.i18n.t('charts.emptyPace'),
      emptySpeed: this.i18n.t('charts.emptySpeed'),
      emptyHeartRate: this.i18n.t('charts.emptyHeartRate'),
      emptyAltitude: this.i18n.t('charts.emptyAltitude'),
      emptyCadence: this.i18n.t('charts.emptyCadence'),
      emptyPower: this.i18n.t('charts.emptyPower'),
      missing: this.i18n.t('common.missing')
    };
  });
  readonly charts = computed(() => buildActivityCharts(this.activity(), this.chartLabels()));

  trackByChartId(_: number, chart: ChartPreviewModel): string {
    return chart.id;
  }
}
