import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BETA_SIGNAL_COUNTERS_STORAGE_KEY } from '@features/beta/beta-signal.model';
import { supportConfig } from '@shared/product';
import { SupportButtonComponent } from './support-button.component';

describe('SupportButtonComponent', () => {
  let fixture: ComponentFixture<SupportButtonComponent>;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('json2fit.language', 'pl');

    await TestBed.configureTestingModule({
      imports: [SupportButtonComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(SupportButtonComponent);
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('renders the configured Buy Me a Coffee link as a new-tab link', () => {
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('[data-testid="support-button"]') as HTMLAnchorElement;

    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe(supportConfig.buyMeACoffeeUrl);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.textContent).toContain('Postaw kawę');
  });

  it('records a local support click signal', () => {
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('[data-testid="support-button"]') as HTMLAnchorElement;
    link.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(JSON.parse(localStorage.getItem(BETA_SIGNAL_COUNTERS_STORAGE_KEY) ?? '{}')).toMatchObject({
      buy_me_a_coffee_clicked: 1
    });
  });
});
