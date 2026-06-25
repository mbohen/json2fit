import { Injectable, inject } from '@angular/core';
import plTranslations from '../../../assets/i18n/pl.json';
import { I18nService } from '@app/core/i18n/i18n.service';
import { ActivitySummary } from '@shared/models';

const PL_SPORTS = (plTranslations as { sports: Record<string, string> }).sports;
const UNKNOWN_SPORT_KEY = 'other';
export const UNKNOWN_SPORT_DISPLAY_NAME_PL = PL_SPORTS[UNKNOWN_SPORT_KEY] ?? 'Inna aktywność';

@Injectable({ providedIn: 'root' })
export class SportDisplayNameService {
  private readonly i18n = inject(I18nService);

  displaySportName(raw: string | null | undefined): string {
    return this.displaySportNameOrNull(raw) ?? this.i18n.t('sports.other');
  }

  displayActivitySportName(activity: Pick<ActivitySummary, 'sport' | 'sportDetail'>): string {
    const detailName = this.displaySportNameOrNull(activity.sportDetail);
    if (detailName && detailName !== this.i18n.t('sports.other')) {
      return detailName;
    }
    const sportName = this.displaySportNameOrNull(activity.sport);
    return sportName ?? detailName ?? this.i18n.t('sports.other');
  }

  private displaySportNameOrNull(raw: string | null | undefined): string | null {
    const trimmed = cleanDisplayValue(raw);
    if (!trimmed) {
      return null;
    }
    const key = normalizeSportKey(trimmed);
    if (!key) {
      return null;
    }
    const translationKey = `sports.${key}`;
    const translated = this.i18n.t(translationKey);
    return translated === translationKey ? null : translated;
  }
}

export function normalizeSportKey(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) {
    return '';
  }
  return String(raw)
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pl-PL')
    .replace(/[\s-]+/g, '_')
    .replace(/[^\p{L}\p{N}_]+/gu, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function displaySportNamePl(raw: string | null | undefined): string {
  const key = normalizeSportKey(raw);
  return (key ? PL_SPORTS[key] : null) ?? UNKNOWN_SPORT_DISPLAY_NAME_PL;
}

export function displayActivitySportName(activity: Pick<ActivitySummary, 'sport' | 'sportDetail'>): string {
  const detailName = displaySportNamePlOrNull(activity.sportDetail);
  if (detailName && detailName !== UNKNOWN_SPORT_DISPLAY_NAME_PL) {
    return detailName;
  }
  const sportName = displaySportNamePlOrNull(activity.sport);
  return sportName ?? detailName ?? UNKNOWN_SPORT_DISPLAY_NAME_PL;
}

function displaySportNamePlOrNull(raw: string | null | undefined): string | null {
  const key = normalizeSportKey(raw);
  return key ? (PL_SPORTS[key] ?? null) : null;
}

function cleanDisplayValue(raw: string | null | undefined): string {
  return raw === null || raw === undefined ? '' : String(raw).trim().replace(/\s+/g, ' ');
}
