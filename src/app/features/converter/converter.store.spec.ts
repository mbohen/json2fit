import { signal } from '@angular/core';
import JSZip from 'jszip';
import { BETA_SIGNAL_COUNTERS_STORAGE_KEY } from '@features/beta/beta-signal.model';
import { BetaSignalService } from '@features/beta/beta-signal.service';
import {
  ActivitySummary,
  ConversionResult,
  FileLoadResult,
  GarminReadyReportItem,
  ImportedPolarFile,
  InputFile,
  NormalizedActivity,
  NormalizedActivityResult,
  PolarFileClassification,
  PolarFileClassificationResult,
  WellnessReport
} from '@shared/models';
import { classificationReportToCsv, ConverterStore, MAX_WORKER_BATCH_PAYLOAD_BYTES } from './converter.store';
import { emptyWellnessReport } from './wellness-exporter';

describe('ConverterStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('clears previous import data immediately when a new file load starts', async () => {
    let resolveLoad!: (result: FileLoadResult) => void;
    const loadPromise = new Promise<FileLoadResult>((resolve) => {
      resolveLoad = resolve;
    });
    const fileLoader = {
      loadFiles: vi.fn(() => loadPromise)
    };
    const store = new ConverterStore(
      fileLoader as never,
      { status: signal('idle'), error: signal(null) } as never,
      {} as never
    );
    const oldFile: InputFile = {
      filename: 'old-training-session.json',
      jsonText: '{}',
      size: 2,
      mimeType: 'application/json'
    };

    store.files.set([oldFile]);
    store.fileIssues.set([{ filename: 'old-broken.json', reason: 'old issue' }]);
    store.importedPolarFiles.set([
      {
        path: 'old-training-session.json',
        filename: 'old-training-session.json',
        extension: '.json',
        sizeBytes: 2,
        kind: 'json'
      }
    ]);
    store.importProgress.set({ stage: 'done', processedFiles: 1, totalFiles: 1, currentPath: 'old.zip' });
    store.importedZipFilename.set('old.zip');
    store.classifications.set([classificationFixture(oldFile)]);
    store.wellnessReport.set(wellnessReportFixture());
    store.conversionResults.set([
      {
        status: 'success',
        format: 'tcx',
        filename: 'old.tcx',
        mimeType: 'application/vnd.garmin.tcx+xml',
        content: '<TrainingCenterDatabase />',
        warnings: [],
        errors: []
      }
    ]);
    store.migrationExportProgress.set({
      phase: 'done',
      totalActivities: 1,
      processedActivities: 1,
      currentFile: 'old.tcx',
      successes: 1,
      warnings: 0,
      errors: 0
    });
    store.lastSuccessfulExport.set({
      kind: 'zip',
      filename: 'old-export.zip',
      completedAt: '2024-01-01T00:00:00.000Z'
    });
    store.errors.set(['old error']);

    const importPromise = store.loadFiles([new File(['zip'], 'new.zip', { type: 'application/zip' })]);

    expect(store.files()).toEqual([]);
    expect(store.fileIssues()).toEqual([]);
    expect(store.importedPolarFiles()).toEqual([]);
    expect(store.importProgress()).toBeNull();
    expect(store.importedZipFilename()).toBeNull();
    expect(store.classifications()).toEqual([]);
    expect(store.wellnessReport()).toBeNull();
    expect(store.conversionResults()).toEqual([]);
    expect(store.migrationExportProgress()).toBeNull();
    expect(store.lastSuccessfulExport()).toBeNull();
    expect(store.errors()).toEqual([]);
    expect(store.message()).toBe('Wczytywanie plików...');

    resolveLoad({ files: [], issues: [], importedFiles: [], source: 'zip', sourceFilename: 'new.zip' });
    await importPromise;
  });

  it('clears the successful export notice when clearing the session', () => {
    const store = new ConverterStore(
      {} as never,
      { status: signal('idle'), error: signal(null) } as never,
      {} as never
    );
    store.lastSuccessfulExport.set({
      kind: 'zip',
      filename: 'polar-to-garmin-export.zip',
      completedAt: '2024-01-01T00:00:00.000Z'
    });

    store.clearSession();

    expect(store.lastSuccessfulExport()).toBeNull();
  });

  it('ignores stale import results after a newer file load starts', async () => {
    const firstFile: InputFile = {
      filename: 'first-training-session.json',
      jsonText: '{}',
      size: 2,
      mimeType: 'application/json'
    };
    const secondFile: InputFile = {
      filename: 'second-training-session.json',
      jsonText: '{}',
      size: 2,
      mimeType: 'application/json'
    };
    const pendingLoads: Array<(result: FileLoadResult) => void> = [];
    const fileLoader = {
      loadFiles: vi.fn(
        () =>
          new Promise<FileLoadResult>((resolve) => {
            pendingLoads.push(resolve);
          })
      )
    };
    const pyodide = {
      status: signal('idle'),
      error: signal(null),
      classifyFiles: vi.fn(async (files: InputFile[]) => files.map((file) => classificationFixture(file))),
      analyzeWellnessFiles: vi.fn(async () => emptyWellnessReport())
    };
    const store = new ConverterStore(fileLoader as never, pyodide as never, {} as never);

    const firstImport = store.loadFiles([new File(['zip'], 'first.zip', { type: 'application/zip' })]);
    const secondImport = store.loadFiles([new File(['zip'], 'second.zip', { type: 'application/zip' })]);

    expect(pendingLoads).toHaveLength(2);
    pendingLoads[1]({
      files: [secondFile],
      issues: [],
      importedFiles: [importedJsonFixture(secondFile)],
      source: 'zip',
      sourceFilename: 'second.zip'
    });
    await secondImport;

    expect(store.importedZipFilename()).toBe('second.zip');
    expect(store.classifications().map((item) => item.path)).toEqual(['second-training-session.json']);

    pendingLoads[0]({
      files: [firstFile],
      issues: [],
      importedFiles: [importedJsonFixture(firstFile)],
      source: 'zip',
      sourceFilename: 'first.zip'
    });
    await firstImport;

    expect(store.importedZipFilename()).toBe('second.zip');
    expect(store.classifications().map((item) => item.path)).toEqual(['second-training-session.json']);
    expect(store.importProgress()?.stage).toBe('done');
  });

  it('passes JSON files extracted from ZIP to the classifier', async () => {
    const inputFiles: InputFile[] = [
      {
        filename: 'export/training-session-1.json',
        jsonText: '{"ok": true}',
        size: 12,
        mimeType: 'application/json'
      }
    ];
    const classifications: PolarFileClassificationResult[] = [
      {
        path: 'export/training-session-1.json',
        filename: 'training-session-1.json',
        sizeBytes: 12,
        category: 'training_session',
        confidence: 'high',
        detectedKeys: ['sport'],
        kind: 'training_session',
        status: 'ready',
        isConvertible: true,
        reason: 'ready',
        warnings: []
      }
    ];
    const loadResult: FileLoadResult = {
      files: inputFiles,
      issues: [],
      importedFiles: [
        {
          path: 'export/training-session-1.json',
          filename: 'training-session-1.json',
          extension: '.json',
          sizeBytes: 12,
          kind: 'json',
          textContent: '{"ok": true}'
        }
      ],
      source: 'zip',
      sourceFilename: 'polar-export.zip'
    };
    const fileLoader = {
      loadFiles: vi.fn(async (_files: File[], onProgress?: (progress: unknown) => void) => {
        onProgress?.({ stage: 'parsing_json', processedFiles: 1, totalFiles: 1 });
        return loadResult;
      })
    };
    const pyodide = {
      status: signal('idle'),
      error: signal(null),
      classifyFiles: vi.fn(async () => classifications),
      analyzeWellnessFiles: vi.fn(async () => emptyWellnessReport())
    };
    const store = new ConverterStore(fileLoader as never, pyodide as never, {} as never);

    await store.loadFiles([new File(['zip'], 'polar-export.zip', { type: 'application/zip' })]);

    expect(pyodide.classifyFiles).toHaveBeenCalledWith(inputFiles);
    expect(pyodide.analyzeWellnessFiles).toHaveBeenCalledWith(inputFiles);
    expect(store.classifications()).toEqual(classifications);
    expect(store.importedZipFilename()).toBe('polar-export.zip');
    expect(store.importedJsonCount()).toBe(1);
    expect(store.importProgress()?.stage).toBe('done');
    expect(store.classificationReport()).toEqual(classifications);
  });

  it('records local beta signals for upload, classification and export clicks', async () => {
    const inputFile: InputFile = {
      filename: 'training-session-beta.json',
      jsonText: '{"ok": true}',
      size: 12,
      mimeType: 'application/json'
    };
    const conversionResult: ConversionResult = {
      status: 'success',
      format: 'tcx',
      filename: 'activity.tcx',
      mimeType: 'application/vnd.garmin.tcx+xml',
      content: '<TrainingCenterDatabase />',
      warnings: [],
      errors: []
    };
    const fileLoader = {
      loadFiles: vi.fn(async (): Promise<FileLoadResult> => ({
        files: [inputFile],
        issues: [],
        importedFiles: [importedJsonFixture(inputFile)],
        source: 'files'
      }))
    };
    const pyodide = {
      status: signal('idle'),
      error: signal(null),
      classifyFiles: vi.fn(async () => [classificationFixture(inputFile)]),
      analyzeWellnessFiles: vi.fn(async () => emptyWellnessReport()),
      convertToTcx: vi.fn(async () => conversionResult)
    };
    const downloads = {
      downloadResult: vi.fn(),
      downloadText: vi.fn()
    };
    const store = new ConverterStore(
      fileLoader as never,
      pyodide as never,
      downloads as never,
      undefined,
      undefined,
      new BetaSignalService()
    );

    await store.loadFiles([new File(['{}'], 'training-session-beta.json', { type: 'application/json' })]);
    await store.exportOneTcx(store.classifications()[0]);
    store.exportClassificationReportCsv();

    expect(JSON.parse(localStorage.getItem(BETA_SIGNAL_COUNTERS_STORAGE_KEY) ?? '{}')).toMatchObject({
      upload_started: 1,
      json_uploaded: 1,
      files_classified: 1,
      tcx_export_clicked: 1,
      csv_export_clicked: 1
    });
  });

  it('classifies large ZIP imports in worker-safe batches', async () => {
    const largeText = `{"payload":"${'x'.repeat(Math.ceil(MAX_WORKER_BATCH_PAYLOAD_BYTES / 2))}"}`;
    const inputFiles: InputFile[] = [
      { filename: 'one.json', jsonText: largeText, size: largeText.length, mimeType: 'application/json' },
      { filename: 'two.json', jsonText: largeText, size: largeText.length, mimeType: 'application/json' }
    ];
    const fileLoader = {
      loadFiles: vi.fn(async (): Promise<FileLoadResult> => ({
        files: inputFiles,
        issues: [],
        importedFiles: inputFiles.map((file) => ({
          path: file.filename,
          filename: file.filename,
          extension: '.json',
          sizeBytes: file.size,
          kind: 'json'
        })),
        source: 'zip',
        sourceFilename: 'polar-export.zip'
      }))
    };
    const classificationProgress: Array<ReturnType<ConverterStore['importProgress']>> = [];
    let store!: ConverterStore;
    const pyodide = {
      status: signal('idle'),
      error: signal(null),
      classifyFiles: vi.fn(async (batch: InputFile[]) => {
        classificationProgress.push(store.importProgress());
        return batch.map(
          (file): PolarFileClassificationResult => ({
            path: file.filename,
            filename: file.filename,
            sizeBytes: file.size,
            category: 'unknown_json',
            confidence: 'low',
            detectedKeys: [],
            kind: 'unknown_json',
            status: 'needs_analysis',
            isConvertible: false,
            reason: 'needs analysis',
            warnings: []
          })
        );
      }),
      analyzeWellnessFiles: vi.fn(async () => emptyWellnessReport())
    };
    store = new ConverterStore(fileLoader as never, pyodide as never, {} as never);

    await store.loadFiles([new File(['zip'], 'polar-export.zip', { type: 'application/zip' })]);

    expect(pyodide.classifyFiles).toHaveBeenCalledTimes(2);
    expect(pyodide.analyzeWellnessFiles).toHaveBeenCalledTimes(2);
    expect(pyodide.classifyFiles.mock.calls[0][0]).toHaveLength(1);
    expect(pyodide.classifyFiles.mock.calls[1][0]).toHaveLength(1);
    expect(store.classifications()).toHaveLength(2);
    expect(classificationProgress[0]).toMatchObject({
      stage: 'classifying',
      processedFiles: 0,
      totalFiles: 2,
      currentPath: 'one.json'
    });
    expect(classificationProgress[1]).toMatchObject({
      stage: 'classifying',
      processedFiles: 1,
      totalFiles: 2,
      currentPath: 'two.json'
    });
  });

  it('finishes the import with a visible error when worker classification fails', async () => {
    const inputFiles: InputFile[] = [{ filename: 'training-session.json', jsonText: '{}', size: 2, mimeType: 'application/json' }];
    const fileLoader = {
      loadFiles: vi.fn(async (): Promise<FileLoadResult> => ({
        files: inputFiles,
        issues: [],
        importedFiles: [importedJsonFixture(inputFiles[0])],
        source: 'zip',
        sourceFilename: 'polar-export.zip'
      }))
    };
    const pyodide = {
      status: signal('idle'),
      error: signal(null),
      classifyFiles: vi.fn(async () => {
        throw new Error('Worker konwersji zakończył pracę przed wysłaniem odpowiedzi.');
      }),
      analyzeWellnessFiles: vi.fn(async () => emptyWellnessReport())
    };
    const store = new ConverterStore(fileLoader as never, pyodide as never, {} as never);

    await store.loadFiles([new File(['zip'], 'polar-export.zip', { type: 'application/zip' })]);

    expect(store.busy()).toBe(false);
    expect(store.importProgress()?.stage).toBe('error');
    expect(store.errors()).toEqual(['Worker konwersji zakończył pracę przed wysłaniem odpowiedzi.']);
    expect(store.message()).toBe('Nie udało się przetworzyć plików.');
    expect(pyodide.analyzeWellnessFiles).not.toHaveBeenCalled();
  });

  it('adds non-json ZIP entries to the classification report as ignored files', async () => {
    const inputFiles: InputFile[] = [
      { filename: 'training-session-1.json', jsonText: '{}', size: 2, mimeType: 'application/json' }
    ];
    const fileLoader = {
      loadFiles: vi.fn(async (): Promise<FileLoadResult> => ({
        files: inputFiles,
        issues: [],
        importedFiles: [
          {
            path: 'training-session-1.json',
            filename: 'training-session-1.json',
            extension: '.json',
            sizeBytes: 2,
            kind: 'json'
          },
          {
            path: 'notes.txt',
            filename: 'notes.txt',
            extension: '.txt',
            sizeBytes: 9,
            kind: 'unsupported'
          }
        ],
        source: 'zip',
        sourceFilename: 'polar-export.zip'
      }))
    };
    const pyodide = {
      status: signal('idle'),
      error: signal(null),
      classifyFiles: vi.fn(async (): Promise<PolarFileClassificationResult[]> => [
        {
          path: 'training-session-1.json',
          filename: 'training-session-1.json',
          sizeBytes: 2,
          category: 'training_session',
          confidence: 'medium',
          detectedKeys: [],
          kind: 'training_session',
          status: 'needs_analysis',
          isConvertible: false,
          reason: 'Brakuje danych treningu.',
          warnings: []
        }
      ]),
      analyzeWellnessFiles: vi.fn(async () => emptyWellnessReport())
    };
    const store = new ConverterStore(fileLoader as never, pyodide as never, {} as never);

    await store.loadFiles([new File(['zip'], 'polar-export.zip', { type: 'application/zip' })]);

    expect(store.classificationReport().map((item) => item.category)).toEqual([
      'training_session',
      'ignored_non_json'
    ]);
    expect(store.classificationReport()[1]).toMatchObject({
      path: 'notes.txt',
      filename: 'notes.txt',
      sizeBytes: 9,
      confidence: 'high'
    });
  });

  it('exports classification reports as JSON and CSV with safe escaping', () => {
    const report: PolarFileClassification[] = [
      {
        path: 'folder/training, "quoted".json',
        filename: 'training, "quoted".json',
        sizeBytes: 123,
        category: 'training_session',
        confidence: 'high',
        reason: 'Wykryto "trening".',
        warnings: ['warning, one'],
        detectedKeys: ['sport', 'heartRate']
      }
    ];
    const downloads = {
      downloadText: vi.fn()
    };
    const store = new ConverterStore({} as never, { status: signal('idle'), error: signal(null) } as never, downloads as never);
    store.classifications.set([
      {
        ...report[0],
        kind: 'training_session',
        status: 'ready',
        isConvertible: true
      }
    ]);

    expect(classificationReportToCsv(report)).toContain('"folder/training, ""quoted"".json"');

    store.exportClassificationReportCsv();
    store.exportClassificationReportJson();

    expect(downloads.downloadText).toHaveBeenCalledWith(
      'file-classification-report.csv',
      expect.stringContaining('"warning, one"'),
      'text/csv'
    );
    expect(downloads.downloadText).toHaveBeenCalledWith(
      'file-classification-report.json',
      expect.stringContaining('"detectedKeys"'),
      'application/json'
    );
    expect(store.lastSuccessfulExport()).toMatchObject({
      kind: 'json',
      filename: 'file-classification-report.json',
      completedAt: expect.any(String)
    });
  });

  it('exports Garmin-ready reports as JSON and CSV', () => {
    const downloads = {
      downloadText: vi.fn()
    };
    const store = new ConverterStore({} as never, { status: signal('idle'), error: signal(null) } as never, downloads as never);
    store.classifications.set([
      {
        path: 'training-session-123.json',
        filename: 'training-session-123.json',
        sizeBytes: 128,
        category: 'training_session',
        confidence: 'high',
        detectedKeys: ['sport'],
        kind: 'training_session',
        status: 'ready',
        isConvertible: true,
        reason: 'ready',
        warnings: [],
        activity: activityFixture(),
        garminReady: garminReadyFixture()
      }
    ]);

    store.exportGarminReadyReportCsv();
    store.exportGarminReadyReportJson();

    expect(downloads.downloadText).toHaveBeenCalledWith(
      'garmin-ready-report.csv',
      expect.stringContaining('training-session-123.json'),
      'text/csv'
    );
    expect(downloads.downloadText).toHaveBeenCalledWith(
      'garmin-ready-report.json',
      expect.stringContaining('"status"'),
      'application/json'
    );
    expect(store.lastSuccessfulExport()).toMatchObject({
      kind: 'json',
      filename: 'garmin-ready-report.json',
      completedAt: expect.any(String)
    });
  });

  it('loads only the selected activity preview, caches it in memory and clears it on new import', async () => {
    const firstFile: InputFile = {
      filename: 'training-session-first.json',
      jsonText: '{"sport":"RUNNING"}',
      size: 19,
      mimeType: 'application/json'
    };
    const secondFile: InputFile = {
      filename: 'training-session-second.json',
      jsonText: '{"sport":"RUNNING"}',
      size: 19,
      mimeType: 'application/json'
    };
    let resolveLoad!: (result: FileLoadResult) => void;
    const fileLoader = {
      loadFiles: vi.fn(
        () =>
          new Promise<FileLoadResult>((resolve) => {
            resolveLoad = resolve;
          })
      )
    };
    const normalized = normalizedActivityResultFixture(secondFile.filename);
    const pyodide = {
      status: signal('idle'),
      error: signal(null),
      normalizeActivity: vi.fn(async () => normalized)
    };
    const store = new ConverterStore(fileLoader as never, pyodide as never, {} as never);
    store.files.set([firstFile, secondFile]);
    store.classifications.set([classificationFixture(firstFile), classificationFixture(secondFile)]);

    await store.selectActivityPreview(secondFile.filename);
    await store.selectActivityPreview(secondFile.filename);

    expect(pyodide.normalizeActivity).toHaveBeenCalledTimes(1);
    expect(pyodide.normalizeActivity).toHaveBeenCalledWith(secondFile);
    expect(store.selectedActivityCandidate()?.path).toBe(secondFile.filename);
    expect(store.selectedActivityPreview()?.sourceFilename).toBe(secondFile.filename);

    const importPromise = store.loadFiles([new File(['{}'], 'fresh.json', { type: 'application/json' })]);
    expect(store.activityPreviewCache()).toEqual({});
    expect(store.selectedActivityPath()).toBeNull();
    expect(store.activityPreviewError()).toBeNull();

    resolveLoad({ files: [], issues: [], importedFiles: [], source: 'files' });
    await importPromise;
  });

  it('exports wellness reports as a dedicated ZIP', async () => {
    const downloads = {
      downloadBlob: vi.fn()
    };
    const store = new ConverterStore({} as never, { status: signal('idle'), error: signal(null) } as never, downloads as never);
    store.wellnessReport.set(wellnessReportFixture());

    await store.exportWellnessReportsZip();

    expect(downloads.downloadBlob).toHaveBeenCalledWith(expect.stringMatching(/^polar-wellness-export-/), expect.any(Blob));
    const blob = downloads.downloadBlob.mock.calls[0][1] as Blob;
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file('wellness/daily-activity.csv')).toBeTruthy();
    expect(zip.file('wellness/wellness-report.html')).toBeTruthy();
    expect(store.message()).toContain('Pobrano raporty wellness');
    expect(store.lastSuccessfulExport()).toMatchObject({
      kind: 'zip',
      filename: expect.stringMatching(/^polar-wellness-export-/),
      completedAt: expect.any(String)
    });
  });

  it('blocks single export when Garmin-ready validation has a critical error', async () => {
    const inputFile: InputFile = {
      filename: 'training-session-broken.json',
      jsonText: '{"ok": true}',
      size: 12,
      mimeType: 'application/json'
    };
    const pyodide = {
      status: signal('idle'),
      error: signal(null),
      convertToTcx: vi.fn()
    };
    const store = new ConverterStore({} as never, pyodide as never, {} as never);
    const classification: PolarFileClassificationResult = {
      path: inputFile.filename,
      filename: inputFile.filename,
      sizeBytes: inputFile.size,
      category: 'training_session',
      confidence: 'high',
      detectedKeys: ['sport'],
      kind: 'training_session',
      status: 'ready',
      isConvertible: true,
      reason: 'ready',
      warnings: [],
      activity: activityFixture({ sourceFilename: inputFile.filename }),
      garminReady: garminReadyFixture({
        path: inputFile.filename,
        filename: inputFile.filename,
        status: 'error',
        message: 'Brak trackpointów.',
        possibleFormats: [],
        errors: ['Brak trackpointów.'],
        trackpointCount: 0
      })
    };
    store.files.set([inputFile]);
    store.classifications.set([classification]);

    await store.exportOneTcx(classification);

    expect(pyodide.convertToTcx).not.toHaveBeenCalled();
    expect(store.readyToConvert()).toHaveLength(0);
    expect(store.errors()[0]).toContain('Eksport zablokowany');
    expect(store.lastSuccessfulExport()).toBeNull();
  });

  it('does not show a successful export notice when conversion returns an error', async () => {
    const inputFile: InputFile = {
      filename: 'training-session-error.json',
      jsonText: '{"ok": true}',
      size: 12,
      mimeType: 'application/json'
    };
    const conversionResult: ConversionResult = {
      status: 'error',
      format: 'tcx',
      filename: 'activity.tcx',
      mimeType: 'application/vnd.garmin.tcx+xml',
      content: '',
      warnings: [],
      errors: ['Nie udało się wygenerować TCX.']
    };
    const downloads = {
      downloadResult: vi.fn()
    };
    const pyodide = {
      status: signal('idle'),
      error: signal(null),
      convertToTcx: vi.fn(async () => conversionResult)
    };
    const store = new ConverterStore({} as never, pyodide as never, downloads as never);
    const classification = classificationFixture(inputFile);
    store.files.set([inputFile]);
    store.classifications.set([classification]);

    await store.exportOneTcx(classification);

    expect(downloads.downloadResult).not.toHaveBeenCalled();
    expect(store.errors()).toEqual(['Nie udało się wygenerować TCX.']);
    expect(store.lastSuccessfulExport()).toBeNull();
  });

  it('allows export when Garmin-ready validation has warnings only', async () => {
    const activity = activityFixture({ hasGps: false });
    const inputFile: InputFile = {
      filename: 'training-session-warning.json',
      jsonText: '{"ok": true}',
      size: 12,
      mimeType: 'application/json'
    };
    const conversionResult: ConversionResult = {
      status: 'success',
      format: 'tcx',
      filename: 'activity.tcx',
      mimeType: 'application/vnd.garmin.tcx+xml',
      content: '<TrainingCenterDatabase />',
      warnings: [],
      errors: [],
      activity
    };
    const downloads = {
      downloadResult: vi.fn()
    };
    const pyodide = {
      status: signal('idle'),
      error: signal(null),
      convertToTcx: vi.fn(async () => conversionResult)
    };
    const store = new ConverterStore({} as never, pyodide as never, downloads as never);
    const classification: PolarFileClassificationResult = {
      path: inputFile.filename,
      filename: inputFile.filename,
      sizeBytes: inputFile.size,
      category: 'training_session',
      confidence: 'high',
      detectedKeys: ['sport'],
      kind: 'training_session',
      status: 'ready',
      isConvertible: true,
      reason: 'ready',
      warnings: [],
      activity,
      garminReady: garminReadyFixture({
        path: inputFile.filename,
        filename: inputFile.filename,
        status: 'warning',
        message: 'Import możliwy, ale brakuje GPS.',
        hasGps: false,
        warnings: ['Import możliwy, ale brakuje GPS.']
      })
    };
    store.files.set([inputFile]);
    store.classifications.set([classification]);

    await store.exportOneTcx(classification);

    expect(pyodide.convertToTcx).toHaveBeenCalledWith(inputFile);
    expect(downloads.downloadResult).toHaveBeenCalledWith(conversionResult);
    expect(store.lastSuccessfulExport()).toMatchObject({
      kind: 'tcx',
      filename: 'activity.tcx',
      completedAt: expect.any(String)
    });
  });

  it('exports ready TCX activities as a structured migration package', async () => {
    const activity = activityFixture();
    const inputFile: InputFile = {
      filename: 'training-session-123.json',
      jsonText: '{"ok": true}',
      size: 12,
      mimeType: 'application/json'
    };
    const conversionResult: ConversionResult = {
      status: 'success',
      format: 'tcx',
      filename: 'legacy-name.tcx',
      mimeType: 'application/vnd.garmin.tcx+xml',
      content: '<TrainingCenterDatabase />',
      warnings: [],
      errors: [],
      activity
    };
    const downloads = {
      downloadBlob: vi.fn()
    };
    const pyodide = {
      status: signal('idle'),
      error: signal(null),
      convertManyToTcx: vi.fn(async () => [conversionResult]),
      convertToTcx: vi.fn()
    };
    const store = new ConverterStore({} as never, pyodide as never, downloads as never);
    store.files.set([inputFile]);
    store.classifications.set([
      {
        path: inputFile.filename,
        filename: inputFile.filename,
        sizeBytes: inputFile.size,
        category: 'training_session',
        confidence: 'high',
        detectedKeys: ['sport'],
        kind: 'training_session',
        status: 'ready',
        isConvertible: true,
        reason: 'ready',
        warnings: [],
        activity,
        garminReady: garminReadyFixture()
      }
    ]);

    await store.exportAllReadyTcx();

    expect(pyodide.convertManyToTcx).toHaveBeenCalledWith([inputFile]);
    expect(downloads.downloadBlob).toHaveBeenCalledWith(expect.stringMatching(/^polar-to-garmin-export-/), expect.any(Blob));
    expect(store.migrationExportProgress()).toMatchObject({
      phase: 'done',
      totalActivities: 1,
      processedActivities: 1,
      successes: 1
    });
    expect(store.lastSuccessfulExport()).toMatchObject({
      kind: 'zip',
      filename: expect.stringMatching(/^polar-to-garmin-export-/),
      completedAt: expect.any(String)
    });
    const blob = downloads.downloadBlob.mock.calls[0][1] as Blob;
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file('activities/tcx/2024-05-02_06-30_running_polar-123.tcx')).toBeTruthy();
    expect(zip.file('reports/file-classification-report.csv')).toBeTruthy();
    expect(zip.file('reports/garmin-ready-report.csv')).toBeTruthy();
    expect(zip.file('reports/garmin-ready-report.json')).toBeTruthy();
  });

  it('exports ready TCX and FIT activities in the full migration package', async () => {
    const activity = activityFixture();
    const inputFile: InputFile = {
      filename: 'training-session-123.json',
      jsonText: '{"ok": true}',
      size: 12,
      mimeType: 'application/json'
    };
    const tcxResult = conversionResultFixture('tcx', activity);
    const fitResult = conversionResultFixture('fit', activity);
    const downloads = {
      downloadBlob: vi.fn()
    };
    let store!: ConverterStore;
    const pyodide = {
      status: signal('idle'),
      error: signal(null),
      convertManyToTcx: vi.fn(async () => [tcxResult]),
      convertToTcx: vi.fn(),
      convertManyToFit: vi.fn(async () => {
        expect(store.allWarnings()).toEqual([]);
        return [fitResult];
      }),
      convertToFit: vi.fn()
    };
    store = new ConverterStore({} as never, pyodide as never, downloads as never);
    store.files.set([inputFile]);
    store.classifications.set([classificationFixture(inputFile)]);

    await store.exportFullMigrationPackage();

    expect(pyodide.convertManyToTcx).toHaveBeenCalledWith([inputFile]);
    expect(pyodide.convertManyToFit).toHaveBeenCalledWith([inputFile]);
    expect(downloads.downloadBlob).toHaveBeenCalledWith(expect.stringMatching(/^polar-to-garmin-export-/), expect.any(Blob));
    expect(store.migrationExportProgress()).toMatchObject({
      phase: 'done',
      totalActivities: 2,
      processedActivities: 2,
      successes: 2
    });

    const zip = await downloadedZip(downloads);
    expect(zip.file('activities/tcx/2024-05-02_06-30_running_polar-123.tcx')).toBeTruthy();
    expect(zip.file('activities/fit/2024-05-02_06-30_running_polar-123.fit')).toBeTruthy();
    expect(zip.file('activities/fit/NOT_AVAILABLE.txt')).toBeNull();
    expect(await zip.file('reports/import-summary.csv')?.async('string')).toContain('generatedFit,1');
  });

  it('keeps successful FIT files when batch FIT export falls back to single-file conversion', async () => {
    const firstFile: InputFile = {
      filename: 'training-session-123.json',
      jsonText: '{"ok": true}',
      size: 12,
      mimeType: 'application/json'
    };
    const secondFile: InputFile = {
      filename: 'training-session-456.json',
      jsonText: '{"ok": true}',
      size: 12,
      mimeType: 'application/json'
    };
    const firstActivity = activityFixture({ sourceFilename: firstFile.filename, activityId: '123' });
    const secondActivity = activityFixture({ sourceFilename: secondFile.filename, activityId: '456' });
    const downloads = {
      downloadBlob: vi.fn()
    };
    const pyodide = {
      status: signal('idle'),
      error: signal(null),
      convertManyToTcx: vi.fn(async () => [
        conversionResultFixture('tcx', firstActivity),
        conversionResultFixture('tcx', secondActivity)
      ]),
      convertToTcx: vi.fn(),
      convertManyToFit: vi.fn(async () => {
        throw new Error('batch FIT failed');
      }),
      convertToFit: vi.fn(async (file: InputFile) =>
        conversionResultFixture('fit', file.filename === firstFile.filename ? firstActivity : secondActivity)
      )
    };
    const store = new ConverterStore({} as never, pyodide as never, downloads as never);
    store.files.set([firstFile, secondFile]);
    store.classifications.set([
      classificationFixture(firstFile),
      {
        ...classificationFixture(secondFile),
        activity: secondActivity,
        garminReady: garminReadyFixture({ path: secondFile.filename, filename: secondFile.filename, activityId: '456' })
      }
    ]);

    await store.exportAllReadyGarminBundle();

    expect(pyodide.convertManyToFit).toHaveBeenCalledWith([firstFile, secondFile]);
    expect(pyodide.convertToFit).toHaveBeenCalledTimes(2);
    expect(pyodide.convertToFit).toHaveBeenCalledWith(firstFile);
    expect(pyodide.convertToFit).toHaveBeenCalledWith(secondFile);
    const zip = await downloadedZip(downloads);
    expect(zip.file('activities/fit/2024-05-02_06-30_running_polar-123.fit')).toBeTruthy();
    expect(zip.file('activities/fit/2024-05-02_06-30_running_polar-456.fit')).toBeTruthy();
    expect(zip.file('activities/fit/NOT_AVAILABLE.txt')).toBeNull();
    expect(await zip.file('reports/import-summary.csv')?.async('string')).toContain('generatedFit,2');
  });

  it('adds FIT NOT_AVAILABLE only when every FIT export fails and reports the errors', async () => {
    const activity = activityFixture();
    const inputFile: InputFile = {
      filename: 'training-session-123.json',
      jsonText: '{"ok": true}',
      size: 12,
      mimeType: 'application/json'
    };
    const fitErrorResult: ConversionResult = {
      ...conversionResultFixture('fit', activity),
      status: 'error',
      content: new Uint8Array(),
      errors: ['FIT validation failed']
    };
    const downloads = {
      downloadBlob: vi.fn()
    };
    const pyodide = {
      status: signal('idle'),
      error: signal(null),
      convertManyToFit: vi.fn(async () => [fitErrorResult]),
      convertToFit: vi.fn()
    };
    const store = new ConverterStore({} as never, pyodide as never, downloads as never);
    store.files.set([inputFile]);
    store.classifications.set([classificationFixture(inputFile)]);

    await store.exportAllReadyFit();

    const zip = await downloadedZip(downloads);
    expect(zip.file('activities/fit/NOT_AVAILABLE.txt')).toBeTruthy();
    expect(zip.file('activities/fit/2024-05-02_06-30_running_polar-123.fit')).toBeNull();
    const skippedFiles = await zip.file('reports/skipped-files.csv')?.async('string');
    expect(skippedFiles).toContain('training-session-123.json');
    expect(skippedFiles).toContain('fit');
    expect(skippedFiles).toContain('FIT validation failed');
    expect(await zip.file('reports/import-summary.csv')?.async('string')).toContain('generatedFit,0');
  });

  it('copies the selected diagnostic report to the clipboard', async () => {
    const filename = 'training-session-diagnostic.json';
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const store = new ConverterStore(
      {} as never,
      { status: signal('idle'), error: signal(null) } as never,
      { downloadText: vi.fn(), downloadBlob: vi.fn() } as never
    );
    store.classifications.set([
      {
        path: filename,
        filename,
        sizeBytes: 24,
        category: 'training_session',
        confidence: 'high',
        detectedKeys: ['sport'],
        kind: 'training_session',
        status: 'ready',
        isConvertible: true,
        reason: 'ready',
        warnings: [],
        activity: activityFixture({ sourceFilename: filename }),
        garminReady: garminReadyFixture({ path: filename, filename })
      }
    ]);

    await store.copyDiagnosticReport();

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('File name: training-session-diagnostic.json'));
    expect(store.diagnosticClipboardMessage()).toBe('Skopiowano raport diagnostyczny.');
  });

  it('exports a diagnostic package without raw Polar JSON', async () => {
    const filename = 'training-session-diagnostic.json';
    const downloads = {
      downloadText: vi.fn(),
      downloadBlob: vi.fn()
    };
    const store = new ConverterStore(
      {} as never,
      { status: signal('idle'), error: signal(null) } as never,
      downloads as never
    );
    store.files.set([
      {
        filename,
        jsonText: '{"private":"raw polar json"}',
        size: 28,
        mimeType: 'application/json'
      }
    ]);
    store.classifications.set([
      {
        path: filename,
        filename,
        sizeBytes: 28,
        category: 'training_session',
        confidence: 'high',
        detectedKeys: ['sport'],
        kind: 'training_session',
        status: 'ready',
        isConvertible: true,
        reason: 'ready',
        warnings: [],
        activity: activityFixture({ sourceFilename: filename }),
        garminReady: garminReadyFixture({
          path: filename,
          filename,
          status: 'error',
          possibleFormats: [],
          errors: ['Brak trackpointów.']
        })
      }
    ]);

    await store.exportDiagnosticPackage();

    expect(downloads.downloadBlob).toHaveBeenCalledWith('training-session-diagnostic-garmin-diagnostics.zip', expect.any(Blob));
    const blob = downloads.downloadBlob.mock.calls[0][1] as Blob;
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file('diagnostic-report.txt')).toBeTruthy();
    expect(zip.file('diagnostic-report.json')).toBeTruthy();
    expect(zip.file('validation.json')).toBeTruthy();
    const validation = await zip.file('validation.json')?.async('string');
    expect(validation).toContain('Brak trackpointów.');
    expect(validation).not.toContain('raw polar json');
  });
});

function importedJsonFixture(file: InputFile): ImportedPolarFile {
  return {
    path: file.filename,
    filename: file.filename,
    extension: '.json',
    sizeBytes: file.size,
    kind: 'json',
    textContent: file.jsonText
  };
}

function classificationFixture(file: InputFile): PolarFileClassificationResult {
  return {
    path: file.filename,
    filename: file.filename,
    sizeBytes: file.size,
    category: 'training_session',
    confidence: 'high',
    detectedKeys: ['sport'],
    kind: 'training_session',
    status: 'ready',
    isConvertible: true,
    reason: 'ready',
    warnings: [],
    activity: activityFixture({ sourceFilename: file.filename }),
    garminReady: garminReadyFixture({ path: file.filename, filename: file.filename })
  };
}

function conversionResultFixture(format: 'tcx' | 'fit', activity: ActivitySummary): ConversionResult {
  return {
    status: 'success',
    format,
    filename: `activity.${format}`,
    mimeType: format === 'tcx' ? 'application/vnd.garmin.tcx+xml' : 'application/vnd.ant.fit',
    content: format === 'tcx' ? '<TrainingCenterDatabase />' : new Uint8Array([1, 2, 3]),
    warnings: [],
    errors: [],
    activity
  };
}

async function downloadedZip(downloads: { downloadBlob: ReturnType<typeof vi.fn> }): Promise<JSZip> {
  const blob = downloads.downloadBlob.mock.calls[0][1] as Blob;
  return JSZip.loadAsync(blob);
}

function activityFixture(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    sourceFilename: 'training-session-123.json',
    sourceFileKind: 'training_session',
    activityId: '123',
    sport: 'Running',
    sportDetail: null,
    startTime: '2024-05-02T06:30:00Z',
    durationSeconds: 600,
    distanceMeters: 1200,
    calories: null,
    trackpointCount: 2,
    hasGps: true,
    hasHeartRate: true,
    hasCadence: false,
    hasPower: false,
    ...overrides
  };
}

function garminReadyFixture(overrides: Partial<GarminReadyReportItem> = {}): GarminReadyReportItem {
  return {
    path: 'training-session-123.json',
    filename: 'training-session-123.json',
    sourceFileKind: 'training_session',
    activityId: '123',
    sport: 'Running',
    sportDetail: null,
    startTime: '2024-05-02T06:30:00Z',
    status: 'ready',
    message: 'Gotowe do importu Garmin Connect',
    possibleFormats: ['tcx', 'fit'],
    hasGps: true,
    hasHeartRate: true,
    trackpointCount: 2,
    warnings: [],
    errors: [],
    formatValidations: [
      {
        format: 'tcx',
        status: 'ready',
        validationLevel: 'pre_export',
        recordCount: 2,
        warnings: [],
        errors: []
      },
      {
        format: 'fit',
        status: 'ready',
        validationLevel: 'pre_export',
        recordCount: 2,
        warnings: [],
        errors: []
      }
    ],
    ...overrides
  };
}

function normalizedActivityResultFixture(filename: string): NormalizedActivityResult {
  return {
    status: 'success',
    filename,
    mimeType: 'application/json',
    content: '',
    warnings: [],
    errors: [],
    activity: normalizedActivityFixture(filename),
    garminReady: garminReadyFixture({ path: filename, filename })
  };
}

function normalizedActivityFixture(filename: string): NormalizedActivity {
  return {
    source: 'Polar Flow',
    sourceFilename: filename,
    sourceFileKind: 'training_session',
    activityId: '123',
    sport: 'Running',
    sportDetail: null,
    startTime: '2024-05-02T06:30:00Z',
    durationSeconds: 600,
    distanceMeters: 1200,
    calories: null,
    trackpointCount: 2,
    hasGps: true,
    hasHeartRate: true,
    hasCadence: false,
    hasPower: false,
    averageHeartRate: 140,
    maxHeartRate: 155,
    trackpoints: [
      {
        time: '2024-05-02T06:30:00Z',
        latitude: 52.2297,
        longitude: 21.0122,
        altitudeMeters: 100,
        distanceMeters: 0,
        heartRate: 130,
        cadence: null,
        speedMps: null,
        powerWatts: null,
        temperatureCelsius: null
      },
      {
        time: '2024-05-02T06:40:00Z',
        latitude: 52.236,
        longitude: 21.028,
        altitudeMeters: 108,
        distanceMeters: 1200,
        heartRate: 155,
        cadence: null,
        speedMps: null,
        powerWatts: null,
        temperatureCelsius: null
      }
    ],
    laps: [],
    metadata: {}
  };
}

function wellnessReportFixture(): WellnessReport {
  return {
    dailyActivity: [
      {
        date: '2024-05-04',
        steps: 12000,
        calories: 2200,
        activeTimeMinutes: 85,
        distanceMeters: null,
        sourceFiles: ['activity.json'],
        warnings: []
      }
    ],
    sleepSummaries: [],
    sleepStages: [],
    nightlyRecharge: [],
    dailyHeartRate: [],
    undatedRecords: [],
    skippedRecords: [],
    warnings: [],
    summary: {
      dailyActivityDays: 1,
      sleepNights: 0,
      sleepStageRecords: 0,
      nightlyRechargeDays: 0,
      dailyHeartRateDays: 0,
      dateStart: '2024-05-04',
      dateEnd: '2024-05-04',
      averageSleepScore: null,
      averageSleepDurationMinutes: null,
      warningCount: 0
    }
  };
}
