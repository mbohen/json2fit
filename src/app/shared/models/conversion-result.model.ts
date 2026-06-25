import { ActivitySummary, NormalizedActivity } from './activity.model';
import { GarminReadyReportItem } from './garmin-ready.model';
import {
  ClassificationStatus,
  PolarFileCategory,
  PolarFileConfidence,
  PolarFileKind
} from './polar-file-kind.model';
import { ExportFormat } from './export-format.model';

export interface PolarFileClassification {
  path: string;
  filename: string;
  sizeBytes: number;
  category: PolarFileCategory;
  confidence: PolarFileConfidence;
  reason: string;
  warnings: string[];
  detectedKeys: string[];
}

export interface PolarFileClassificationResult extends PolarFileClassification {
  kind: PolarFileKind;
  status: ClassificationStatus;
  isConvertible: boolean;
  activity?: ActivitySummary;
  garminReady?: GarminReadyReportItem;
}

export interface ConversionResult {
  status: 'success' | 'error';
  format: ExportFormat;
  filename: string;
  mimeType: string;
  content: string | Uint8Array;
  warnings: string[];
  errors: string[];
  activity?: ActivitySummary;
  garminReady?: GarminReadyReportItem;
}

export interface NormalizedActivityResult {
  status: 'success' | 'error';
  filename: string;
  mimeType: string;
  content: string;
  warnings: string[];
  errors: string[];
  activity?: NormalizedActivity;
  garminReady?: GarminReadyReportItem;
}
