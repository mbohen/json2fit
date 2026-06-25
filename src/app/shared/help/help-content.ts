export type HelpSectionId =
  | 'download-polar-export'
  | 'import-files'
  | 'tcx-vs-fit'
  | 'import-to-garmin'
  | 'troubleshooting'
  | 'sleep-and-wellness'
  | 'privacy';

export type HelpTermKey = 'TCX' | 'FIT' | 'GPX' | 'trackpoint' | 'GPS' | 'HR' | 'cadence' | 'power';

export interface HelpSectionDefinition {
  readonly id: HelpSectionId;
  readonly externalHref?: string;
}

export const HELP_SECTIONS: readonly HelpSectionDefinition[] = [
  {
    id: 'download-polar-export',
    externalHref: 'https://account.polar.com/#export'
  },
  { id: 'import-files' },
  { id: 'tcx-vs-fit' },
  { id: 'import-to-garmin' },
  { id: 'troubleshooting' },
  { id: 'sleep-and-wellness' },
  { id: 'privacy' }
];

export const HELP_TERMS: readonly HelpTermKey[] = ['TCX', 'FIT', 'GPX', 'trackpoint', 'GPS', 'HR', 'cadence', 'power'];

export function helpSectionTitleKey(id: HelpSectionId): string {
  return `help.sections.${id}.title`;
}
