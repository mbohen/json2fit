import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { I18nPipe } from '@app/core/i18n/i18n.pipe';
import { NormalizedActivity } from '@shared/models';
import { buildRoutePreview } from './activity-preview.utils';

@Component({
  selector: 'app-activity-route-preview',
  standalone: true,
  imports: [CommonModule, I18nPipe],
  template: `
    <section class="min-w-0 space-y-3" data-testid="activity-route-preview">
      <div class="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div class="min-w-0">
          <h3 class="text-base font-semibold text-ink">{{ 'route.title' | t }}</h3>
          <p class="text-sm text-slate-600">{{ 'route.lead' | t }}</p>
        </div>
        <p *ngIf="route().hasGps" class="text-xs font-semibold uppercase text-slate-500">
          {{ 'route.points' | t: { rendered: route().renderedGpsPoints, total: route().totalGpsPoints } }}
        </p>
      </div>

      <div *ngIf="route().hasGps; else noGps" class="overflow-hidden rounded-md border border-line bg-slate-50">
        <svg class="block h-64 w-full" viewBox="0 0 640 220" preserveAspectRatio="xMidYMid meet" role="img" [attr.aria-label]="'route.aria' | t">
          <rect x="0" y="0" width="640" height="220" fill="#f8fafc"></rect>
          <g stroke="#cbd5e1" stroke-width="1">
            <line x1="16" y1="55" x2="624" y2="55"></line>
            <line x1="16" y1="110" x2="624" y2="110"></line>
            <line x1="16" y1="165" x2="624" y2="165"></line>
          </g>
          <polyline
            data-testid="activity-route-polyline"
            [attr.points]="route().polyline"
            fill="none"
            stroke="#0f766e"
            stroke-width="4"
            stroke-linecap="round"
            stroke-linejoin="round"
          ></polyline>
        </svg>
      </div>

      <ng-template #noGps>
        <div class="rounded-md border border-dashed border-line bg-slate-50 px-4 py-10 text-center text-sm text-slate-600" data-testid="activity-route-no-gps">
          {{ 'route.noGps' | t }}
        </div>
      </ng-template>
    </section>
  `
})
export class ActivityRoutePreviewComponent {
  readonly activity = input<NormalizedActivity | null>(null);
  readonly route = computed(() => buildRoutePreview(this.activity()?.trackpoints ?? []));
}
