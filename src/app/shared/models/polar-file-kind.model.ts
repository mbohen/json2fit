export type PolarFileKind =
  | 'training_session'
  | 'activity'
  | 'account_data'
  | 'account_profile'
  | 'ohr_sensor'
  | 'product_devices'
  | 'sleep_results'
  | 'sport_profiles'
  | 'calendar_items'
  | 'numeric_prefix_json'
  | 'unknown_json'
  | 'invalid_json'
  | 'unsupported';

export type ClassificationStatus =
  | 'ready'
  | 'skipped_sensitive'
  | 'skipped_non_training'
  | 'needs_analysis'
  | 'invalid'
  | 'skipped';

export type PolarFileCategory =
  | 'training_session'
  | 'daily_activity'
  | 'sleep_or_wellness'
  | 'account_data'
  | 'unknown_numeric'
  | 'unknown_json'
  | 'ignored_non_json'
  | 'invalid_json';

export type PolarFileConfidence = 'high' | 'medium' | 'low';
