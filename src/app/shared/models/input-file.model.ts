export interface InputFile {
  filename: string;
  jsonText: string;
  size: number;
  mimeType: string;
}

export type FileLoadSource = 'files' | 'zip' | 'folder';

export interface InputDataFile {
  source: FileLoadSource;
  name: string;
  path: string;
  size: number;
  type?: string;
  text: () => Promise<string>;
}

export interface FileLoadIssue {
  filename: string;
  reason: string;
}

export type ImportedPolarFileKind = 'json' | 'ignored' | 'unsupported';

export interface ImportedPolarFile {
  path: string;
  filename: string;
  extension: string;
  sizeBytes: number;
  kind: ImportedPolarFileKind;
  textContent?: string;
  parseError?: string;
}

export type FileLoadProgressStage =
  | 'reading_zip'
  | 'unzipping'
  | 'scanning_files'
  | 'parsing_json'
  | 'classifying'
  | 'analyzing_wellness'
  | 'done'
  | 'error';

export interface FileLoadProgress {
  stage: FileLoadProgressStage;
  processedFiles: number;
  totalFiles: number;
  currentPath?: string;
}

export interface FileLoadResult {
  files: InputFile[];
  issues: FileLoadIssue[];
  importedFiles?: ImportedPolarFile[];
  source: FileLoadSource;
  sourceFilename?: string;
}
