export const SERVICE_COPY = {
  representation: {
    title: 'Representation'
  },
  ops: {
    title: 'Operations'
  },
  qc: {
    title: 'Quality control - arrivals'
  },
  training: {
    title: 'Training'
  },
  intel: {
    title: 'Intel'
  }
};

export const SERVICE_DEFAULTS = {
  representation: {
    shareOfCapacity: 0.32,
    daysPerUnit: 1.5,
    basePrice: 2250,
    directCostPerUnit: 180,
    fixedCostShare: 0.34,
    variableCostShare: 0.28,
    pricingFences: {
      min: 2030,
      target: 2250,
      stretch: 2700
    }
  },
  ops: {
    shareOfCapacity: 0.22,
    daysPerUnit: 1,
    basePrice: 1450,
    directCostPerUnit: 140,
    fixedCostShare: 0.2,
    variableCostShare: 0.25,
    pricingFences: {
      min: 1310,
      target: 1450,
      stretch: 1740
    }
  },
  qc: {
    shareOfCapacity: 0.16,
    daysPerUnit: 0.6,
    basePrice: 980,
    directCostPerUnit: 90,
    fixedCostShare: 0.12,
    variableCostShare: 0.15,
    pricingFences: {
      min: 880,
      target: 980,
      stretch: 1180
    }
  },
  training: {
    shareOfCapacity: 0.18,
    daysPerUnit: 1.2,
    basePrice: 1180,
    directCostPerUnit: 105,
    fixedCostShare: 0.18,
    variableCostShare: 0.2,
    pricingFences: {
      min: 1060,
      target: 1180,
      stretch: 1420
    }
  },
  intel: {
    shareOfCapacity: 0.12,
    daysPerUnit: 0.5,
    basePrice: 760,
    directCostPerUnit: 80,
    fixedCostShare: 0.16,
    variableCostShare: 0.12,
    pricingFences: {
      min: 680,
      target: 760,
      stretch: 910
    }
  }
};

export default {
  copy: SERVICE_COPY,
  defaults: SERVICE_DEFAULTS
};
