import { ExportFormat } from './export-format.model';

export type GarminReadyStatus = 'ready' | 'warning' | 'error' | 'unsupported';

export type GarminValidationLevel = 'pre_export' | 'xml_structure' | 'local_sdk' | 'partial';

export interface GarminReadyFormatValidation {
  format: ExportFormat;
  status: GarminReadyStatus;
  validationLevel: GarminValidationLevel;
  recordCount: number | null;
  warnings: string[];
  errors: string[];
}

export interface GarminReadyReportItem {
  path: string;
  filename: string;
  sourceFileKind: string;
  activityId: string | null;
  sport: string;
  sportDetail: string | null;
  startTime: string | null;
  status: GarminReadyStatus;
  message: string;
  possibleFormats: ExportFormat[];
  hasGps: boolean;
  hasHeartRate: boolean;
  trackpointCount: number;
  warnings: string[];
  errors: string[];
  formatValidations: GarminReadyFormatValidation[];
}
