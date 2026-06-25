export type ProductPlan = 'free' | 'beta' | 'pro' | 'dev';

export interface FeatureFlags {
  zipImport: boolean;
  batchExport: boolean;
  fitExport: boolean;
  wellnessExport: boolean;
  mapsAndCharts: boolean;
  diagnostics: boolean;
}

export const PRODUCT_FEATURE_FLAGS: Record<ProductPlan, FeatureFlags> = {
  free: {
    zipImport: false,
    batchExport: false,
    fitExport: false,
    wellnessExport: false,
    mapsAndCharts: false,
    diagnostics: false
  },
  beta: {
    zipImport: true,
    batchExport: true,
    fitExport: true,
    wellnessExport: true,
    mapsAndCharts: true,
    diagnostics: true
  },
  pro: {
    zipImport: true,
    batchExport: true,
    fitExport: true,
    wellnessExport: true,
    mapsAndCharts: true,
    diagnostics: true
  },
  dev: {
    zipImport: true,
    batchExport: true,
    fitExport: true,
    wellnessExport: true,
    mapsAndCharts: true,
    diagnostics: true
  }
};

export const DEFAULT_PRODUCT_PLAN: ProductPlan = 'beta';

export function featureFlagsForPlan(plan: ProductPlan = DEFAULT_PRODUCT_PLAN): FeatureFlags {
  return { ...PRODUCT_FEATURE_FLAGS[plan] };
}
