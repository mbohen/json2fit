import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BETA_INTEREST_STORAGE_KEY, BETA_SIGNAL_COUNTERS_STORAGE_KEY } from './beta-signal.model';
import { BetaInterestFormComponent } from './beta-interest-form.component';

describe('BetaInterestFormComponent', () => {
  let fixture: ComponentFixture<BetaInterestFormComponent>;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('json2fit.language', 'pl');

    await TestBed.configureTestingModule({
      imports: [BetaInterestFormComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(BetaInterestFormComponent);
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('renders beta interest checkboxes without collecting email', () => {
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    const checkboxes = fixture.nativeElement.querySelectorAll('input[type="checkbox"]');

    expect(text).toContain('Co rozwijać dalej?');
    expect(text).toContain('Polar → Garmin treningi TCX/FIT');
    expect(text).toContain('Polar activity → Garmin/Fitbit CSV');
    expect(text).toContain('Raporty snu i wellness');
    expect(text).toContain('Chcę pomóc testować wersję beta');
    expect(checkboxes).toHaveLength(7);
    for (const checkbox of checkboxes) {
      expect((checkbox as HTMLInputElement).checked).toBe(false);
    }
    expect(fixture.nativeElement.querySelector('input[type="email"]')).toBeNull();
  });

  it('saves selected preferences locally and shows an inline message', () => {
    fixture.detectChanges();

    const checkboxes = fixture.nativeElement.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
    checkboxes[0].checked = true;
    checkboxes[0].dispatchEvent(new Event('change'));
    checkboxes[6].checked = true;
    checkboxes[6].dispatchEvent(new Event('change'));
    const button = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(JSON.parse(localStorage.getItem(BETA_INTEREST_STORAGE_KEY) ?? '{}')).toMatchObject({
      polarToGarminTraining: true,
      betaTesting: true
    });
    expect(JSON.parse(localStorage.getItem(BETA_SIGNAL_COUNTERS_STORAGE_KEY) ?? '{}')).toMatchObject({
      interest_preferences_saved: 1
    });
    expect(fixture.nativeElement.textContent).toContain('Dziękujemy — preferencje zapisane lokalnie.');
  });
});
