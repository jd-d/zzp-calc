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
    variableCostShare: 0.28
  },
  ops: {
    shareOfCapacity: 0.22,
    daysPerUnit: 1,
    basePrice: 1450,
    directCostPerUnit: 140,
    fixedCostShare: 0.2,
    variableCostShare: 0.25
  },
  qc: {
    shareOfCapacity: 0.16,
    daysPerUnit: 0.6,
    basePrice: 980,
    directCostPerUnit: 90,
    fixedCostShare: 0.12,
    variableCostShare: 0.15
  },
  training: {
    shareOfCapacity: 0.18,
    daysPerUnit: 1.2,
    basePrice: 1180,
    directCostPerUnit: 105,
    fixedCostShare: 0.18,
    variableCostShare: 0.2
  },
  intel: {
    shareOfCapacity: 0.12,
    daysPerUnit: 0.5,
    basePrice: 760,
    directCostPerUnit: 80,
    fixedCostShare: 0.16,
    variableCostShare: 0.12
  }
};

export default {
  copy: SERVICE_COPY,
  defaults: SERVICE_DEFAULTS
};
