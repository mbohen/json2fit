import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppDataService } from '@app/core/app-data.service';
import { I18nService } from '@app/core/i18n/i18n.service';
import { PwaService } from '@app/core/pwa.service';
import { supportConfig } from '@shared/product';
import {
  ActivitySummary,
  GarminReadyReportItem,
  NormalizedActivity,
  NormalizedActivityResult,
  PolarFileClassificationResult,
  WellnessReport
} from '@shared/models';
import { ConverterComponent } from './converter.component';
import { ConverterStore } from './converter.store';

describe('ConverterComponent', () => {
  let fixture: ComponentFixture<ConverterComponent>;
  let store: ConverterStore;
  let pwa: PwaService;
  let appData: AppDataService;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('json2fit.language', 'pl');

    await TestBed.configureTestingModule({
      imports: [ConverterComponent],
      providers: [provideRouter([])]
    }).compileComponents();

    fixture = TestBed.createComponent(ConverterComponent);
    store = TestBed.inject(ConverterStore);
    pwa = TestBed.inject(PwaService);
    appData = TestBed.inject(AppDataService);
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('renders the converter heading', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Wgraj plik ZIP z eksportu Polar Flow');
    expect(fixture.nativeElement.textContent).toContain('Wybierz ZIP');
    expect(fixture.nativeElement.textContent).toContain('Dane pozostają na Twoim urządzeniu');
    expect(fixture.nativeElement.querySelector('[data-testid="beta-banner"]')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Darmowa beta');
    expect(fixture.nativeElement.textContent).not.toContain('json2fit jest teraz dostępny bez opłat');
  });

  it('renders contextual help links and technical term tooltips', () => {
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    const links = Array.from(fixture.nativeElement.querySelectorAll('a')) as HTMLAnchorElement[];
    const hrefs = links.map((link) => link.getAttribute('href'));

    expect(text).toContain('Dowiedz się więcej');
    expect(hrefs).toContain('/help#download-polar-export');
    expect(hrefs).toContain('/help#import-files');
    expect(hrefs).toContain('/help#tcx-vs-fit');
    expect(hrefs).toContain('/help#troubleshooting');
    expect(hrefs).toContain('/help#sleep-and-wellness');
    expect(hrefs).toContain('/help#privacy');

    const fitTooltip = fixture.nativeElement.querySelector('abbr[aria-label^="FIT:"]') as HTMLElement;
    expect(fitTooltip).toBeTruthy();
    expect(fitTooltip.getAttribute('title')).toContain('Binarny format aktywności Garmina');
  });

  it('renders privacy/offline controls with the required privacy message', () => {
    pwa.serviceWorkerReady.set(true);
    pwa.offlineCacheReady.set(true);
    pwa.installPromptAvailable.set(true);

    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-testid="privacy-offline-panel"]') as HTMLElement;
    expect(panel.textContent).toContain(
      'Konwersja odbywa się bezpośrednio w Twojej przeglądarce. Aplikacja nie wysyła eksportu Polar Flow ani wygenerowanych plików na serwer.'
    );
    expect(panel.textContent).toContain('Jak działa prywatność?');
    expect(panel.textContent).toContain('Tryb offline');
    expect(panel.textContent).toContain('Usuń także pliki trybu offline');
    expect(panel.textContent).toContain('Wyczyść dane aplikacji');
    expect(panel.textContent).toContain('Zainstaluj aplikację');
  });

  it('clears browser app data and in-memory converter state from the privacy panel', async () => {
    store.files.set([
      {
        filename: 'training-session.json',
        jsonText: '{}',
        size: 2,
        mimeType: 'application/json'
      }
    ]);
    store.classifications.set([
      {
        path: 'training-session.json',
        filename: 'training-session.json',
        sizeBytes: 2,
        category: 'training_session',
        confidence: 'high',
        detectedKeys: ['sport'],
        kind: 'training_session',
        status: 'ready',
        isConvertible: true,
        reason: 'ready',
        warnings: []
      }
    ]);
    store.activityPreviewCache.set({ 'training-session.json': normalizedActivityResultFixture('training-session.json') });
    store.errors.set(['old error']);
    const clearSpy = vi.spyOn(appData, 'clearAppData').mockResolvedValue({
      localStorageCleared: true,
      sessionStorageCleared: true,
      indexedDbDeleted: [],
      cachesDeleted: ['json2fit-static-v1'],
      errors: []
    });

    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-testid="privacy-offline-panel"]') as HTMLElement;
    const checkbox = panel.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    const clearButton = Array.from(panel.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Wyczyść dane aplikacji')
    ) as HTMLButtonElement;
    clearButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(clearSpy).toHaveBeenCalledWith({ includeOfflineCache: true });
    expect(store.files()).toEqual([]);
    expect(store.classifications()).toEqual([]);
    expect(store.activityPreviewCache()).toEqual({});
    expect(store.errors()).toEqual([]);
    expect(store.message()).toBe('Dane aplikacji zostały wyczyszczone.');
    expect(pwa.offlineCacheReady()).toBe(false);
    expect(panel.textContent).toContain('Wyczyszczono dane aplikacji oraz pliki trybu offline');
  });

  it('renders bulk export options and triggers selected ZIP export', () => {
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
        warnings: []
      }
    ]);
    const exportSpy = vi.spyOn(store, 'exportSelectedMigrationPackage').mockResolvedValue();

    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-testid="bulk-export-panel"]') as HTMLElement;
    expect(panel.textContent).toContain('Eksport zbiorczy');
    expect(panel.textContent).toContain('Raporty wellness');

    const checkboxes = panel.querySelectorAll('input[type="checkbox"]');
    (checkboxes[0] as HTMLInputElement).checked = false;
    checkboxes[0].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(store.migrationExportOptions().includeTcx).toBe(false);

    const selectedZipButton = Array.from(panel.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Pobierz wybrany ZIP')
    ) as HTMLButtonElement;
    expect(selectedZipButton.disabled).toBe(false);
    selectedZipButton.click();

    expect(exportSpy).toHaveBeenCalled();
  });

  it('disables selected ZIP export before classification', () => {
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-testid="bulk-export-panel"]') as HTMLElement;
    const selectedZipButton = Array.from(panel.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Pobierz wybrany ZIP')
    ) as HTMLButtonElement;

    expect(selectedZipButton.disabled).toBe(true);
  });

  it('shows the support CTA only after a successful export notice', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="post-export-support"]')).toBeNull();

    store.lastSuccessfulExport.set({
      kind: 'zip',
      filename: 'polar-to-garmin-export.zip',
      completedAt: '2024-01-01T00:00:00.000Z'
    });
    fixture.detectChanges();

    const supportPanel = fixture.nativeElement.querySelector('[data-testid="post-export-support"]') as HTMLElement;
    const supportLink = supportPanel.querySelector('[data-testid="support-button"]') as HTMLAnchorElement;
    const bulkExportPanel = fixture.nativeElement.querySelector('[data-testid="bulk-export-panel"]') as HTMLElement;

    expect(supportPanel.textContent).toContain('Eksport gotowy');
    expect(supportPanel.textContent).toContain('polar-to-garmin-export.zip');
    expect(supportPanel.textContent).toContain('Wsparcie nie odblokowuje dodatkowych funkcji');
    expect(supportLink.getAttribute('href')).toBe(supportConfig.buyMeACoffeeUrl);
    expect(supportLink.getAttribute('target')).toBe('_blank');
    expect(bulkExportPanel.textContent).toContain('Eksport zbiorczy');
    expect(bulkExportPanel.textContent).toContain('Pobierz wybrany ZIP');
  });

  it('collapses bulk export checkbox options into a mobile options menu', () => {
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-testid="bulk-export-panel"]') as HTMLElement;
    const mobileMenu = panel.querySelector('[data-testid="bulk-export-options-menu"]') as HTMLDetailsElement;
    const desktopOptions = panel.querySelector('[data-testid="bulk-export-options-desktop"]') as HTMLElement;

    expect(mobileMenu).toBeTruthy();
    expect(mobileMenu.textContent).toContain('Opcje pakietu');
    expect(mobileMenu.textContent).toContain('TCX');
    expect(mobileMenu.textContent).toContain('Raporty wellness');
    expect(mobileMenu.open).toBe(false);
    expect(desktopOptions.className).toContain('hidden');
    expect(desktopOptions.className).toContain('md:grid');
  });

  it('renders activity preview stats, local route and charts', () => {
    const filename = 'training-session-preview.json';
    const activity = activityFixture({
      sourceFilename: filename,
      durationSeconds: 1200,
      distanceMeters: 4000,
      calories: 245,
      trackpointCount: 3,
      hasGps: true,
      hasHeartRate: true,
      hasCadence: true
    });
    store.files.set([
      {
        filename,
        jsonText: '{"sport":"ROAD_RUNNING"}',
        size: 24,
        mimeType: 'application/json'
      }
    ]);
    store.classifications.set([
      {
        path: filename,
        filename,
        sizeBytes: 24,
        category: 'training_session',
        confidence: 'high',
        detectedKeys: ['sport', 'samples'],
        kind: 'training_session',
        status: 'ready',
        isConvertible: true,
        reason: 'ready',
        warnings: [],
        activity,
        garminReady: garminReadyFixture({ path: filename, filename })
      }
    ]);
    store.activityPreviewCache.set({
      [filename]: normalizedActivityResultFixture(filename)
    });

    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-testid="activity-preview-panel"]') as HTMLElement;
    expect(panel.textContent).toContain('Podgląd aktywności');
    expect(panel.textContent).toContain('00:20:00');
    expect(panel.textContent).toContain('4,00 km');
    expect(panel.textContent).toContain('5:00 min/km');
    expect(panel.textContent).toContain('245 kcal');
    expect(panel.textContent).toContain('Śr. HR');
    expect(panel.textContent).toContain('Maks. HR');
    expect(panel.textContent).toContain('140 bpm');
    expect(panel.textContent).toContain('155 bpm');
    expect(panel.textContent).toContain('Kadencja');
    expect(panel.textContent).toContain('Moc');
    expect(panel.textContent).not.toContain('HR avg');
    expect(panel.textContent).not.toContain('HR max');
    expect(panel.textContent).not.toContain('Cadence');
    expect(panel.textContent).not.toContain('Power');
    expect(panel.textContent).toContain('Ślad GPS lokalny');
    expect(panel.textContent).toContain('Tętno');
    expect(panel.querySelector('[data-testid="activity-route-polyline"]')).toBeTruthy();
  });

  it('keeps long activity previews in independently scrollable desktop columns and a mobile accordion', async () => {
    const classifications: PolarFileClassificationResult[] = Array.from({ length: 32 }, (_, index) => {
      const filename = `training-session-preview-${index + 1}.json`;
      return {
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
        activity: activityFixture({
          sourceFilename: filename,
          sportDetail: index % 2 === 0 ? 'Morning Run' : 'Evening Ride',
          startTime: `2024-05-${String((index % 28) + 1).padStart(2, '0')}T06:30:00Z`
        }),
        garminReady: garminReadyFixture({ path: filename, filename })
      };
    });
    store.classifications.set(classifications);

    fixture.detectChanges();

    const desktopList = fixture.nativeElement.querySelector('[data-testid="activity-preview-list"]') as HTMLElement;
    const desktopLayout = desktopList.parentElement as HTMLElement;
    const detailScroll = desktopLayout.querySelector('[data-testid="activity-preview-detail-scroll"]') as HTMLElement;
    const detail = detailScroll.querySelector('[data-testid="activity-preview-detail"]') as HTMLElement;
    const mobileList = fixture.nativeElement.querySelector('[data-testid="activity-preview-mobile-list"]') as HTMLElement;

    expect(desktopLayout.className).toContain('h-[calc(100dvh-12rem)]');
    expect(desktopLayout.className).toContain('max-h-[44rem]');
    expect(desktopLayout.className).toContain('overflow-hidden');
    expect(desktopLayout.className).toContain('lg:grid-cols-[240px_minmax(0,1fr)]');
    expect(desktopLayout.className).toContain('xl:grid-cols-[260px_minmax(0,1fr)]');
    expect(desktopList.className).toContain('overflow-y-auto');
    expect(desktopList.className).toContain('overscroll-contain');
    expect(detailScroll.className).toContain('overflow-y-auto');
    expect(detailScroll.className).toContain('overscroll-contain');
    expect(detail.textContent).toContain('Bieganie');
    expect(mobileList.className).toContain('max-h-[70dvh]');
    expect(mobileList.className).toContain('overflow-y-auto');
    expect(mobileList.className).toContain('overscroll-contain');

    const mobileActivityButtons = Array.from(mobileList.querySelectorAll('article > button')) as HTMLButtonElement[];
    mobileActivityButtons[1].click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mobileList.querySelector('[data-testid="activity-preview-mobile-detail"]')).toBeTruthy();
    expect(mobileActivityButtons[1].getAttribute('aria-expanded')).toBe('true');

    mobileActivityButtons[1].click();
    fixture.detectChanges();

    expect(mobileList.querySelector('[data-testid="activity-preview-mobile-detail"]')).toBeNull();
    expect(mobileActivityButtons[1].getAttribute('aria-expanded')).toBe('false');
  });

  it('localizes activity preview warnings when the interface is in English', async () => {
    const i18n = TestBed.inject(I18nService);
    await i18n.setLanguage('en');
    const filename = 'training-session-preview-warning.json';
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
    store.activityPreviewCache.set({
      [filename]: {
        ...normalizedActivityResultFixture(filename),
        warnings: ['Import możliwy, ale brakuje GPS.']
      }
    });

    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-testid="activity-preview-panel"]') as HTMLElement;
    expect(panel.textContent).toContain('Preview warnings: Import is possible, but GPS is missing.');
    expect(panel.textContent).not.toContain('Preview warnings: Import możliwy');
  });

  it('uses compact icon export buttons in the desktop activity preview detail', () => {
    const filename = 'training-session-preview.json';
    store.files.set([
      {
        filename,
        jsonText: '{"sport":"ROAD_RUNNING"}',
        size: 24,
        mimeType: 'application/json'
      }
    ]);
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

    fixture.detectChanges();

    const desktopDetail = fixture.nativeElement.querySelector('[data-testid="activity-preview-detail"]') as HTMLElement;
    const tcxButton = desktopDetail.querySelector(`button[aria-label="Eksportuj TCX: ${filename}"]`) as HTMLButtonElement;
    const fitButton = desktopDetail.querySelector(`button[aria-label="Eksportuj FIT: ${filename}"]`) as HTMLButtonElement;

    expect(tcxButton.className).toContain('md:size-10');
    expect(tcxButton.querySelector('span')?.className).toContain('md:sr-only');
    expect(tcxButton.title).toBe('Eksportuj TCX');
    expect(fitButton.className).toContain('md:size-10');
    expect(fitButton.title).toBe('Eksportuj FIT');
  });

  it('keeps activity filenames out of the main preview cards and shows them only in details', () => {
    const filename = 'training-session-preview-with-long-path-name.json';
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
        activity: activityFixture({ sourceFilename: filename, sportDetail: 'Morning Run' }),
        garminReady: garminReadyFixture({ path: filename, filename })
      }
    ]);

    fixture.detectChanges();

    const desktopList = fixture.nativeElement.querySelector('[data-testid="activity-preview-list"]') as HTMLElement;
    const mobileList = fixture.nativeElement.querySelector('[data-testid="activity-preview-mobile-list"]') as HTMLElement;
    const detail = fixture.nativeElement.querySelector('[data-testid="activity-preview-detail"]') as HTMLElement;
    const displayedFilename = fixture.componentInstance.displayFilePath(filename);

    expect(desktopList.textContent).toContain('Bieganie');
    expect(desktopList.textContent).not.toContain('Morning Run');
    expect(desktopList.textContent).not.toContain(filename);
    expect(desktopList.textContent).not.toContain(displayedFilename);
    expect(mobileList.textContent).toContain('Bieganie');
    expect(mobileList.textContent).not.toContain('Morning Run');
    expect(mobileList.textContent).not.toContain(filename);
    expect(mobileList.textContent).not.toContain(displayedFilename);
    expect(detail.textContent).toContain(displayedFilename);
  });

  it('expands and collapses activity preview details inside mobile activity cards', async () => {
    const first = 'training-session-first.json';
    const second = 'training-session-second.json';
    store.classifications.set([
      {
        path: first,
        filename: first,
        sizeBytes: 24,
        category: 'training_session',
        confidence: 'high',
        detectedKeys: ['sport'],
        kind: 'training_session',
        status: 'ready',
        isConvertible: true,
        reason: 'ready',
        warnings: [],
        activity: activityFixture({ sourceFilename: first, sportDetail: 'Morning Run' }),
        garminReady: garminReadyFixture({ path: first, filename: first })
      },
      {
        path: second,
        filename: second,
        sizeBytes: 24,
        category: 'training_session',
        confidence: 'high',
        detectedKeys: ['sport'],
        kind: 'training_session',
        status: 'ready',
        isConvertible: true,
        reason: 'ready',
        warnings: [],
        activity: activityFixture({ sourceFilename: second, sport: 'Biking', sportDetail: 'Evening Ride' }),
        garminReady: garminReadyFixture({ path: second, filename: second })
      }
    ]);

    fixture.detectChanges();

    const mobileList = fixture.nativeElement.querySelector('[data-testid="activity-preview-mobile-list"]') as HTMLElement;
    expect(mobileList.querySelector('[data-testid="activity-preview-mobile-detail"]')).toBeNull();

    const buttons = Array.from(mobileList.querySelectorAll('button')) as HTMLButtonElement[];
    buttons[1].click();
    await fixture.whenStable();
    fixture.detectChanges();

    const expanded = mobileList.querySelector('[data-testid="activity-preview-mobile-detail"]') as HTMLElement;
    expect(expanded).toBeTruthy();
    expect(expanded.textContent).toContain('Jazda na rowerze');
    expect(expanded.textContent).not.toContain('Evening Ride');
    expect(expanded.textContent).toContain(second);
    expect(expanded.textContent).toContain('Załaduj mapę i wykresy');
    expect(store.selectedActivityCandidate()?.path).toBe(second);

    buttons[1].click();
    fixture.detectChanges();

    expect(mobileList.querySelector('[data-testid="activity-preview-mobile-detail"]')).toBeNull();
  });

  it('renders wellness summary and triggers wellness ZIP export', () => {
    store.wellnessReport.set(wellnessReportFixture());
    const exportSpy = vi.spyOn(store, 'exportWellnessReportsZip').mockResolvedValue();

    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-testid="wellness-panel"]') as HTMLElement;
    expect(panel.textContent).toContain('Dane wellness / sen');
    expect(panel.textContent).toContain('Garmin Connect nie zapewnia stabilnego publicznego importu historii snu');
    expect(panel.textContent).toContain('Dni aktywności');
    expect(panel.textContent).toContain('Noce snu');
    expect(panel.textContent).toContain('Rekordy Nightly Recharge');
    expect(panel.textContent).toContain('Dni z tętnem');
    expect(panel.textContent).toContain('Liczniki pokazują rekordy/dni z plików Polar, nie liczbę plików');
    expect(panel.textContent).toContain('2024-05-04 - 2024-05-05');
    expect(panel.textContent).toContain('Pliki źródłowe wellness');
    expect(panel.textContent).toContain('daily-activity.csv');
    expect(panel.textContent).toContain('wellness-report.html');

    const button = Array.from(panel.querySelectorAll('button')).find((item) =>
      item.textContent?.includes('Wellness ZIP')
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    button.click();

    expect(exportSpy).toHaveBeenCalled();
  });

  it('keeps the mobile wellness panel collapsed when there is no wellness data', () => {
    fixture.detectChanges();

    const details = fixture.nativeElement.querySelector('[data-testid="wellness-mobile-details"]') as HTMLDetailsElement;
    expect(details).toBeTruthy();
    expect(details.open).toBe(false);
    expect(details.textContent).toContain('Brak wykrytych danych wellness/snu.');
  });

  it('opens the mobile wellness panel when wellness data is available', () => {
    store.wellnessReport.set(wellnessReportFixture());

    fixture.detectChanges();

    const details = fixture.nativeElement.querySelector('[data-testid="wellness-mobile-details"]') as HTMLDetailsElement;
    expect(details.open).toBe(true);
    expect(details.textContent).toContain('Wykryto dane wellness/snu.');
    expect(details.textContent).toContain('Wellness ZIP');
  });

  it('renders Garmin diagnostics suggestions and triggers report copy', () => {
    const filename = 'training-session-diagnostic.json';
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
        garminReady: garminReadyFixture({
          path: filename,
          filename,
          status: 'error',
          possibleFormats: [],
          errors: ['Brak start_time.', 'Nieprawidłowa szerokość geograficzna w trackpoint 1: 120.']
        })
      }
    ]);
    const copySpy = vi.spyOn(store, 'copyDiagnosticReport').mockResolvedValue();

    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-testid="garmin-diagnostics-panel"]') as HTMLElement;
    expect(panel.textContent).toContain('Brak czasu startu');
    expect(panel.textContent).toContain('Współrzędne GPS poza zakresem');
    expect(panel.textContent).toContain('Kopiuj raport diagnostyczny');
    expect(panel.textContent).toContain('Paczka diagnostyczna');
    expect(panel.textContent).toContain('File name: training-session-diagnostic.json');

    const copyButton = Array.from(panel.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Kopiuj raport diagnostyczny')
    ) as HTMLButtonElement;
    copyButton.click();

    expect(copySpy).toHaveBeenCalled();
  });

  it('changes diagnostic GPS privacy mode from the UI', () => {
    const filename = 'training-session-diagnostic.json';
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

    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-testid="diagnostic-gps-options"]') as HTMLElement;
    const rounded = panel.querySelector('input[value="rounded"]') as HTMLInputElement;
    rounded.checked = true;
    rounded.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(store.diagnosticGpsMode()).toBe('rounded');
    expect(fixture.nativeElement.textContent).toContain('Tryb prywatności GPS: GPS zaokrąglone');
  });

  it('disables diagnostic GPS sample modes when the activity has no GPS', () => {
    const filename = 'training-session-no-gps.json';
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
        activity: activityFixture({ sourceFilename: filename, hasGps: false }),
        garminReady: garminReadyFixture({ path: filename, filename, hasGps: false })
      }
    ]);

    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-testid="diagnostic-gps-options"]') as HTMLElement;
    const none = panel.querySelector('input[value="none"]') as HTMLInputElement;
    const rounded = panel.querySelector('input[value="rounded"]') as HTMLInputElement;
    const full = panel.querySelector('input[value="full"]') as HTMLInputElement;
    expect(none.disabled).toBe(false);
    expect(none.checked).toBe(true);
    expect(rounded.disabled).toBe(true);
    expect(full.disabled).toBe(true);

    store.setDiagnosticGpsMode('full');
    fixture.detectChanges();

    expect(store.effectiveDiagnosticGpsMode()).toBe('none');
    expect(full.checked).toBe(false);
  });

  it('shows wellness analysis progress in the wellness panel', () => {
    store.importProgress.set({
      stage: 'analyzing_wellness',
      processedFiles: 4,
      totalFiles: 23,
      currentPath: 'sleep_result.json'
    });

    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-testid="wellness-panel"]') as HTMLElement;
    expect(panel.textContent).toContain('Analiza wellness/snu w toku');
    expect(panel.textContent).toContain('4 / 23');
    expect(panel.textContent).toContain('sleep_result.json');
  });

  it('renders classification groups and skips account data', () => {
    store.classifications.set([
      {
        path: 'training-session-1.json',
        filename: 'training-session-1.json',
        sizeBytes: 128,
        category: 'training_session',
        confidence: 'high',
        detectedKeys: ['sport', 'samples'],
        kind: 'training_session',
        status: 'ready',
        isConvertible: true,
        reason: 'ready',
        warnings: [],
        activity: {
          sourceFilename: 'training-session-1.json',
          sourceFileKind: 'training_session',
          activityId: '1',
          sport: 'Running',
          sportDetail: 'Running',
          startTime: '2024-05-01T10:00:00Z',
          durationSeconds: 600,
          distanceMeters: 1200,
          calories: null,
          trackpointCount: 2,
          hasGps: false,
          hasHeartRate: false,
          hasCadence: false,
          hasPower: false
        }
      },
      {
        path: 'account-data.json',
        filename: 'account-data.json',
        sizeBytes: 96,
        category: 'account_data',
        confidence: 'high',
        detectedKeys: ['email'],
        kind: 'account_data',
        status: 'skipped_sensitive',
        isConvertible: false,
        reason: 'Dane konta — pominięte.',
        warnings: ['Plik zawiera dane konta.']
      }
    ]);

    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain(fixture.componentInstance.displayFilePath('training-session-1.json'));
    expect(text).toContain('account-data.json');
    expect(text).toContain('Konto/profil');
    expect(store.skippedSensitive()).toHaveLength(1);
    expect(store.allWarnings()).toHaveLength(0);
  });

  it('does not show expected non-training skips as warning-panel items', () => {
    store.classifications.set([
      {
        path: 'sleep_score.json',
        filename: 'sleep_score.json',
        sizeBytes: 64,
        category: 'sleep_or_wellness',
        confidence: 'high',
        detectedKeys: ['sleepScore'],
        kind: 'sleep_results',
        status: 'skipped_non_training',
        isConvertible: false,
        reason: 'Dane snu — pominięte.',
        warnings: ['Plik zawiera wyniki snu, nie aktywność sportową do Garmin Connect.']
      },
      {
        path: 'unknown.json',
        filename: 'unknown.json',
        sizeBytes: 32,
        category: 'unknown_json',
        confidence: 'low',
        detectedKeys: [],
        kind: 'unknown_json',
        status: 'needs_analysis',
        isConvertible: false,
        reason: 'Nieznany plik JSON wymaga analizy.',
        warnings: ['Nie wykryto osi czasu treningu.']
      }
    ]);

    fixture.detectChanges();

    expect(store.allWarnings()).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain('sleep_score.json');
  });

  it('shows convertible warnings with a collapsible filename', () => {
    const longFilename = 'training-session-very-long-filename-for-warning.json';
    store.classifications.set([
      {
        path: longFilename,
        filename: longFilename,
        sizeBytes: 512,
        category: 'training_session',
        confidence: 'high',
        detectedKeys: ['sport'],
        kind: 'training_session',
        status: 'ready',
        isConvertible: true,
        reason: 'ready',
        warnings: ['Brakuje części danych GPS.']
      }
    ]);

    fixture.detectChanges();

    const warning = store.allWarnings()[0];
    expect(warning).toMatchObject({
      filename: longFilename,
      message: 'Brakuje części danych GPS.'
    });
    const filenameButton = fixture.nativeElement.querySelector(`button[title="${longFilename}"]`) as HTMLButtonElement;
    expect(filenameButton.textContent?.trim()).toBe('training-session-ver...');

    filenameButton.click();
    fixture.detectChanges();

    expect(filenameButton.textContent?.trim()).toBe(longFilename);
  });

  it('renders mobile classification cards with export actions', () => {
    const longFilename = 'planned-route-49469050-9285397-41a5e13a-eb29-409f-9871-1f2823b0ee54.json';
    store.classifications.set([
      {
        path: longFilename,
        filename: longFilename,
        sizeBytes: 256,
        category: 'unknown_json',
        confidence: 'low',
        detectedKeys: [],
        kind: 'unknown_json',
        status: 'needs_analysis',
        isConvertible: false,
        reason: 'Nie wykryto osi czasu treningu.',
        warnings: ['Nie wykryto czasu startu aktywności.']
      }
    ]);

    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    const mobileCards = fixture.nativeElement.querySelectorAll('[data-testid="classification-mobile-card"]');
    const desktopTable = fixture.nativeElement.querySelector('[data-testid="classification-table"]') as HTMLElement;
    const desktopPathButton = desktopTable.querySelector(`button[title="${longFilename}"]`) as HTMLButtonElement;
    const mobilePathButton = mobileCards[0].querySelector(`button[title="${longFilename}"]`) as HTMLButtonElement;

    expect(mobileCards.length).toBe(1);
    expect(text).not.toContain(longFilename);
    expect(desktopPathButton.textContent?.trim()).toBe(fixture.componentInstance.displayFilePath(longFilename));
    expect(mobilePathButton.textContent?.trim()).toBe(fixture.componentInstance.displayFilePath(longFilename));
    expect(text).toContain('Kategoria');
    expect(text).toContain('Wykryte klucze');
    expect(text).toContain('Ostrzeżenia');
    expect(text).toContain('Eksportuj TCX');
    expect(text).toContain('Eksportuj FIT');
    expect(text).toContain('Wszystkie TCX');
    expect(text).toContain('Wszystkie FIT');
    expect(text).toContain('TCX + FIT');
    expect(text).toContain('Raport CSV');
    expect(text).toContain('Raport JSON');
    expect(text).toContain('FIT lokalny, eksperymentalny');
    expect(text).not.toContain('FIT export experimental');

    mobilePathButton.click();
    fixture.detectChanges();

    expect(mobilePathButton.textContent?.trim()).toBe(longFilename);

    mobilePathButton.click();
    fixture.detectChanges();

    expect(mobilePathButton.textContent?.trim()).toBe(fixture.componentInstance.displayFilePath(longFilename));
  });

  it('collapses classification export actions into a mobile actions menu', () => {
    store.classifications.set([
      {
        path: 'training-session-1.json',
        filename: 'training-session-1.json',
        sizeBytes: 128,
        category: 'training_session',
        confidence: 'high',
        detectedKeys: ['sport'],
        kind: 'training_session',
        status: 'ready',
        isConvertible: true,
        reason: 'ready',
        warnings: []
      }
    ]);

    fixture.detectChanges();

    const mobileMenu = fixture.nativeElement.querySelector('[data-testid="classification-actions-menu"]') as HTMLDetailsElement;
    const desktopActions = fixture.nativeElement.querySelector('[data-testid="classification-actions-desktop"]') as HTMLElement;

    expect(mobileMenu).toBeTruthy();
    expect(mobileMenu.textContent).toContain('Eksport i raporty');
    expect(mobileMenu.textContent).toContain('Wszystkie TCX');
    expect(mobileMenu.textContent).toContain('Raport CSV');
    expect(desktopActions.className).toContain('hidden');
    expect(desktopActions.className).toContain('md:flex');
  });

  it('renders all classification summary columns in the mobile summary layout', () => {
    store.classifications.set([
      {
        path: 'training-session-1.json',
        filename: 'training-session-1.json',
        sizeBytes: 128,
        category: 'training_session',
        confidence: 'high',
        detectedKeys: ['sport'],
        kind: 'training_session',
        status: 'ready',
        isConvertible: true,
        reason: 'ready',
        warnings: []
      }
    ]);

    fixture.detectChanges();

    const mobileSummary = fixture.nativeElement.querySelector('[data-testid="classification-summary-mobile-list"]') as HTMLElement;
    expect(mobileSummary.textContent).toContain('Kategoria');
    expect(mobileSummary.textContent).toContain('Liczba');
    expect(mobileSummary.textContent).toContain('Akcja');
    expect(mobileSummary.textContent).toContain('Trening');
    expect(mobileSummary.textContent).toContain('1');
    expect(mobileSummary.textContent).toContain('konwersja do TCX/FIT');
    expect(mobileSummary.textContent).not.toContain('Aktywność dzienna');
    expect(mobileSummary.textContent).not.toContain('Dane konta');
  });

  it('renders Garmin-ready validation cards and keeps warning exports enabled', () => {
    const activity = activityFixture({ hasGps: false });
    store.classifications.set([
      {
        path: 'training-session-warning.json',
        filename: 'training-session-warning.json',
        sizeBytes: 128,
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
          path: 'training-session-warning.json',
          filename: 'training-session-warning.json',
          status: 'warning',
          message: 'Import możliwy, ale brakuje GPS.',
          hasGps: false,
          warnings: ['Import możliwy, ale brakuje GPS.']
        })
      }
    ]);

    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    const panel = fixture.nativeElement.querySelector('[data-testid="garmin-diagnostics-panel"]') as HTMLElement;
    expect(text).not.toContain('Garmin odrzucił plik?');
    expect(panel.textContent).toContain(fixture.componentInstance.displayFilePath('training-session-warning.json'));
    expect(text).toContain('Ostrzeżenie');
    expect(text).toContain('Import możliwy z ostrzeżeniami.');
    expect(text).toContain('Formaty możliwe');
    expect(text).toContain('GPS');
    expect(text).toContain('HR');
    expect(text).toContain('Warnings: Import możliwy, ale brakuje GPS.');

    const cardButtons = Array.from(panel.querySelectorAll('button')) as HTMLButtonElement[];
    const tcxButton = cardButtons.find((button) => button.textContent?.includes('Eksportuj TCX'));
    expect(tcxButton?.disabled).toBe(false);
  });

  it('renders ZIP import progress and archive contents', () => {
    store.importedZipFilename.set('polar-export.zip');
    store.importProgress.set({
      stage: 'parsing_json',
      processedFiles: 1,
      totalFiles: 3,
      currentPath: 'training-session-1.json'
    });
    store.importedPolarFiles.set([
      {
        path: 'training-session-1.json',
        filename: 'training-session-1.json',
        extension: '.json',
        sizeBytes: 128,
        kind: 'json',
        textContent: '{}'
      },
      {
        path: '.DS_Store',
        filename: '.DS_Store',
        extension: '',
        sizeBytes: 16,
        kind: 'ignored'
      }
    ]);

    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Parsowanie JSON');
    expect(text).toContain('Zaimportowane pliki');
    expect(text).toContain('polar-export.zip');
    expect(text).toContain(fixture.componentInstance.displayFilePath('training-session-1.json'));
    expect(text).toContain('Pominięty');
  });

  it('shows active feedback while classification waits for the first worker batch', () => {
    store.busy.set(true);
    store.importProgress.set({
      stage: 'classifying',
      processedFiles: 0,
      totalFiles: 2676,
      currentPath: 'training-session-1.json'
    });

    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    const progressFill = fixture.nativeElement.querySelector('[data-testid="import-progress-fill"]') as HTMLElement;
    expect(text).toContain('Klasyfikacja');
    expect(text).toContain('0 / 2676');
    expect(text).toContain('Uruchamianie lokalnego silnika');
    expect(text).toContain(fixture.componentInstance.displayFilePath('training-session-1.json'));
    expect(progressFill.style.width).toBe('3%');
    expect(progressFill.classList).toContain('animate-pulse');
  });

  it('uses longer initial ZIP filenames on desktop while keeping mobile compact', () => {
    const zipFilename = 'polar-flow-export-training-data-with-long-visible-name-2024.zip';
    const longPath = 'training-sessions/2024/05/training-session-very-long-visible-name-for-desktop.json';
    store.importedZipFilename.set(zipFilename);
    store.importedPolarFiles.set([
      {
        path: longPath,
        filename: 'training-session-very-long-visible-name-for-desktop.json',
        extension: '.json',
        sizeBytes: 128,
        kind: 'json',
        textContent: '{}'
      }
    ]);

    fixture.detectChanges();

    const archiveButton = fixture.nativeElement.querySelector(`button[title="${zipFilename}"]`) as HTMLElement;
    const pathButton = fixture.nativeElement.querySelector(`button[title="${longPath}"]`) as HTMLElement;
    const archiveMobile = archiveButton.querySelector('[data-testid="zip-archive-name-mobile"]') as HTMLElement;
    const archiveDesktop = archiveButton.querySelector('[data-testid="zip-archive-name-desktop"]') as HTMLElement;
    const pathMobile = pathButton.querySelector('[data-testid="zip-file-path-mobile"]') as HTMLElement;
    const pathDesktop = pathButton.querySelector('[data-testid="zip-file-path-desktop"]') as HTMLElement;

    expect(archiveMobile.textContent?.trim()).toBe(fixture.componentInstance.displayFilePath(zipFilename));
    expect(archiveDesktop.textContent?.trim()).toBe(fixture.componentInstance.displayFilePath(zipFilename, 50));
    expect(pathMobile.textContent?.trim()).toBe(fixture.componentInstance.displayFilePath(longPath));
    expect(pathDesktop.textContent?.trim()).toBe(fixture.componentInstance.displayFilePath(longPath, 50));
    expect((pathDesktop.textContent ?? '').length).toBeGreaterThan(pathMobile.textContent?.length ?? 0);
  });

  it('formats duration by flooring fractional seconds', () => {
    fixture.detectChanges();

    expect(fixture.componentInstance.formatDuration(9046.592)).toBe('02:30:46');
  });
});

function activityFixture(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    sourceFilename: 'training-session-warning.json',
    sourceFileKind: 'training_session',
    activityId: '123',
    sport: 'Running',
    sportDetail: 'Running',
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
    path: 'training-session-warning.json',
    filename: 'training-session-warning.json',
    sourceFileKind: 'training_session',
    activityId: '123',
    sport: 'Running',
    sportDetail: 'Running',
    startTime: '2024-05-02T06:30:00Z',
    status: 'ready',
    message: 'Gotowe do importu Garmin Connect',
    possibleFormats: ['tcx', 'fit'],
    hasGps: true,
    hasHeartRate: true,
    trackpointCount: 2,
    warnings: [],
    errors: [],
    formatValidations: [],
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
    activityId: 'preview',
    sport: 'Running',
    sportDetail: 'Running',
    startTime: '2024-05-02T06:30:00Z',
    durationSeconds: 1200,
    distanceMeters: 4000,
    calories: 245,
    trackpointCount: 3,
    hasGps: true,
    hasHeartRate: true,
    hasCadence: true,
    hasPower: false,
    averageHeartRate: 140,
    maxHeartRate: 155,
    trackpoints: [
      normalizedTrackpointFixture('2024-05-02T06:30:00Z', 52.2297, 21.0122, 0, 120),
      normalizedTrackpointFixture('2024-05-02T06:40:00Z', 52.231, 21.02, 2000, 146),
      normalizedTrackpointFixture('2024-05-02T06:50:00Z', 52.236, 21.028, 4000, 155)
    ],
    laps: [],
    metadata: {}
  };
}

function normalizedTrackpointFixture(
  time: string,
  latitude: number,
  longitude: number,
  distanceMeters: number,
  heartRate: number
): NormalizedActivity['trackpoints'][number] {
  return {
    time,
    latitude,
    longitude,
    altitudeMeters: 100 + distanceMeters / 1000,
    distanceMeters,
    heartRate,
    cadence: 82,
    speedMps: null,
    powerWatts: null,
    temperatureCelsius: null
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
    sleepSummaries: [
      {
        date: '2024-05-05',
        sleepStart: '2024-05-04T22:00:00Z',
        sleepEnd: '2024-05-05T06:00:00Z',
        durationMinutes: 480,
        sleepScore: 82,
        sourceFiles: ['sleep.json'],
        warnings: []
      }
    ],
    sleepStages: [],
    nightlyRecharge: [
      {
        date: '2024-05-05',
        rechargeStatus: 'good',
        sourceFiles: ['nightly.json'],
        warnings: []
      }
    ],
    dailyHeartRate: [
      {
        date: '2024-05-05',
        restingHeartRate: 48,
        sourceFiles: ['ohr.json'],
        warnings: []
      }
    ],
    undatedRecords: [],
    skippedRecords: [],
    warnings: [],
    summary: {
      dailyActivityDays: 1,
      sleepNights: 1,
      sleepStageRecords: 0,
      nightlyRechargeDays: 1,
      dailyHeartRateDays: 1,
      dateStart: '2024-05-04',
      dateEnd: '2024-05-05',
      averageSleepScore: 82,
      averageSleepDurationMinutes: 480,
      warningCount: 0
    }
  };
}
