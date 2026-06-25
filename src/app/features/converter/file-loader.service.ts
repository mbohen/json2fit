import { Injectable, inject } from '@angular/core';
import JSZip from 'jszip';
import { I18nService } from '@app/core/i18n/i18n.service';
import {
  FileLoadIssue,
  FileLoadProgress,
  FileLoadResult,
  FileLoadSource,
  ImportedPolarFile,
  InputDataFile,
  InputFile
} from '@shared/models';

export const MAX_JSON_FILE_SIZE_BYTES = 25 * 1024 * 1024;
export const MAX_ZIP_FILE_SIZE_BYTES = 250 * 1024 * 1024;
export type FileLoadProgressCallback = (progress: FileLoadProgress) => void;

@Injectable({ providedIn: 'root' })
export class FileLoaderService {
  private readonly i18n = inject(I18nService);

  async loadFiles(fileList: FileList | File[], onProgress?: FileLoadProgressCallback): Promise<FileLoadResult> {
    const files = Array.from(fileList);
    const source: FileLoadSource = files.some(hasBrowserRelativePath) ? 'folder' : 'files';

    if (source !== 'folder' && files.length === 1 && isZipFile(files[0])) {
      return this.loadZip(files[0], onProgress);
    }

    if (source !== 'folder' && files.some(isZipFile)) {
      return {
        files: [],
        issues: [
          {
            filename: files.map((file) => file.name).join(', '),
            reason: this.i18n.t('converter.fileIssues.zipWithOtherFiles')
          }
        ],
        source: 'files'
      };
    }

    return this.loadBrowserFiles(files, source, onProgress);
  }

  private async loadBrowserFiles(
    files: File[],
    source: Exclude<FileLoadSource, 'zip'>,
    onProgress?: FileLoadProgressCallback
  ): Promise<FileLoadResult> {
    const dataFiles = normalizeInputDataFiles(
      files.map((file) => ({
        source,
        name: basename(browserImportPath(file)),
        path: browserImportPath(file),
        size: file.size,
        type: file.type,
        text: () => this.readText(file)
      }))
    );

    const result = await this.loadInputDataFiles(dataFiles, {
      onProgress,
      readFailedReason: () => this.i18n.t('converter.fileIssues.readFailed'),
      reportUnsupportedAsIssue: source === 'files',
      enforceJsonSizeLimit: true
    });

    return { ...result, source };
  }

  private async loadInputDataFiles(
    dataFiles: InputDataFile[],
    options: {
      onProgress?: FileLoadProgressCallback;
      readFailedReason: () => string;
      reportUnsupportedAsIssue: boolean;
      enforceJsonSizeLimit: boolean;
    }
  ): Promise<Pick<FileLoadResult, 'files' | 'issues' | 'importedFiles'>> {
    const loaded: InputFile[] = [];
    const issues: FileLoadIssue[] = [];
    const importedFiles: ImportedPolarFile[] = [];
    let processed = 0;

    options.onProgress?.({ stage: 'scanning_files', processedFiles: 0, totalFiles: dataFiles.length });

    for (const file of dataFiles) {
      processed += 1;
      const path = file.path;
      const filename = file.name || basename(path);
      const extension = fileExtension(filename);

      options.onProgress?.({
        stage: extension === '.json' ? 'parsing_json' : 'scanning_files',
        processedFiles: processed,
        totalFiles: dataFiles.length,
        currentPath: path
      });

      if (!path) {
        continue;
      }

      if (isSystemJunkPath(path)) {
        importedFiles.push({ path, filename, extension, sizeBytes: file.size, kind: 'ignored' });
        continue;
      }

      if (extension !== '.json') {
        importedFiles.push({ path, filename, extension, sizeBytes: file.size, kind: 'unsupported' });
        if (options.reportUnsupportedAsIssue) {
          issues.push({
            filename: path,
            reason: this.i18n.t('converter.fileIssues.skippedNonJson')
          });
        }
        continue;
      }

      if (options.enforceJsonSizeLimit && file.size > MAX_JSON_FILE_SIZE_BYTES) {
        const reason = this.i18n.t('converter.fileIssues.jsonTooLarge', {
          limit: MAX_JSON_FILE_SIZE_BYTES / 1024 / 1024
        });
        importedFiles.push({ path, filename, extension, sizeBytes: file.size, kind: 'json', parseError: reason });
        issues.push({ filename: path, reason });
        continue;
      }

      let textContent = '';
      let parseError: string | undefined;
      try {
        textContent = await file.text();
      } catch {
        parseError = options.readFailedReason();
        importedFiles.push({ path, filename, extension, sizeBytes: file.size, kind: 'json', parseError });
        issues.push({ filename: path, reason: parseError });
        continue;
      }

      try {
        JSON.parse(textContent);
      } catch (error) {
        parseError = this.i18n.t('converter.fileIssues.invalidJson', {
          message: error instanceof Error ? error.message : String(error)
        });
      }

      const size = file.size || new TextEncoder().encode(textContent).byteLength;
      importedFiles.push({ path, filename, extension, sizeBytes: size, kind: 'json', parseError });
      loaded.push({
        filename: path,
        jsonText: textContent,
        size,
        mimeType: file.type ?? ''
      });
    }

    options.onProgress?.({
      stage: 'done',
      processedFiles: dataFiles.length,
      totalFiles: dataFiles.length,
      currentPath: dataFiles[dataFiles.length - 1]?.path
    });

    return { files: loaded, issues, importedFiles };
  }

  private async loadZip(file: File, onProgress?: FileLoadProgressCallback): Promise<FileLoadResult> {
    if (file.size > MAX_ZIP_FILE_SIZE_BYTES) {
      return {
        files: [],
        issues: [
          {
            filename: file.name,
            reason: this.i18n.t('converter.fileIssues.zipTooLarge', { limit: MAX_ZIP_FILE_SIZE_BYTES / 1024 / 1024 })
          }
        ],
        importedFiles: [],
        source: 'zip',
        sourceFilename: file.name
      };
    }

    onProgress?.({ stage: 'reading_zip', processedFiles: 0, totalFiles: 1, currentPath: file.name });

    let zip: JSZip;
    try {
      const content = await this.readArrayBuffer(file);
      onProgress?.({ stage: 'unzipping', processedFiles: 0, totalFiles: 1, currentPath: file.name });
      zip = await JSZip.loadAsync(content);
    } catch {
      onProgress?.({ stage: 'error', processedFiles: 0, totalFiles: 1, currentPath: file.name });
      return {
        files: [],
        issues: [
          {
            filename: file.name,
            reason: this.i18n.t('converter.fileIssues.zipUnpackFailed')
          }
        ],
        importedFiles: [],
        source: 'zip',
        sourceFilename: file.name
      };
    }

    const entries = Object.values(zip.files);
    const sharedRoot = commonTopLevelDirectory(
      entries.filter((entry) => !entry.dir).map((entry) => normalizeImportPath(entry.name))
    );
    const dataFiles = entries
      .filter((entry) => !entry.dir)
      .map((entry) => {
        const path = stripSharedRoot(normalizeImportPath(entry.name), sharedRoot);
        return {
          source: 'zip' as const,
          name: basename(path),
          path,
          size: entrySize(entry),
          type: 'application/json',
          text: async () => {
            const bytes = await entry.async('uint8array');
            return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          }
        } satisfies InputDataFile;
      });

    const result = await this.loadInputDataFiles(dataFiles, {
      onProgress,
      readFailedReason: () => this.i18n.t('converter.fileIssues.utf8Failed'),
      reportUnsupportedAsIssue: false,
      enforceJsonSizeLimit: false
    });

    if (!result.files.length) {
      result.issues.push({
        filename: file.name,
        reason: result.importedFiles?.some((item) => item.kind === 'json')
          ? this.i18n.t('converter.fileIssues.zipJsonUnreadable')
          : this.i18n.t('converter.fileIssues.zipNoJson')
      });
    }

    return {
      ...result,
      source: 'zip',
      sourceFilename: file.name
    };
  }

  private readText(file: File): Promise<string> {
    if (typeof file.text === 'function') {
      return file.text();
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error(this.i18n.t('converter.fileIssues.readFailed')));
      reader.readAsText(file);
    });
  }

  private readArrayBuffer(file: File): Promise<ArrayBuffer> {
    if (typeof file.arrayBuffer === 'function') {
      return file.arrayBuffer();
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error ?? new Error(this.i18n.t('converter.fileIssues.zipUnpackFailed')));
      reader.readAsArrayBuffer(file);
    });
  }
}

function isZipFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return lowerName.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
}

function hasBrowserRelativePath(file: File): boolean {
  return Boolean((file as File & { webkitRelativePath?: string }).webkitRelativePath);
}

function browserImportPath(file: File): string {
  return normalizeImportPath((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name);
}

function normalizeInputDataFiles(files: InputDataFile[]): InputDataFile[] {
  const sharedRoot = commonTopLevelDirectory(files.map((file) => file.path));
  return files.map((file) => {
    const path = stripSharedRoot(file.path, sharedRoot);
    return {
      ...file,
      path,
      name: basename(path)
    };
  });
}

function normalizeImportPath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/');
}

function commonTopLevelDirectory(paths: string[]): string | null {
  const segments = paths
    .filter(Boolean)
    .map((path) => path.split('/').filter(Boolean));
  if (!segments.length || segments.some((pathSegments) => pathSegments.length < 2)) {
    return null;
  }
  const [root] = segments[0];
  return segments.every((pathSegments) => pathSegments[0] === root) ? root : null;
}

function stripSharedRoot(path: string, sharedRoot: string | null): string {
  if (!sharedRoot) {
    return path;
  }
  if (path === sharedRoot) {
    return '';
  }
  return path.startsWith(`${sharedRoot}/`) ? path.slice(sharedRoot.length + 1) : path;
}

function basename(path: string): string {
  const normalized = path.replace(/\/+$/, '');
  return normalized.split('/').pop() ?? normalized;
}

function fileExtension(filename: string): string {
  const index = filename.lastIndexOf('.');
  return index >= 0 ? filename.slice(index).toLowerCase() : '';
}

function isSystemJunkPath(path: string): boolean {
  const segments = path.split('/').filter(Boolean);
  return segments.some((segment) => {
    const lower = segment.toLowerCase();
    return lower === '__macosx' || lower === '.ds_store' || lower === 'thumbs.db' || lower === 'desktop.ini';
  });
}

function entrySize(entry: JSZip.JSZipObject): number {
  const privateEntry = entry as unknown as { _data?: { uncompressedSize?: number } };
  return privateEntry._data?.uncompressedSize ?? 0;
}
