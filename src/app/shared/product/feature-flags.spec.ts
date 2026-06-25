import { DEFAULT_PRODUCT_PLAN, featureFlagsForPlan } from './feature-flags';

describe('product feature flags', () => {
  it('uses beta as the default full-access plan', () => {
    expect(DEFAULT_PRODUCT_PLAN).toBe('beta');
    expect(Object.values(featureFlagsForPlan('beta')).every((enabled) => enabled)).toBe(true);
  });

  it('enables every existing capability for the dev plan', () => {
    expect(Object.values(featureFlagsForPlan('dev')).every((enabled) => enabled)).toBe(true);
  });

  it('keeps the free plan focused on single-activity TCX workflows', () => {
    expect(featureFlagsForPlan('free')).toEqual({
      zipImport: false,
      batchExport: false,
      fitExport: false,
      wellnessExport: false,
      mapsAndCharts: false,
      diagnostics: false
    });
  });

  it('describes the pro plan without introducing payment enforcement', () => {
    const proFlags = featureFlagsForPlan('pro');

    expect(proFlags).toEqual({
      zipImport: true,
      batchExport: true,
      fitExport: true,
      wellnessExport: true,
      mapsAndCharts: true,
      diagnostics: true
    });
    expect(featureFlagsForPlan('pro')).not.toBe(proFlags);
  });
});
