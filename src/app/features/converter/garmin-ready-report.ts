import { GarminReadyReportItem } from '@shared/models';

export function garminReadyReportToCsv(report: GarminReadyReportItem[]): string {
  const header = [
    'path',
    'filename',
    'status',
    'message',
    'possibleFormats',
    'gps',
    'heartRate',
    'trackpoints',
    'sport',
    'sportDetail',
    'startTime',
    'warnings',
    'errors',
    'formatValidations'
  ];
  const rows = report.map((item) =>
    [
      item.path,
      item.filename,
      item.status,
      item.message,
      item.possibleFormats.join('; '),
      item.hasGps ? 'yes' : 'no',
      item.hasHeartRate ? 'yes' : 'no',
      String(item.trackpointCount),
      item.sport,
      item.sportDetail ?? '',
      item.startTime ?? '',
      item.warnings.join('; '),
      item.errors.join('; '),
      item.formatValidations
        .map((validation) =>
          [
            validation.format,
            validation.validationLevel,
            validation.status,
            validation.recordCount ?? '',
            validation.warnings.join('|'),
            validation.errors.join('|')
          ].join(':')
        )
        .join('; ')
    ].map(csvEscape)
  );
  return [header.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

function csvEscape(value: string): string {
  if (!/[",\n\r;]/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}
