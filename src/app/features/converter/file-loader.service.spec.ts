import { TestBed } from '@angular/core/testing';
import JSZip from 'jszip';
import { FileLoaderService, MAX_JSON_FILE_SIZE_BYTES, MAX_ZIP_FILE_SIZE_BYTES } from './file-loader.service';

describe('FileLoaderService', () => {
  let service: FileLoaderService;

  beforeEach(() => {
    localStorage.setItem('json2fit.language', 'pl');
    service = TestBed.inject(FileLoaderService);
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('loads JSON files', async () => {
    const file = new File(['{"ok": true}'], 'training-session.json', { type: 'application/json' });
    const result = await service.loadFiles([file]);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].filename).toBe('training-session.json');
    expect(result.files[0].jsonText).toContain('"ok"');
    expect(result.issues).toHaveLength(0);
  });

  it('reports non-json files', async () => {
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    const result = await service.loadFiles([file]);

    expect(result.files).toHaveLength(0);
    expect(result.issues[0].reason).toContain('.json');
  });

  it('reports files above the configured size limit', async () => {
    const file = new File(['x'], 'big.json', { type: 'application/json' });
    Object.defineProperty(file, 'size', { value: MAX_JSON_FILE_SIZE_BYTES + 1 });

    const result = await service.loadFiles([file]);

    expect(result.files).toHaveLength(0);
    expect(result.issues[0].reason).toContain('limit');
  });

  it('loads JSON files from a ZIP archive', async () => {
    const zipFile = await createZipFile({
      'training-session-1.json': '{"sport": "running"}',
      'nested/activity-1.json': '{"activity": true}'
    });
    const progressStages: string[] = [];

    const result = await service.loadFiles([zipFile], (progress) => progressStages.push(progress.stage));

    expect(result.source).toBe('zip');
    expect(result.files.map((file) => file.filename)).toEqual(['training-session-1.json', 'nested/activity-1.json']);
    expect(result.importedFiles?.filter((file) => file.kind === 'json')).toHaveLength(2);
    expect(result.issues).toHaveLength(0);
    expect(progressStages).toContain('reading_zip');
    expect(progressStages).toContain('unzipping');
    expect(progressStages).toContain('parsing_json');
    expect(progressStages).toContain('done');
  });

  it('normalizes folder and ZIP imports from the same file tree to the same paths and counts', async () => {
    const fileTree = {
      'PolarFlowExport/training-session-1.json': '{"sport": "running"}',
      'PolarFlowExport/nested/activity-1.json': '{"activity": true}',
      'PolarFlowExport/.DS_Store': 'metadata',
      'PolarFlowExport/notes.txt': 'readme'
    };
    const folderFiles = [
      createFolderFile(fileTree['PolarFlowExport/training-session-1.json'], 'training-session-1.json', 'PolarFlowExport/training-session-1.json'),
      createFolderFile(fileTree['PolarFlowExport/nested/activity-1.json'], 'activity-1.json', 'PolarFlowExport/nested/activity-1.json'),
      createFolderFile(fileTree['PolarFlowExport/.DS_Store'], '.DS_Store', 'PolarFlowExport/.DS_Store'),
      createFolderFile(fileTree['PolarFlowExport/notes.txt'], 'notes.txt', 'PolarFlowExport/notes.txt', 'text/plain')
    ];
    const zipFile = await createZipFile(fileTree);

    const folderResult = await service.loadFiles(folderFiles);
    const zipResult = await service.loadFiles([zipFile]);

    expect(folderResult.source).toBe('folder');
    expect(zipResult.source).toBe('zip');
    expect(importShape(folderResult)).toEqual(importShape(zipResult));
  });

  it('reports folder subdirectory, system and non-json files while loading JSON with an empty MIME type', async () => {
    const folderFiles = [
      createFolderFile('{"sport": "running"}', 'training-session-1.json', 'PolarFlowExport/sub/training-session-1.json'),
      createFolderFile('metadata', '.DS_Store', 'PolarFlowExport/.DS_Store'),
      createFolderFile('readme', 'notes.txt', 'PolarFlowExport/docs/notes.txt', 'text/plain')
    ];

    const result = await service.loadFiles(folderFiles);

    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatchObject({
      filename: 'sub/training-session-1.json',
      mimeType: ''
    });
    expect(result.importedFiles?.map((file) => [file.path, file.kind])).toEqual([
      ['sub/training-session-1.json', 'json'],
      ['.DS_Store', 'ignored'],
      ['docs/notes.txt', 'unsupported']
    ]);
  });

  it('treats a ZIP inside a selected folder as unsupported while still loading JSON files', async () => {
    const folderFiles = [
      createFolderFile('not really a zip', 'archive.zip', 'PolarFlowExport/archive.zip', 'application/zip'),
      createFolderFile('{"sport": "running"}', 'training-session-1.json', 'PolarFlowExport/training-session-1.json')
    ];

    const result = await service.loadFiles(folderFiles);

    expect(result.source).toBe('folder');
    expect(result.files.map((file) => file.filename)).toEqual(['training-session-1.json']);
    expect(result.importedFiles?.map((file) => [file.path, file.kind])).toEqual([
      ['archive.zip', 'unsupported'],
      ['training-session-1.json', 'json']
    ]);
    expect(result.issues).toHaveLength(0);
  });

  it('reports a ZIP without JSON files', async () => {
    const zipFile = await createZipFile({
      'notes.txt': 'hello',
      'images/map.png': 'binary'
    });

    const result = await service.loadFiles([zipFile]);

    expect(result.source).toBe('zip');
    expect(result.files).toHaveLength(0);
    expect(result.issues[0].reason).toContain('nie zawiera plików JSON');
    expect(result.importedFiles?.filter((file) => file.kind === 'unsupported')).toHaveLength(2);
  });

  it('ignores system junk files in a ZIP archive', async () => {
    const zipFile = await createZipFile({
      '__MACOSX/._training-session.json': '{}',
      '.DS_Store': 'x',
      'training-session-1.json': '{}'
    });

    const result = await service.loadFiles([zipFile]);

    expect(result.files.map((file) => file.filename)).toEqual(['training-session-1.json']);
    expect(result.importedFiles?.filter((file) => file.kind === 'ignored')).toHaveLength(2);
  });

  it('reports a corrupted ZIP archive', async () => {
    const result = await service.loadFiles([new File(['not-a-zip'], 'polar-export.zip', { type: 'application/zip' })]);

    expect(result.source).toBe('zip');
    expect(result.files).toHaveLength(0);
    expect(result.issues[0].reason).toContain('Nie udało się rozpakować ZIP');
  });

  it('reports ZIP files above the configured size limit', async () => {
    const file = new File(['x'], 'big.zip', { type: 'application/zip' });
    Object.defineProperty(file, 'size', { value: MAX_ZIP_FILE_SIZE_BYTES + 1 });

    const result = await service.loadFiles([file]);

    expect(result.files).toHaveLength(0);
    expect(result.issues[0].reason).toContain('250 MB');
  });

  it('reports JSON files with unsupported encoding inside a ZIP', async () => {
    const zip = new JSZip();
    zip.file('broken.json', new Uint8Array([0xff, 0xfe, 0xfd]));
    const file = new File([await zip.generateAsync({ type: 'blob' })], 'polar-export.zip', { type: 'application/zip' });

    const result = await service.loadFiles([file]);

    expect(result.files).toHaveLength(0);
    expect(result.importedFiles?.[0]?.parseError).toContain('UTF-8');
    expect(result.issues.map((issue) => issue.reason).join(' ')).toContain('UTF-8');
  });

  it('keeps invalid JSON text so the classifier can mark it invalid', async () => {
    const zipFile = await createZipFile({
      'training-session-broken.json': '{"broken":'
    });

    const result = await service.loadFiles([zipFile]);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].jsonText).toBe('{"broken":');
    expect(result.importedFiles?.[0]?.parseError).toContain('Niepoprawny JSON');
  });
});

async function createZipFile(files: Record<string, string>): Promise<File> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  return new File([await zip.generateAsync({ type: 'blob' })], 'polar-export.zip', { type: 'application/zip' });
}

function createFolderFile(content: string, name: string, relativePath: string, type = ''): File {
  const file = new File([content], name, { type });
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
  return file;
}

function importShape(result: Awaited<ReturnType<FileLoaderService['loadFiles']>>): {
  filenames: string[];
  importedFiles: Array<[string, string]>;
  jsonCount: number;
  ignoredCount: number;
  unsupportedCount: number;
} {
  const importedFiles = result.importedFiles ?? [];
  return {
    filenames: result.files.map((file) => file.filename),
    importedFiles: importedFiles.map((file) => [file.path, file.kind]),
    jsonCount: importedFiles.filter((file) => file.kind === 'json').length,
    ignoredCount: importedFiles.filter((file) => file.kind === 'ignored').length,
    unsupportedCount: importedFiles.filter((file) => file.kind === 'unsupported').length
  };
}
