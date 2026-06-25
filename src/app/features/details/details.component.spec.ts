import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DetailsComponent } from './details.component';

describe('DetailsComponent', () => {
  let fixture: ComponentFixture<DetailsComponent>;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('json2fit.language', 'pl');

    await TestBed.configureTestingModule({
      imports: [DetailsComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DetailsComponent);
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('renders moved product details and beta interest form', () => {
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;

    expect(text).toContain('Szczegóły produktu');
    expect(text).toContain('Jak to działa');
    expect(text).toContain('Proces konwersji');
    expect(text).toContain('Obsługiwane dane');
    expect(text).toContain('Ograniczenia');
    expect(text).toContain('FAQ');
    expect(text).toContain('Treningi z eksportu Polar Flow');
    expect(text).toContain('Garmin Connect może nie importować historii snu');
    expect(text).toContain('Czy moje pliki trafiają na serwer?');
    expect(text).toContain('Co rozwijać dalej?');
    expect(text).toContain('Zapisz preferencje');
  });

  it('keeps moved sections separate and scannable', () => {
    fixture.detectChanges();

    const processCard = fixture.nativeElement.querySelector('[data-testid="details-process-card"]') as HTMLElement;
    const supportedData = fixture.nativeElement.querySelector('[data-testid="details-supported-data"]') as HTMLElement;
    const limitations = fixture.nativeElement.querySelector('[data-testid="details-limitations"]') as HTMLElement;
    const faq = fixture.nativeElement.querySelector('[data-testid="details-faq"]') as HTMLElement;

    expect(processCard.textContent).toContain('polar-export-2026.zip');
    expect(processCard.textContent).toContain('Raport Garmin-ready');
    expect(supportedData.textContent).toContain('GPS');
    expect(supportedData.textContent).toContain('Tętno');
    expect(supportedData.textContent).toContain('Raporty CSV');
    expect(limitations.textContent).toContain('FIT jest lokalny i eksperymentalny');
    expect(faq.textContent).toContain('Czy muszę używać FIT?');
  });
});
