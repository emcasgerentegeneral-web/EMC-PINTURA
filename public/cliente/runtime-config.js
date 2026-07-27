window.EMC_RUNTIME = {
  apiBaseUrl: ['localhost', '127.0.0.1', 'emc-pintura.onrender.com'].includes(window.location.hostname)
    ? ''
    : 'https://emc-pintura.onrender.com',
  config: {
    labor: { basico: 62, medio: 80, premium: 180 },
    crewRates: { basico: 25, medio: 30, premium: 40 },
    adjustments: { singleAdditionalPct: 15, ivaPct: 16 },
    paints: [],
    sealers: [],
    payments: { daiActive: false, daiRate: 0, bank: '', accountHolder: '', clabe: '', bitsoUser: '', daiValidityMinutes: 20 },
    workerPerformance: { painterM2PerDay: 26, levelFactor: { basico: 1, medio: 0.72, premium: 0.48 } },
    contact: { whatsapp: '529932869691' }
  }
};
