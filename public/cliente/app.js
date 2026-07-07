const app = document.querySelector('#app');

function initialQuote() {
  return {
    client: {
      name: '',
      company: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      propertyType: 'Casa',
      serviceNeed: 'Pintura',
      urgency: 'Esta semana'
    },
    project: {
      squareMeters: '',
      interiorSquareMeters: '',
      exteriorSquareMeters: '',
      floors: '',
      heightMeters: '',
      applicationType: 'Interior'
    },
    diagnostic: {},
    photos: [],
    service: {
      selectedLevel: '',
      paintId: '',
      sealerId: '',
      paintSupply: '',
      paintBucketsOverride: '',
      sealerBucketsOverride: '',
      riskOverrideAccepted: false,
      invoice: false,
      paymentMethod: 'Efectivo',
      painters: 2
    },
    observations: ''
  };
}

const state = {
  config: null,
  view: 'home',
  step: 0,
  modal: null,
  aiStatus: null,
  photoAnalysis: null,
  analyzingPhotos: false,
  photoAnalysisSignature: '',
  showServiceOptions: false,
  showCrewConfig: false,
  quote: initialQuote(),
  lastSavedQuote: null
};

const analyticsSessionId = (() => {
  const key = 'emc_analytics_session';
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  sessionStorage.setItem(key, id);
  return id;
})();

function track(type, detail = {}) {
  const payload = {
    type,
    path: window.location.pathname,
    title: document.title,
    referrer: document.referrer,
    sessionId: analyticsSessionId,
    view: state.view,
    step: state.view === 'quote' ? state.step + 1 : null,
    ...detail
  };
  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    }).catch(() => {});
  } catch (error) {
    // La captura de visitas nunca debe impedir que el cliente cotice.
  }
}

const stepLabels = [
  'Tus datos',
  'Qué se pinta',
  'Fotos',
  'Precio',
  'Pintura',
  'Enviar'
];

const requiredPhotos = ['Foto general', 'Foto de pared', 'Foto de acceso', 'Foto de detalle'];

const levelOrder = ['basico', 'medio', 'premium'];
const referenceMaterial = {
  paintYieldPerLiter: 7,
  paintPresentation: 20,
  paintYieldBaseCoats: 2,
  sealerYieldPerLiter: 8,
  sealerPresentation: 19
};

const levels = {
  basico: {
    label: 'Básico',
    short: 'Pintar',
    coats: 2,
    price: 62,
    ideal: 'Casas habitadas, cambio de color, mantenimiento ligero y paredes en buen estado.',
    scope: 'Protección básica de muebles y pisos, limpieza superficial de polvo, corrección de imperfecciones menores, aplicación de 2 manos de pintura y limpieza final del área.',
    includes: ['Protección básica', 'Limpieza superficial', 'Imperfecciones menores', 'Pintura 2 manos', 'Limpieza final'],
    excludes: ['Resanes extensos', 'Sellador', 'Tratamiento de humedad', 'Raspado completo', 'Reparación de grietas'],
    when: 'Ideal para paredes sanas o mantenimiento ligero donde el objetivo principal es pintar.'
  },
  medio: {
    label: 'Medio',
    short: 'Pintar y corregir',
    coats: 2,
    price: 80,
    ideal: 'Casas con desgaste normal, viviendas que llevan varios años sin pintar y fachadas con pequeños daños.',
    scope: 'Incluye Básico más lijado de superficies, resanes menores, corrección de grietas superficiales, retiro de pintura suelta, preparación más detallada, aplicación uniforme de 2 manos y revisión de acabado por EMC.',
    includes: ['Todo lo del Básico', 'Lijado', 'Resanes menores', 'Grietas superficiales', 'Retiro de pintura suelta', 'Preparación detallada', 'Revisión EMC'],
    excludes: ['Resane total', 'Sellador general', 'Reparación de humedad severa', 'Corrección estructural'],
    when: 'Probablemente el nivel más vendido para casas con desgaste normal y mejor relación calidad/precio.'
  },
  premium: {
    label: 'Plus',
    short: 'Renovar y embellecer',
    coats: 3,
    price: 180,
    ideal: 'Casas premium, remodelaciones, entrega de propiedades y clientes exigentes.',
    scope: 'Incluye Medio más raspado total donde sea necesario, resane completo, sellador, corrección de detalles finos, preparación integral, protección detallada, aplicación de pintura premium, acabado uniforme de alta calidad, inspección final EMC y garantía extendida.',
    includes: ['Todo lo del Medio', 'Raspado total necesario', 'Resane completo', 'Sellador', 'Detalles finos', 'Protección detallada', 'Pintura premium', 'Inspección final EMC', 'Garantía extendida'],
    excludes: ['Corrección estructural mayor no relacionada con pintura'],
    when: 'Ideal para remodelaciones, entrega de propiedades, daño importante o acabado de mayor prestigio.'
  }
};

function money(value) {
  return Number(value || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function daiPaymentAvailable() {
  const payments = state.config?.payments || {};
  return Boolean(payments.daiActive && Number(payments.daiRate) > 0 && String(payments.bitsoUser || '').trim());
}

function projectSquareMeters() {
  const p = state.quote.project;
  if (p.applicationType === 'Interior') return Number(p.interiorSquareMeters || p.squareMeters || 0);
  if (p.applicationType === 'Exterior') return Number(p.exteriorSquareMeters || p.squareMeters || 0);
  return Number(p.interiorSquareMeters || 0) + Number(p.exteriorSquareMeters || 0);
}

function syncProjectSquareMeters() {
  state.quote.project.squareMeters = projectSquareMeters();
}

function autoAccess() {
  const height = Number(state.quote.project.heightMeters || 0);
  const exterior = state.quote.project.applicationType !== 'Interior';
  if (!height) return { ladder: false, scaffold: false, pending: true };
  return {
    ladder: height >= 3,
    scaffold: exterior && height >= 4
  };
}

function today() {
  return new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' });
}

function businessWhatsapp() {
  return String(state.config?.contact?.whatsapp || '').replace(/\D/g, '');
}

function whatsappUrl(text = 'Hola, quiero una cotización para pintar mi casa con EMC Pintura.') {
  const phone = businessWhatsapp();
  const message = encodeURIComponent(text);
  return phone ? `https://wa.me/${phone}?text=${message}` : '';
}

function otherServiceWhatsappText(service) {
  const c = state.quote.client || {};
  return [
    `Hola, quiero cotizar ${service} con EMC Suministros y Servicios.`,
    `Nombre: ${c.name || '-'}`,
    `WhatsApp: ${c.phone || '-'}`,
    `Casa/negocio/empresa: ${c.company || '-'}`,
    `Municipio: ${c.city || '-'}`,
    `Zona: ${c.address || '-'}`,
    'Descripción:'
  ].join('\n');
}

function serviceShortcutGrid() {
  const services = [
    'Mantenimiento general',
    'Mantenimiento eléctrico',
    'Herrería',
    'Suministros'
  ];
  return `
    <div class="service-shortcuts">
      <div class="paint-selected">
        <strong>Pintura</strong>
        <span>Este sí se calcula aquí.</span>
      </div>
      ${services.map(service => `
        <a class="service-shortcut" href="${whatsappUrl(otherServiceWhatsappText(service))}" target="_blank" rel="noopener" data-other-service="${service}">
          <strong>${service}</strong>
          <span>Atención directa por WhatsApp</span>
        </a>
      `).join('')}
    </div>
  `;
}

function leadWhatsappText(calc = calculate(), savedQuote = null) {
  const q = savedQuote || state.quote;
  const client = q.client || {};
  const project = q.project || {};
  const folio = savedQuote?.folio ? `\nFolio: ${savedQuote.folio}` : '';
  return [
    'Hola, quiero una cotización con EMC Suministros y Servicios.',
    folio,
    `Nombre: ${client.name || '-'}`,
    `Casa/negocio/empresa: ${client.company || '-'}`,
    `WhatsApp: ${client.phone || '-'}`,
    `Municipio: ${client.city || '-'}`,
    `Tipo de cliente: ${client.propertyType || '-'}`,
    `Servicio: ${client.serviceNeed || 'Pintura'}`,
    `Urgencia: ${client.urgency || '-'}`,
    `Área aproximada: ${project.squareMeters || project.interiorSquareMeters || project.exteriorSquareMeters || '-'} m²`,
    `Total preliminar: ${money(calc.total)}`,
    `Comentarios: ${q.observations || '-'}`
  ].filter(Boolean).join('\n');
}

function whatsappCta(className = 'floating-whatsapp') {
  const url = whatsappUrl();
  if (!url) return '';
  return `<a class="${className}" href="${url}" target="_blank" rel="noopener">WhatsApp</a>`;
}

function scrollToPageStart() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function setView(view, step = state.step) {
  state.view = view;
  state.step = step;
  state.modal = null;
  render();
  track(view === 'quote' ? 'quote_step' : 'pageview', { detail: view, step: view === 'quote' ? step + 1 : null });
  scrollToPageStart();
  window.requestAnimationFrame(scrollToPageStart);
  window.setTimeout(scrollToPageStart, 25);
}

function startNewQuote() {
  track('quote_start', { detail: 'calcular ahora' });
  state.quote = initialQuote();
  state.step = 0;
  state.modal = null;
  state.photoAnalysis = null;
  state.analyzingPhotos = false;
  state.photoAnalysisSignature = '';
  state.showServiceOptions = false;
  state.showCrewConfig = false;
  setView('quote', 0);
}

function update(path, value) {
  const keys = path.split('.');
  let target = state.quote;
  keys.slice(0, -1).forEach(key => {
    target = target[key];
  });
  target[keys.at(-1)] = value;
}

async function loadConfig() {
  const [configResponse, aiStatusResponse] = await Promise.all([
    fetch('/api/config', { cache: 'no-store' }),
    fetch('/api/ai-status', { cache: 'no-store' })
  ]);
  state.config = await configResponse.json();
  state.aiStatus = await aiStatusResponse.json();
  if (new URLSearchParams(window.location.search).get('start') === 'quote') {
    startNewQuote();
    return;
  }
  render();
  track('pageview', { detail: 'cliente inicio' });
}

function highestLevel(a, b) {
  return levelOrder[Math.max(levelOrder.indexOf(a), levelOrder.indexOf(b))] || 'basico';
}

function minimumLevelByRules() {
  let minimum = 'basico';
  if (state.photoAnalysis?.minimumLevel) minimum = highestLevel(minimum, state.photoAnalysis.minimumLevel);
  return minimum;
}

function isLevelAllowed(level) {
  return levelOrder.indexOf(level) >= levelOrder.indexOf(minimumLevelByRules());
}

function isBelowMinimum(level = state.quote.service.selectedLevel) {
  return levelOrder.indexOf(level) < levelOrder.indexOf(minimumLevelByRules());
}

function scoreDiagnostic() {
  return minimumLevelByRules();
}

function customerMinimumLevel() {
  return scoreDiagnostic();
}

function photoReviewPending() {
  return state.quote.photos.length >= 4 && !state.photoAnalysis;
}

function recommendationReasons() {
  const access = autoAccess();
  const reasons = [];
  const finalMinimum = customerMinimumLevel();
  if (state.photoAnalysis?.enabled) reasons.push(`Análisis visual IA: ${state.photoAnalysis.summary}`);
  if (state.photoAnalysis?.minimumLevel && state.photoAnalysis.minimumLevel !== 'basico') {
    reasons.push(`La revisión de fotos recomienda mínimo ${levels[finalMinimum].label}.`);
  }
  if (access.ladder) reasons.push('La altura se considera para equipo de acceso, pero no cambia por sí sola el nivel de servicio.');
  if (access.scaffold) reasons.push('Si se requiere andamio o acceso especial, se cotiza aparte como costo trasladable al cliente.');
  if (state.quote.project.applicationType !== 'Interior') reasons.push('El trabajo incluye exterior; el nivel se define por estado de la superficie, no solo por ubicación.');
  return reasons.length ? reasons : ['Las fotos y datos del proyecto no muestran condiciones que obliguen a subir el nivel en esta revisión preliminar.'];
}

function emcAssistant() {
  const q = state.quote;
  const level = scoreDiagnostic();
  const missing = [];
  const alerts = [];
  const questions = [];
  const adminNotes = [];
  const m2 = projectSquareMeters();
  const height = Number(q.project.heightMeters || 0);

  if (!q.client.name || !q.client.phone) missing.push('Faltan datos básicos de contacto.');
  if (!m2) missing.push('Falta confirmar metros cuadrados aproximados.');
  if (!height) missing.push('Falta altura aproximada en metros.');
  if (q.photos.length < 1) missing.push('Sin fotos; EMC puede pedir apoyo por WhatsApp si hace falta.');
  if (q.project.applicationType !== 'Interior' && height >= 4) questions.push('El trabajo parece alto. ¿Hay espacio y permiso para trabajar con acceso especial?');

  if (state.photoAnalysis?.alerts?.length) alerts.push(...state.photoAnalysis.alerts);
  if (height >= 4) alerts.push('Riesgo operativo por altura: revisar acceso y seguridad antes de confirmar.');
  if (q.service.selectedLevel && isBelowMinimum(q.service.selectedLevel)) alerts.push(`El cliente eligió ${levels[q.service.selectedLevel].label} por precio, pero la recomendación visual mínima es ${levels[level].label}. Debe tratarse como alcance limitado.`);

  const material = materialEstimateForLevel(q.service.selectedLevel || level);
  adminNotes.push(`Nivel sugerido: ${levels[level].label}.`);
  adminNotes.push(`Material técnico estimado: ${material.paintLiters.toFixed(1)} L de pintura. Suministro EMC sugerido: ${material.paintBuckets} cubeta(s).`);
  if (material.sealerLiters) adminNotes.push(`Sellador técnico sugerido: ${material.sealerLiters.toFixed(1)} L. Suministro EMC sugerido: ${material.sealerBuckets} cubeta(s).`);
  adminNotes.push(`Revisar fotos antes de confirmar precio final y alcance.`);

  return {
    label: 'Asistente EMC',
    summary: `Recomendación preliminar: ${levels[level].label}. ${levels[level].short}.`,
    missing,
    questions,
    alerts,
    adminNotes,
    material,
    reviewedAt: new Date().toISOString()
  };
}

function selectedPaint() {
  return state.config.paints.find(paint => paint.id === state.quote.service.paintId) || null;
}

function selectedSealer() {
  const sealers = state.config.sealers || [];
  return sealers.find(sealer => sealer.id === state.quote.service.sealerId) || null;
}

function needsSealer(level = state.quote.service.selectedLevel || scoreDiagnostic()) {
  return level === 'premium' || state.photoAnalysis?.minimumLevel === 'premium';
}

function materialEstimateForLevel(level, paint = selectedPaint(), sealer = selectedSealer()) {
  const m2 = projectSquareMeters();
  const coats = levels[level].coats;
  const paintYield = Number(paint?.yieldPerLiter || referenceMaterial.paintYieldPerLiter);
  const paintYieldBaseCoats = Number(paint?.yieldBaseCoats || referenceMaterial.paintYieldBaseCoats);
  const paintPresentation = Number(paint?.presentation || referenceMaterial.paintPresentation);
  const sealerYield = Number(sealer?.yieldPerLiter || referenceMaterial.sealerYieldPerLiter);
  const sealerPresentation = Number(sealer?.presentation || referenceMaterial.sealerPresentation);
  const paintLiters = (m2 / Math.max(1, paintYield)) * (coats / Math.max(1, paintYieldBaseCoats));
  const paintBuckets = Math.ceil(paintLiters / Math.max(1, paintPresentation));
  const sealerLiters = needsSealer(level) ? m2 / Math.max(1, sealerYield) : 0;
  const sealerBuckets = sealerLiters ? Math.ceil(sealerLiters / Math.max(1, sealerPresentation)) : 0;
  return {
    coats,
    paintYield,
    paintYieldBaseCoats,
    paintPresentation,
    paintLiters,
    paintBuckets,
    sealerYield,
    sealerPresentation,
    sealerLiters,
    sealerBuckets
  };
}

function estimateDays(level, painters = state.quote.service.painters) {
  const perf = state.config.workerPerformance || { painterM2PerDay: 26, levelFactor: { basico: 1, medio: 0.72, premium: 0.48 } };
  const m2 = projectSquareMeters();
  const factor = perf.levelFactor[level] || 1;
  const dailyAdvance = Math.max(1, Number(painters || 1) * perf.painterM2PerDay * factor);
  return {
    dailyAdvance,
    days: Math.max(1, Math.ceil(m2 / dailyAdvance))
  };
}

function paintMaterialDetails(calc) {
  const m2 = projectSquareMeters();
  const formula = `${m2} m² / ${calc.paintYield} m²/L = ${calc.liters.toFixed(1)} L`;
  const buckets = `${calc.buckets} cubeta${calc.buckets !== 1 ? 's' : ''} de ${calc.paintPresentation} L`;
  const cost = calc.paintCost ? money(calc.paintCost) : 'Pendiente';
  return { formula, buckets, cost };
}

function sealerMaterialDetails(calc) {
  if (!calc.sealerLiters) return null;
  const m2 = projectSquareMeters();
  const formula = `${m2} m² / ${calc.sealerYield} m²/L = ${calc.sealerLiters.toFixed(1)} L`;
  const buckets = `${calc.sealerBuckets} cubeta${calc.sealerBuckets !== 1 ? 's' : ''} de ${calc.sealerPresentation} L`;
  const cost = calc.sealerCost ? money(calc.sealerCost) : 'Pendiente';
  return { formula, buckets, cost };
}

function calculate() {
  const q = state.quote;
  const config = state.config;
  syncProjectSquareMeters();
  const m2 = projectSquareMeters();
  const recommendedLevel = scoreDiagnostic();
  const level = q.service.selectedLevel || recommendedLevel;
  const saleRate = Number(config.labor?.[level] || levels[level]?.price || 0);
  const crewRate = Number(config.crewRates?.[level] || { basico: 25, medio: 30, premium: 40 }[level] || 0);
  const painters = Number(q.service.painters || 1);
  const crewPayment = m2 * crewRate;
  const marginRate = Math.max(0, saleRate - crewRate);
  const margin = m2 * marginRate;
  const height = Number(q.project.heightMeters || 0);
  const access = autoAccess();
  const exteriorAdjustment = 0;
  const ladder = 0;
  const scaffoldRequired = Boolean(access.scaffold);
  const serviceSubtotalWithoutPaint = m2 * saleRate;
  const mold = 0;
  const saltpeter = 0;
  const difficulty = 0;
  const treatments = mold + saltpeter;
  const paint = selectedPaint();
  const sealer = selectedSealer();
  const material = materialEstimateForLevel(level, paint, sealer);
  const liters = material.paintLiters;
  const buckets = Number(q.service.paintBucketsOverride || 0) || material.paintBuckets;
  const paintCost = q.service.paintSupply === 'cliente' || !paint ? 0 : buckets * paint.price;
  const sealerLiters = material.sealerLiters;
  const sealerBuckets = Number(q.service.sealerBucketsOverride || 0) || material.sealerBuckets;
  const sealerCost = sealerBuckets && sealer ? sealerBuckets * sealer.price : 0;
  const unitServiceCostWithoutPaint = m2 ? crewPayment / m2 : 0;
  const paintQuote = paintCost + sealerCost;
  const quoteBaseBeforeSingleAdditional = serviceSubtotalWithoutPaint + paintQuote;
  const singleAdditionalPct = Number(config.adjustments.singleAdditionalPct ?? 15);
  const singleAdditionalApplies = scaffoldRequired;
  const scaffold = scaffoldRequired ? quoteBaseBeforeSingleAdditional * (singleAdditionalPct / 100) : 0;
  const accessEquipmentCost = scaffold;
  const singleAdditionalAmount = scaffold;
  const directServiceCost = crewPayment + scaffold;
  const subtotal = quoteBaseBeforeSingleAdditional + singleAdditionalAmount;
  const iva = q.service.invoice ? subtotal * (config.adjustments.ivaPct / 100) : 0;
  const total = subtotal + iva;
  const daiRate = Number(config.payments.daiRate || 0);
  const dai = daiRate > 0 ? total / daiRate : 0;
  const schedule = estimateDays(level);
  const assistant = emcAssistant();
  return {
    recommendedLevel,
    level,
    minimumLevel: minimumLevelByRules(),
    crewRate,
    saleRate,
    crewPayment,
    painters,
    marginRate,
    margin,
    grossControlMargin: margin,
    laborBase: serviceSubtotalWithoutPaint,
    directServiceCost,
    unitServiceCostWithoutPaint,
    serviceSubtotalWithoutPaint,
    paintQuote,
    accessEquipmentCost,
    ladder,
    exteriorAdjustment,
    consumables: singleAdditionalAmount,
    singleAdditionalPct,
    singleAdditionalApplies,
    singleAdditionalAmount,
    quoteBaseBeforeSingleAdditional,
    scaffold,
    scaffoldRequired,
    treatments,
    difficulty,
    paint,
    sealer,
    coats: material.coats,
    paintYield: material.paintYield,
    paintYieldBaseCoats: material.paintYieldBaseCoats,
    paintPresentation: material.paintPresentation,
    liters,
    buckets,
    paintCost,
    sealerLiters,
    sealerYield: material.sealerYield,
    sealerPresentation: material.sealerPresentation,
    sealerBuckets,
    sealerCost,
    subtotal,
    iva,
    total,
    dai,
    painters: q.service.painters,
    dailyAdvance: schedule.dailyAdvance,
    estimatedDays: schedule.days,
    reasons: recommendationReasons(),
    assistant
  };
}

function home() {
  return `
    <section class="home">
      <div class="home-card">
        <img class="brand-logo" src="/assets/emc-logo.jpg" alt="EMC Pintura">
        <p class="division">EMC Suministros y Servicios en Villahermosa, Centro y municipios cercanos</p>
        <h1>Cotiza pintura, mantenimiento eléctrico, herrería o suministros.</h1>
        <p class="home-tagline">Deja tus datos, calcula un estimado inicial y EMC te confirma por WhatsApp.</p>
        <div class="benefits">
          <span>Gratis</span>
          <span>Rápido</span>
          <span>Seguimiento por WhatsApp</span>
        </div>
        ${homeProcess()}
        <div class="button-stack">
          <button class="btn btn-primary btn-hero" data-action="quote">
            <strong>Calcular ahora</strong>
            <small>Gratis y sin compromiso</small>
          </button>
        </div>
        ${whatsappUrl('Hola, quiero cotizar un servicio con EMC Suministros y Servicios.') ? `<a class="home-whatsapp-link" href="${whatsappUrl('Hola, quiero cotizar un servicio con EMC Suministros y Servicios.')}" target="_blank" rel="noopener" aria-label="Presiona aquí si prefieres atención por WhatsApp"><strong>Presiona aquí si prefieres atención por WhatsApp</strong><span aria-hidden="true">WhatsApp</span></a>` : ''}
      </div>
    </section>
    <section class="seo-strip" aria-label="Servicios de pintura">
      <div>
        <strong>Servicios para locales, restaurantes, clínicas, bodegas, escuelas y casas</strong>
        <span>Pintura, mantenimiento general, mantenimiento eléctrico, herrería y suministros en Villahermosa/Centro, Nacajuca, Jalpa de Méndez y Cunduacán.</span>
      </div>
    </section>
  `;
}

function homeProcess() {
  const steps = [
    ['1', 'Pon tu WhatsApp.'],
    ['2', 'Di qué servicio necesitas.'],
    ['3', 'Sube fotos si tienes.'],
    ['4', 'Recibe precio y seguimiento.']
  ];
  return `
    <div class="client-method" aria-label="Método EMC">
      <span>Cómo obtienes tu precio</span>
      <div class="client-method-grid">
        ${steps.map(([title, text], index) => `
          <div class="client-method-card">
            <small>${title}</small>
          <strong>${index === 0 ? 'Datos' : index === 1 ? 'Fotos' : index === 2 ? 'Precio' : 'Contacto'}</strong>
            <em>${text}</em>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function topbar(subtitle) {
  return `
    <header class="topbar site-header">
      <button class="site-brand" data-action="home" type="button" aria-label="Ir al inicio">
        <img class="topbar-logo" src="/assets/emc-logo.jpg" alt="EMC">
        <span>
          <strong>EMC Servicios y Suministros</strong>
          <small>${subtitle}</small>
        </span>
      </button>
      <div class="topbar-title">
          <strong>División Servicios</strong>
        <span>${subtitle}</span>
      </div>
    </header>
  `;
}

function progress() {
  return `<div class="progress six">${[0, 1, 2, 3, 4, 5].map(i => `<span class="${i <= state.step ? 'active' : ''}"></span>`).join('')}</div>`;
}

function clientPhaseIndex() {
  if (state.step <= 1) return 0;
  if (state.step === 2) return 1;
  if (state.step <= 4) return 2;
  return 3;
}

function clientControlPath() {
  const current = clientPhaseIndex();
  const phases = [
    ['Inicio', 'Datos básicos'],
    ['Apoyo', 'Fotos si puedes'],
    ['Precio', 'Estimado inicial'],
    ['Confirmar', 'EMC te contacta']
  ];
  return `
    <div class="client-path" aria-label="Proceso EMC">
      ${phases.map(([title, text], index) => `
        <div class="client-path-step ${index < current ? 'done' : ''} ${index === current ? 'active' : ''}">
          <span>${index + 1}</span>
          <strong>${title}</strong>
          <small>${text}</small>
        </div>
      `).join('')}
    </div>
  `;
}

function input(path, label, type = 'text', attrs = '') {
  const value = path.split('.').reduce((acc, key) => acc[key], state.quote) ?? '';
  return `<label>${label}<input data-path="${path}" type="${type}" value="${value}" ${attrs}></label>`;
}

function select(path, label, options) {
  const value = path.split('.').reduce((acc, key) => acc[key], state.quote);
  return `
    <label>${label}
      <select data-path="${path}">
        ${options.map(option => `<option value="${option}" ${option === value ? 'selected' : ''}>${option}</option>`).join('')}
      </select>
    </label>
  `;
}

function quoteStep() {
  const calc = calculate();
  const steps = [stepClient, stepProject, stepPhotos, stepRecommendation, stepSupply, stepSummary];
  return `
    ${topbar(`Paso ${state.step + 1} de 6`)}
    <section class="screen">
      ${progress()}
      ${clientControlPath()}
      ${stepContext(calc)}
      ${steps[state.step](calc)}
    </section>
    ${modal()}
    ${whatsappCta()}
  `;
}

function stepContext(calc) {
  const title = state.step === 0 ? 'Empezamos fácil' : state.step < 5 ? 'Vamos paso a paso' : 'Último paso';
  return `
    <div class="step-context">
      <div>
        <span>${stepLabels[state.step]}</span>
        <strong>${title}</strong>
      </div>
      ${state.step >= 5 ? `
        <div>
          <span>Total estimado</span>
          <strong>${money(calc.total)}</strong>
        </div>
      ` : `
        <div>
          <span>Estado</span>
          <strong>En proceso</strong>
        </div>
      `}
    </div>
  `;
}

function workVisual(src, title, caption) {
  return `
    <figure class="work-visual">
      <img src="${src}" alt="${title}">
      <figcaption>
        <strong>${title}</strong>
        <span>${caption}</span>
      </figcaption>
    </figure>
  `;
}

function stepClient() {
  return `
    <div class="card">
      ${workVisual('/assets/emc-uniforme-interior.png', 'Servicio profesional EMC', 'Pintores con playera azul, logo amarillo y gorra trabajando con protección y control de calidad.')}
      <h2>Primero tus datos</h2>
      <p class="muted">Con esto EMC puede mandarte la cotización y preguntarte lo que falte. Sirve para casa, local, negocio o empresa.</p>
      <div class="form-grid">
        ${input('client.name', 'Tu nombre', 'text', 'required autocomplete="name"')}
        ${input('client.company', 'Casa, negocio o empresa (opcional)', 'text', 'autocomplete="organization" placeholder="Ej. casa, local, restaurante, clínica, escuela..."')}
        ${input('client.phone', 'Tu WhatsApp', 'tel', 'required inputmode="tel" autocomplete="tel"')}
        ${input('client.email', 'Correo si tienes', 'email')}
        ${input('client.address', 'Colonia o zona', 'text')}
        ${select('client.city', 'Ciudad o municipio', ['Villahermosa / Centro', 'Cunduacán', 'Jalpa de Méndez', 'Nacajuca', 'Otro'])}
        ${select('client.propertyType', 'Qué es', ['Casa', 'Oficina', 'Local', 'Restaurante', 'Clínica', 'Bodega', 'Escuela', 'Edificio', 'Otro'])}
        ${select('client.urgency', 'Cuándo lo necesitas', ['Urgente', 'Esta semana', 'Este mes', 'Estoy comparando precios'])}
      </div>
      <div class="service-router">
        <h3>Tipo de servicio</h3>
        <p>El cálculo automático de esta página es solo para pintura. Para otro trabajo, toca el servicio y te atiendo por WhatsApp.</p>
        ${serviceShortcutGrid()}
      </div>
      ${navActions()}
    </div>
  `;
}

function stepProject() {
  const p = state.quote.project;
  const access = autoAccess();
  const projectVisual = {
    Interior: {
      src: '/assets/emc-uniforme-interior.png',
      title: 'Trabajo interior',
      caption: 'Si no sabes los metros exactos, escribe un aproximado. EMC lo confirma contigo antes de trabajar.'
    },
    Exterior: {
      src: '/assets/emc-uniforme-exterior.png',
      title: 'Trabajo exterior',
      caption: 'Si no sabes altura o medidas exactas, escribe lo que recuerdes. EMC valida antes de agendar.'
    },
    'Interior y exterior': {
      src: '/assets/emc-uniforme-exterior.png',
      title: 'Trabajo interior y exterior',
      caption: 'Puedes poner medidas aproximadas. EMC ajusta contigo si hace falta.'
    }
  }[p.applicationType] || {
    src: '/assets/emc-uniforme-interior.png',
    title: 'Qué se va a pintar',
    caption: 'No tiene que quedar perfecto. EMC te ayuda a completar la información.'
  };
  return `
    <div class="card visual-card project-visual">
      ${workVisual(projectVisual.src, projectVisual.title, projectVisual.caption)}
      <div>
        <h2>Qué quieres pintar</h2>
        <p class="muted">Pon un aproximado. Si no sabes los metros exactos: cuarto 30, casa chica 100, casa grande 200.</p>
      </div>
      <div class="form-grid">
        ${select('project.applicationType', 'Dónde se pinta', ['Interior', 'Exterior', 'Interior y exterior'])}
        ${p.applicationType === 'Interior' ? input('project.interiorSquareMeters', 'm² aproximados por dentro', 'number', 'min="1" inputmode="decimal"') : ''}
        ${p.applicationType === 'Exterior' ? input('project.exteriorSquareMeters', 'm² aproximados por fuera', 'number', 'min="1" inputmode="decimal"') : ''}
        ${p.applicationType === 'Interior y exterior' ? `
          ${input('project.interiorSquareMeters', 'm² por dentro', 'number', 'min="0" inputmode="decimal"')}
          ${input('project.exteriorSquareMeters', 'm² por fuera', 'number', 'min="0" inputmode="decimal"')}
        ` : ''}
        ${input('project.floors', 'Cuántos pisos', 'number', 'min="1" inputmode="numeric"')}
        ${input('project.heightMeters', 'Altura si la sabes', 'number', 'min="1" step="0.1" inputmode="decimal"')}
      </div>
      <div class="risk-rule">
        <span>Equipo de acceso</span>
        <strong>${access.pending ? 'Pendiente de revisión' : access.scaffold ? 'Requiere revisión de acceso especial' : access.ladder ? 'Acceso con escalera o extensión' : 'Acceso normal'}</strong>
        <small>No te preocupes si no sabes esto. EMC lo confirma contigo antes de agendar.</small>
      </div>
      ${navActions()}
    </div>
  `;
}

function stepPhotos() {
  const aiConfigured = Boolean(state.aiStatus?.configured);
  return `
    <div class="card">
      ${workVisual('/assets/emc-uniforme-diagnostico.png', 'Fotos opcionales', 'Si puedes enviar fotos, ayudan mucho. Si no puedes, EMC te orienta por WhatsApp.')}
      <h2>Fotos si tienes</h2>
      <p class="muted">Si no tienes fotos, no pasa nada. Puedes continuar.</p>
      <div class="photo-help-choice">
        <div>
          <strong>Sí tengo fotos</strong>
          <span>Sube las que puedas.</span>
        </div>
        <div>
          <strong>No tengo fotos</strong>
          <span>EMC te las pide por WhatsApp si hacen falta.</span>
        </div>
      </div>
      <div class="photo-upload-panel">
        <div class="photo-upload-header">
          <div>
            <span>Si puedes, sube estas fotos</span>
            <strong>${state.quote.photos.length}/10 fotos cargadas</strong>
          </div>
          <small>Puedes continuar sin subirlas.</small>
        </div>
        <div class="photo-guide-grid">
          ${requiredPhotos.map((label, index) => photoInput(label, index)).join('')}
        </div>
        <label class="photo-extra-upload">Agregar más fotos si las tienes
          <input type="file" accept="image/*" multiple data-extra-photos>
        </label>
      </div>
      <div class="direct-advice-note">
        <strong>¿No sabes qué foto tomar?</strong>
        <span>No pasa nada. Presiona continuar y EMC te orienta por WhatsApp.</span>
      </div>
      ${photoAnalysisPanel()}
      ${navActions()}
    </div>
  `;
}

function photoAnalysisPanel() {
  if (!state.aiStatus?.configured && !state.photoAnalysis) {
    return `
      <div class="notice" style="margin-top:12px;">
        Puedes continuar sin fotos. Si las envías, EMC las revisará antes de confirmar precio y alcance.
      </div>
    `;
  }
  if (state.analyzingPhotos) {
    return '<div class="notice" style="margin-top:12px;">Analizando fotos automáticamente...</div>';
  }
  const analysis = state.photoAnalysis;
  if (!analysis) {
    return '<div class="notice" style="margin-top:12px;">Las fotos son apoyo, no examen. Si no puedes subirlas, EMC te pedirá lo necesario por WhatsApp.</div>';
  }
  const visibleMinimum = customerMinimumLevel();
  const level = visibleMinimum && levels[visibleMinimum] ? levels[visibleMinimum].label : 'No definido';
  const isAutomatic = Boolean(analysis.enabled);
  const title = isAutomatic ? 'Análisis visual IA' : 'Revisión visual EMC';
  const confidenceRow = isAutomatic
    ? `<div class="summary-line"><span>Confianza</span><strong>${Math.round(Number(analysis.confidence || 0) * 100)}%</strong></div>`
    : '';
  return `
    <div class="assistant-panel">
      <span>${title}</span>
      <strong>${analysis.summary || 'Análisis preliminar terminado.'}</strong>
      <div class="summary-line"><span>Calidad de fotos</span><strong>${analysis.photoQuality || '-'}</strong></div>
      <div class="summary-line"><span>Nivel mínimo recomendado</span><strong>${level}</strong></div>
      ${confidenceRow}
      <h3>Señales detectadas</h3>
      <ul class="clean-list compact">
        ${(analysis.signals || []).map(signal => `<li>${signal.type || 'señal'} · ${signal.severity || '-'}: ${signal.evidence || ''}</li>`).join('') || '<li>Sin señales visuales fuertes.</li>'}
      </ul>
      <h3>Alertas</h3>
      <ul class="clean-list compact">
        ${(analysis.alerts || []).map(item => `<li>${item}</li>`).join('') || '<li>Sin alertas visuales fuertes.</li>'}
      </ul>
    </div>
  `;
}

function photoInput(label, index) {
  const photo = state.quote.photos[index];
  return `
    <div class="photo-tile ${photo ? 'has-photo' : ''}">
      <label>
        <strong>${label}</strong>
        <span>${photo ? 'Foto cargada' : 'Tocar para elegir foto'}</span>
        <input type="file" accept="image/*" data-photo-index="${index}">
      </label>
      ${photo ? `<img src="${photo.dataUrl}" alt="${label}">` : ''}
    </div>
  `;
}

function stepRecommendation(calc) {
  const recommended = levels[calc.recommendedLevel];
  const recommendedRate = money(state.config.labor?.[calc.recommendedLevel] || recommended.price);
  const minimumText = calc.recommendedLevel === 'premium'
    ? 'El sistema recomienda mínimo Plus'
    : `El sistema recomienda mínimo ${recommended.label}`;
  return `
    <div class="card center-card visual-card recommendation-visual">
      ${workVisual('/assets/emc-uniforme-interior.png', 'Precio sugerido', 'EMC usa tus datos para darte una idea de precio antes de contactarte.')}
      <div class="success-mark small">✓</div>
      <h2>Precio aproximado</h2>
      <p class="muted">${minimumText}. EMC confirma contigo antes de cerrar precio y agenda.</p>
      <div class="recommendation-box">
        <span>Servicio sugerido</span>
        <strong>${recommended.label} · ${recommendedRate}/m²</strong>
        <p>${recommended.short}</p>
      </div>
      ${calc.recommendedLevel === 'premium' ? premiumRecommendationDetail() : ''}
      <button class="btn btn-ghost btn-soft-action" data-modal="recommendation" type="button">Por qué este precio</button>
      <p class="service-change-question">Qué quieres hacer</p>
      <div class="actions recommendation-actions">
        <button class="btn btn-primary btn-hero" data-action="accept-recommendation" type="button">
          <strong>Usar este precio</strong>
          <small>Seguir a pintura y envío</small>
        </button>
        <button class="btn btn-ghost" data-action="choose-service" type="button">
          <strong>Ver opciones</strong>
          <small>Más barato o más completo</small>
        </button>
      </div>
      ${state.showServiceOptions ? serviceChoicePanel(calc) : ''}
      <div class="actions single">
        <button class="btn btn-ghost" data-action="prev">Atrás</button>
      </div>
    </div>
  `;
}

function premiumRecommendationDetail() {
  return `
    <div class="premium-explain">
      <h3>Qué cubre Plus</h3>
      <p>Plus se recomienda cuando la superficie puede requerir recuperación, preparación profunda o mayor control de calidad antes de pintar. Está pensado para muros con señales de deterioro, humedad, desprendimiento, resanes importantes, sellador o acabados donde pintar encima podría provocar reclamos.</p>
      <ul class="clean-list compact">
        <li>Raspado donde sea necesario para retirar material suelto.</li>
        <li>Resane completo de zonas dañadas conforme al alcance confirmado.</li>
        <li>Sellador cuando la superficie lo requiera.</li>
        <li>Preparación integral antes de aplicar pintura.</li>
        <li>Protección detallada del área y revisión final EMC.</li>
      </ul>
    </div>
  `;
}

function serviceChoicePanel(calc) {
  return `
    <div class="service-choice-panel">
      <h3>Elige una opción</h3>
      <p class="muted">Puedes cambiar el precio sugerido. EMC te dirá por WhatsApp si conviene subir o bajar el servicio.</p>
      <div class="service-choice-grid">
        ${Object.entries(levels).map(([key, level]) => {
          const allowed = isLevelAllowed(key);
          return `
            <div class="service-choice-card ${key === calc.recommendedLevel ? 'recommended' : ''} ${allowed ? '' : 'limited'}" title="${level.when}">
              <span>${key === calc.recommendedLevel ? 'Sugerido' : 'Opción'}</span>
              <h4>${level.label}</h4>
              <strong>${money(state.config.labor[key])} / m²</strong>
              <p>${level.short}</p>
              <small>${level.scope}</small>
              ${allowed ? '' : '<small class="lock-note">Puede quedarse corto para este trabajo.</small>'}
              <button class="btn btn-ghost" data-service-detail="${key}" type="button">Ver qué incluye</button>
              <button class="btn btn-primary" data-select-service-level="${key}" type="button">Usar esta opción</button>
            </div>
          `;
        }).join('')}
      </div>
      <button class="btn btn-dark full-btn" data-action="accept-recommendation" type="button">Usar precio sugerido</button>
    </div>
  `;
}

function assistantPanel(assistant) {
  const questions = assistant.questions.length ? assistant.questions : ['No hay preguntas críticas pendientes con los datos actuales.'];
  const alerts = assistant.alerts.length ? assistant.alerts : ['No se detectaron alertas fuertes, sujeto a revisión de EMC.'];
  return `
    <div class="assistant-panel">
      <span>Asistente EMC</span>
      <strong>${assistant.summary}</strong>
      <h3>Preguntas útiles</h3>
      <ul class="clean-list compact">
        ${questions.map(item => `<li>${item}</li>`).join('')}
      </ul>
      <h3>Alertas técnicas</h3>
      <ul class="clean-list compact">
        ${alerts.map(item => `<li>${item}</li>`).join('')}
      </ul>
    </div>
  `;
}

function stepSupply(calc) {
  const q = state.quote;
  const paintDetails = paintMaterialDetails(calc);
  const sealerDetails = sealerMaterialDetails(calc);
  return `
    <div class="card visual-card supply-visual">
      ${workVisual('/assets/emc-uniforme-interior.png', 'Pintura y materiales', 'Puedes pedir que EMC incluya la pintura o comprarla por tu cuenta.')}
      <h2>¿Quién compra la pintura?</h2>
      <p class="muted">Elige la opción más fácil. EMC puede incluir pintura o tú puedes comprarla.</p>
      <div class="material-summary material-ledger" style="margin-top:16px;">
        <div>
          <span>${q.service.selectedLevel ? 'Nivel elegido' : 'Nivel recomendado'}</span>
          <strong>${levels[q.service.selectedLevel || calc.recommendedLevel].label}</strong>
          <small>${calc.coats} manos de pintura.</small>
        </div>
        <div>
          <span>Pintura estimada</span>
          <strong>${calc.liters.toFixed(1)} L</strong>
          <small>${paintDetails.buckets} para suministro EMC.</small>
          <small>${paintDetails.formula} · ${paintDetails.cost}</small>
        </div>
        <div>
          <span>Sellador estimado</span>
          <strong>${calc.sealerLiters ? `${calc.sealerLiters.toFixed(1)} L` : 'No requerido'}</strong>
          <small>${sealerDetails ? `${sealerDetails.buckets} para suministro EMC.` : 'Según nivel elegido y revisión visual.'}</small>
          ${sealerDetails ? `<small>${sealerDetails.formula} · ${sealerDetails.cost}</small>` : ''}
        </div>
      </div>
      <div class="supply-grid">
        <button class="supply-card ${q.service.paintSupply === 'emc' ? 'selected' : ''}" data-paint-supply="emc" type="button">
          <strong>Que EMC incluya la pintura</strong>
          <span>EMC calcula y compra.</span>
          <small class="supply-help">Más fácil para cotizar completo.</small>
        </button>
        <button class="supply-card ${q.service.paintSupply === 'cliente' ? 'selected' : ''}" data-client-supply-continue type="button">
          <strong>Yo compro la pintura</strong>
          <span>Continuar sin agregar pintura.</span>
          <small class="supply-help">EMC solo cotiza mano de obra y preparación.</small>
        </button>
      </div>
      ${q.service.paintSupply === 'emc' ? `
        <h3 style="margin-top:18px;">Opciones de pintura</h3>
        <div class="paint-catalog">
          ${state.config.paints.filter(p => p.active).map(paint => paintCard(paint)).join('')}
        </div>
        ${q.service.paintId ? `
          <div class="form-grid compact-config">
            <label>Cantidad de cubetas de pintura
              <input data-path="service.paintBucketsOverride" type="number" min="1" inputmode="numeric" value="${q.service.paintBucketsOverride || calc.buckets}">
            </label>
          </div>
        ` : ''}
        ${calc.sealerLiters ? `
          <h3 style="margin-top:18px;">Opciones de sellador</h3>
          <div class="paint-catalog sealer-catalog">
            ${(state.config.sealers || []).filter(s => s.active).map(sealer => sealerCard(sealer)).join('')}
          </div>
          ${q.service.sealerId ? `
            <div class="form-grid compact-config">
              <label>Cantidad de cubetas de sellador
                <input data-path="service.sealerBucketsOverride" type="number" min="1" inputmode="numeric" value="${q.service.sealerBucketsOverride || calc.sealerBuckets}">
              </label>
            </div>
          ` : ''}
        ` : '<div class="notice" style="margin-top:14px;">Este servicio no requiere sellador por defecto. EMC podrá recomendarlo si la revisión visual detecta una superficie que lo necesita.</div>'}
      ` : ''}
      <div class="quote-section supply-payment">
        <h3>Pago</h3>
        <div class="form-grid compact-config">
          <label>Factura
            <select data-path="service.invoice">
              <option value="false" ${q.service.invoice ? '' : 'selected'}>Sin factura</option>
              <option value="true" ${q.service.invoice ? 'selected' : ''}>Con factura + IVA</option>
            </select>
          </label>
        </div>
        <button class="field-button" data-modal="payments" type="button">${q.service.paymentMethod}</button>
        <div class="payment-preview" style="margin-top:12px;">${paymentPreview(calc)}</div>
      </div>
      ${navActions('Ver cotización')}
    </div>
  `;
}

function materialLineForLevel(level) {
  const estimate = materialEstimateForLevel(level);
  const sealerText = estimate.sealerLiters
    ? ` Sellador estimado ${estimate.sealerLiters.toFixed(1)} L (${estimate.sealerBuckets} cubeta${estimate.sealerBuckets > 1 ? 's' : ''} de ${estimate.sealerPresentation} L aprox.).`
    : ' No requiere sellador por defecto.';
  return `${estimate.coats} manos · Pintura estimada ${estimate.paintLiters.toFixed(1)} L (${estimate.paintBuckets} cubeta${estimate.paintBuckets > 1 ? 's' : ''} de ${estimate.paintPresentation} L aprox.).${sealerText}`;
}

function materialRecommendation(calc) {
  return `
    <div class="material-summary">
      <div>
        <span>${state.quote.service.selectedLevel ? 'Nivel elegido' : 'Nivel recomendado'}</span>
        <strong>${levels[state.quote.service.selectedLevel || calc.recommendedLevel].label}</strong>
        <small>${calc.coats} manos de pintura</small>
      </div>
      <div>
        <span>Pintura necesaria</span>
        <strong>${calc.liters.toFixed(1)} L</strong>
        <small>${calc.buckets} cubeta${calc.buckets !== 1 ? 's' : ''} de ${calc.paintPresentation} L aprox.</small>
        <small>Área total · ${calc.coats} manos · rendimiento ${calc.paintYield} m²/L</small>
      </div>
      <div>
        <span>Sellador</span>
        <strong>${calc.sealerLiters ? `${calc.sealerLiters.toFixed(1)} L` : 'No requerido'}</strong>
        <small>${calc.sealerLiters ? `${calc.sealerBuckets} cubeta${calc.sealerBuckets !== 1 ? 's' : ''} de ${calc.sealerPresentation} L aprox.${calc.sealer ? '' : ' · Selecciona sellador para cotizarlo'}` : 'Puede omitirse si la superficie está sana.'}</small>
      </div>
    </div>
    ${calc.sealerLiters ? `
      <h3 style="margin-top:14px;">Opciones de sellador</h3>
      <div class="paint-catalog sealer-catalog">
        ${(state.config.sealers || []).filter(s => s.active).map(sealer => sealerCard(sealer)).join('')}
      </div>
    ` : '<p class="muted">Si EMC detecta una superficie porosa o con riesgo técnico, podrá recomendar sellador antes de iniciar.</p>'}
  `;
}

function sealerCard(sealer) {
  const selected = state.quote.service.sealerId === sealer.id;
  const visual = sealer.image
    ? `<img class="paint-photo" src="${sealer.image}" alt="${sealer.brand} ${sealer.name}">`
    : `<span class="paint-can premium"><b>${sealer.brand}</b><small>SELLADOR</small></span>`;
  return `
    <button class="paint-card ${selected ? 'selected' : ''}" data-pick-sealer="${sealer.id}" type="button">
      <span class="paint-visual">${visual}</span>
      <span class="paint-info">
        <span class="paint-brand">${sealer.brand}</span>
        <strong>${sealer.name}</strong>
        <span class="paint-price">${money(sealer.price)}</span>
        <small>${sealer.category} · ${sealer.presentation} L · Rinde aprox. ${sealer.yieldPerLiter} m²/L</small>
        <small>${sealer.source} · ${sealer.updatedAt}</small>
        <span class="paint-select">${selected ? 'Seleccionado' : 'Seleccionar'}</span>
      </span>
    </button>
  `;
}

function paintCard(paint) {
  const selected = state.quote.service.paintId === paint.id;
  const source = paint.source?.toLowerCase().includes('carga manual') ? 'Referencia de costo' : paint.source;
  const visual = paint.image
    ? `<img class="paint-photo" src="${paint.image}" alt="${paint.brand} ${paint.category}">`
    : `<span class="paint-can ${paint.category.toLowerCase()}"><b>${paint.brand}</b><small>${paint.category}</small></span>`;
  return `
    <button class="paint-card ${selected ? 'selected' : ''}" data-pick-paint="${paint.id}" type="button">
      <span class="paint-visual">${visual}</span>
      <span class="paint-info">
        <span class="paint-brand">${paint.brand}</span>
        <strong>${paint.category}</strong>
        <span class="paint-price">${money(paint.price)}</span>
        <small>Cubeta ${paint.presentation} L · Rinde aprox. ${paint.yieldPerLiter} m²/L a 2 manos</small>
        <small>${source} · ${paint.updatedAt}</small>
        <span class="paint-select">${selected ? 'Seleccionada' : 'Seleccionar'}</span>
      </span>
    </button>
  `;
}

function crewInline(calc) {
  return `
    <div class="crew-grid">
      ${[1, 2, 3, 4].map(count => {
        const estimate = estimateDays(calc.level, count);
        return `
          <button class="crew-card ${state.quote.service.painters === count ? 'selected' : ''}" data-pick-crew="${count}" type="button">
            <strong>${count}</strong>
            <span>persona${count > 1 ? 's' : ''}</span>
            <small>${estimate.days} día(s)</small>
          </button>
        `;
      }).join('')}
    </div>
    <div class="notice" style="margin-top:12px;">Con ${state.quote.service.painters} persona(s), el avance de referencia es de ${Math.round(calc.dailyAdvance)} m² por jornada de 8 horas y el servicio tomaría aproximadamente ${calc.estimatedDays} día(s), sujeto a revisión final EMC.</div>
  `;
}

function paymentPreview(calc) {
  const q = state.quote;
  const p = state.config.payments;
  if (q.service.invoice) {
    return `
      <strong>Con factura</strong>
      <span>Pago único permitido: transferencia bancaria / SPEI.</span>
      <small>Banco: ${p.bank} · Titular: ${p.accountHolder} · CLABE: ${p.clabe}</small>
      <small>Monto con IVA: ${money(calc.total)}</small>
    `;
  }
  if (q.service.paymentMethod === 'DAI Bitso a Bitso') {
    if (!daiPaymentAvailable()) {
      return `
        <strong>Sin factura · DAI no disponible</strong>
        <span>El pago en DAI Bitso a Bitso está desactivado o incompleto en este momento.</span>
        <small>Total a pagar: ${money(calc.total)}</small>
      `;
    }
    return `
      <strong>Sin factura · DAI Bitso a Bitso</strong>
      <span>Solo DAI por transferencia interna Bitso a Bitso. No XRP, no USDT, no wallets externas.</span>
      <small>Total: ${money(calc.total)} · Equivalente: ${calc.dai.toFixed(2)} DAI</small>
      <small>Cuenta Bitso: ${p.bitsoUser} · Vigencia: ${p.daiValidityMinutes} min.</small>
    `;
  }
  return `
    <strong>Sin factura · Efectivo</strong>
    <span>Disponible para servicios sin factura. EMC confirma condiciones antes del inicio.</span>
    <small>Total a pagar: ${money(calc.total)}</small>
  `;
}

function stepSummary(calc) {
  return `
    <div class="quote-document">
      ${summary(calc)}
      ${leadCaptureBox(calc)}
      ${clientQuoteProcess(calc)}
      <div class="client-check">
        <strong>Antes de empezar</strong>
        <span>EMC revisa tus datos y te confirma por WhatsApp.</span>
        <span>Si las medidas cambian mucho, el precio puede ajustarse antes de iniciar.</span>
      </div>
      <div class="quote-validity">Vigencia: 15 días naturales. Es una cotización preliminar; EMC confirma contigo medidas, fotos si hacen falta y condiciones antes de iniciar.</div>
      <div class="quote-section feedback-section">
        <h3>Mensaje para EMC</h3>
        <p class="muted">Escribe cualquier duda o detalle. Si no sabes qué poner, déjalo vacío.</p>
        <label>Duda o comentario
          <textarea data-path="observations" placeholder="Ej. No sé los metros, quiero que me orienten por WhatsApp, no pude subir fotos, quiero visita o confirmación...">${state.quote.observations || ''}</textarea>
        </label>
      </div>
      <div class="actions quote-actions">
        <button class="btn btn-primary btn-hero" data-action="accept">
          <strong>Quiero mi cotización profesional</strong>
          <small>Enviar solicitud a EMC Pintura</small>
        </button>
        ${whatsappUrl(leadWhatsappText(calc)) ? `
          <a class="btn btn-dark" href="${whatsappUrl(leadWhatsappText(calc))}" target="_blank" rel="noopener">
            <strong>Enviar por WhatsApp</strong>
            <small>Hablar ahora con EMC</small>
          </a>
        ` : ''}
        <button class="btn btn-ghost" data-action="print-pdf">
          <strong>Guardar PDF</strong>
          <small>Descargar o imprimir cotización</small>
        </button>
        <button class="btn btn-ghost" data-action="prev">
          <strong>Corregir datos</strong>
          <small>Volver al paso anterior</small>
        </button>
      </div>
      <div class="actions single">
        <button class="btn btn-ghost btn-soft-action" data-action="home">Salir sin enviar</button>
      </div>
    </div>
  `;
}

function leadCaptureBox(calc) {
  return `
    <div class="quote-section lead-box">
      <span>Tu proyecto cuesta aproximadamente</span>
      <strong>${money(calc.total)}</strong>
      <div class="lead-includes">
        <span>Incluye mano de obra</span>
        <span>Incluye preparación según nivel</span>
        <span>${state.quote.service.paintSupply === 'emc' ? 'Incluye materiales seleccionados' : 'Materiales a cargo del cliente'}</span>
      </div>
      <p>¿Quieres una cotización profesional en PDF y seguimiento por WhatsApp? Envia la solicitud y EMC revisa medidas, fotos y agenda.</p>
    </div>
  `;
}

function clientQuoteProcess(calc) {
  const q = state.quote;
  return `
    <div class="quote-section quote-process">
      <h3>Proceso EMC aplicado</h3>
      <div class="process-ledger">
        <div>
          <span>1. Datos básicos</span>
          <strong>${projectSquareMeters()} m² · ${q.project.applicationType}</strong>
          <small>Información inicial para orientar al cliente.</small>
        </div>
        <div>
          <span>2. Revisión EMC</span>
          <strong>${q.photos.length} foto${q.photos.length !== 1 ? 's' : ''}</strong>
          <small>Si faltan fotos o medidas, EMC las pide por WhatsApp.</small>
        </div>
        <div>
          <span>3. Servicio recomendado</span>
          <strong>${levels[calc.recommendedLevel].label}</strong>
          <small>La persona recibe un estimado claro antes de decidir.</small>
        </div>
        <div>
          <span>4. Cotización preliminar</span>
          <strong>${money(calc.total)}</strong>
          <small>EMC confirma alcance y condiciones antes de iniciar.</small>
        </div>
      </div>
    </div>
  `;
}

function summary(calc) {
  const q = state.quote;
  const m2 = projectSquareMeters();
  const paintDetails = paintMaterialDetails(calc);
  const sealerDetails = sealerMaterialDetails(calc);
  const areaDetails = q.project.applicationType === 'Interior y exterior'
    ? `
      <div class="summary-line"><span>m² interiores</span><strong>${q.project.interiorSquareMeters || 0} m²</strong></div>
      <div class="summary-line"><span>m² exteriores</span><strong>${q.project.exteriorSquareMeters || 0} m²</strong></div>
    `
    : '';
  const accessText = calc.scaffoldRequired
    ? 'Andamio / escalera larga'
    : calc.ladder
      ? 'Escalera o extensión'
      : 'Acceso normal';
  const paintText = q.service.paintSupply === 'cliente'
    ? 'Cliente suministra pintura'
    : (calc.paint ? `${calc.paint.brand} ${calc.paint.category}` : 'Pendiente de seleccionar');
  const sealerText = calc.sealerLiters
    ? (calc.sealer ? `${calc.sealer.brand} ${calc.sealer.name}` : 'Pendiente de seleccionar')
    : 'No requerido';
  const scopeNote = isBelowMinimum(calc.level)
    ? `<div class="notice danger-note">Alcance limitado: la recomendación mínima del sistema era ${levels[calc.recommendedLevel].label}, pero el cliente eligió ${levels[calc.level].label} por presupuesto.</div>`
    : '';
  const paintCoatFactor = calc.coats / Math.max(1, calc.paintYieldBaseCoats);
  const paintFormula = paintCoatFactor === 1
    ? paintDetails.formula
    : `${m2} m² / ${calc.paintYield} m²/L × ${paintCoatFactor.toFixed(2)} ajuste por ${calc.coats} manos = ${calc.liters.toFixed(1)} L`;
  return `
    <div class="quote-header">
      <img src="/assets/emc-logo.jpg" alt="EMC Pintura">
      <div>
        <span>Cotización de servicio</span>
        <strong>EMC Servicios y Suministros · División Pintura</strong>
        <small>Fecha: ${today()} · Vigencia 15 días</small>
      </div>
    </div>
    <div class="quote-total-hero">
      <span>Tu proyecto cuesta aproximadamente</span>
      <strong>${money(calc.total)}</strong>
      <small>${q.service.invoice ? 'Incluye IVA 16%' : 'Sin factura'}</small>
    </div>
    <div class="quote-kpis">
      <div><span>Cliente</span><strong>${q.client.name || 'Pendiente'}</strong></div>
      <div><span>Servicio solicitado</span><strong>${q.client.serviceNeed || 'Pintura'}</strong></div>
      <div><span>Urgencia</span><strong>${q.client.urgency || 'Pendiente'}</strong></div>
      <div><span>Área</span><strong>${m2} m²</strong></div>
      <div><span>Tiempo</span><strong>${calc.estimatedDays} día(s)</strong></div>
    </div>
    <div class="quote-layout">
      <div class="quote-section">
        <h3>Datos del proyecto</h3>
        <div class="summary-line"><span>Casa/negocio/empresa</span><strong>${q.client.company || 'Pendiente'}</strong></div>
        <div class="summary-line"><span>Teléfono</span><strong>${q.client.phone || 'Pendiente'}</strong></div>
        <div class="summary-line"><span>Tipo de cliente</span><strong>${q.client.propertyType || 'Pendiente'}</strong></div>
        <div class="summary-line"><span>Servicio solicitado</span><strong>${q.client.serviceNeed || 'Pintura'}</strong></div>
        <div class="summary-line"><span>Urgencia</span><strong>${q.client.urgency || 'Pendiente'}</strong></div>
        <div class="summary-line"><span>Dirección</span><strong>${q.client.address || 'Pendiente'}</strong></div>
        <div class="summary-line"><span>Ciudad</span><strong>${q.client.city || 'Pendiente'}</strong></div>
        <div class="summary-line"><span>Altura</span><strong>${q.project.heightMeters} m</strong></div>
        <div class="summary-line"><span>Aplicación</span><strong>${q.project.applicationType}</strong></div>
        ${areaDetails}
        <div class="summary-line"><span>Equipo de acceso</span><strong>${accessText}</strong></div>
      </div>
      <div class="quote-section">
        <h3>Servicio incluido</h3>
        <div class="summary-line"><span>Recomendado</span><strong>${levels[calc.recommendedLevel].label}</strong></div>
        <div class="summary-line"><span>Elegido</span><strong>${levels[calc.level].label}</strong></div>
        ${scopeNote}
        <p class="quote-scope">${levels[calc.level].scope}</p>
        <div class="quote-chips">
          ${levels[calc.level].includes.map(item => `<span>${item}</span>`).join('')}
        </div>
      </div>
    </div>
    <div class="quote-section">
      <h3>Materiales y alcance</h3>
      <div class="summary-line"><span>Pintura</span><strong>${paintText}</strong></div>
      <div class="summary-line"><span>Sellador</span><strong>${sealerText}</strong></div>
      <div class="summary-line"><span>Rendimiento pintura</span><strong>${calc.paintYield} m²/L a ${calc.paintYieldBaseCoats} manos</strong></div>
      <div class="quote-note"><strong>Cálculo de pintura:</strong> ${paintFormula}</div>
      <div class="summary-line"><span>Pintura estimada</span><strong>${calc.liters.toFixed(1)} L · ${paintDetails.buckets}</strong></div>
      ${sealerDetails ? `<div class="quote-note"><strong>Cálculo de sellador:</strong> ${sealerDetails.formula}</div>` : ''}
      <div class="summary-line"><span>Sellador estimado</span><strong>${sealerDetails ? `${calc.sealerLiters.toFixed(1)} L · ${sealerDetails.buckets}` : 'No requerido'}</strong></div>
    </div>
    ${quoteCostBreakdown(calc)}
    <div class="quote-section">
      <h3>Pago</h3>
      <div class="summary-line"><span>Forma de pago</span><strong>${q.service.paymentMethod}</strong></div>
      <div class="summary-line"><span>Factura</span><strong>${q.service.invoice ? 'Sí, incluye IVA' : 'No solicitada'}</strong></div>
      ${q.service.invoice ? bankInfo(calc) : cryptoInfo(calc)}
    </div>
  `;
}

function quoteCostBreakdown(calc) {
  const q = state.quote;
  const ivaLabel = q.service.invoice ? `IVA ${state.config.adjustments.ivaPct}%` : 'IVA';
  const m2 = projectSquareMeters();
  const serviceTotal = Number(calc.serviceSubtotalWithoutPaint || 0);
  const scaffoldCost = Number(calc.accessEquipmentCost || calc.scaffold || calc.singleAdditionalAmount || 0);
  const paintToSupply = Number(calc.paintCost || 0) + Number(calc.sealerCost || 0);
  const paintSupplyText = q.service.paintSupply === 'cliente'
    ? 'No agregado: pintura proporcionada por cliente'
    : `${calc.buckets} cubeta${calc.buckets !== 1 ? 's' : ''} de ${calc.paintPresentation} L (${calc.liters.toFixed(1)} L estimados)${calc.sealerCost ? ` + ${calc.sealerBuckets} cubeta${calc.sealerBuckets !== 1 ? 's' : ''} de sellador de ${calc.sealerPresentation} L` : ''}`;
  return `
    <div class="quote-section cost-section">
      <h3>Resumen de costos</h3>
      <div class="cost-table">
        <div class="cost-row header"><span>Concepto</span><strong>Importe</strong></div>
        <div class="cost-row"><span>Servicio ${levels[calc.level].label} (${m2} m² × ${money(calc.saleRate)}/m²)</span><strong>${money(serviceTotal)}</strong></div>
        <div class="cost-row"><span>Pintura a suministrar (${paintSupplyText})</span><strong>${money(paintToSupply)}</strong></div>
        ${scaffoldCost ? `<div class="cost-row"><span>Andamio / acceso especial requerido</span><strong>${money(scaffoldCost)}</strong></div>` : ''}
        <div class="cost-row subtotal"><span>Subtotal</span><strong>${money(calc.subtotal)}</strong></div>
        <div class="cost-row"><span>${ivaLabel}</span><strong>${q.service.invoice ? money(calc.iva) : 'No agregado'}</strong></div>
        <div class="cost-row total-row"><span>Total ${q.service.invoice ? 'con IVA' : 'sin IVA'}</span><strong>${money(calc.total)}</strong></div>
      </div>
      <p class="quote-note">El precio del servicio incluye operación EMC, transporte, herramientas, supervisión básica y gestión de garantía. Pintura y sellador se cotizan por separado cuando EMC los suministra.</p>
    </div>
  `;
}

function bankInfo(calc) {
  const p = state.config.payments;
  return `
    <div class="summary-line"><span>Banco</span><strong>${p.bank}</strong></div>
    <div class="summary-line"><span>Titular</span><strong>${p.accountHolder}</strong></div>
    <div class="summary-line"><span>CLABE</span><strong>${p.clabe}</strong></div>
    <div class="summary-line"><span>Monto con IVA</span><strong>${money(calc.total)}</strong></div>
  `;
}

function cryptoInfo(calc) {
  const p = state.config.payments;
  if (state.quote.service.paymentMethod !== 'DAI Bitso a Bitso' || !daiPaymentAvailable()) return '';
  return `
    <div class="summary-line"><span>Total MXN</span><strong>${money(calc.total)}</strong></div>
    <div class="summary-line"><span>Equivalente DAI</span><strong>${calc.dai.toFixed(2)} DAI</strong></div>
    <div class="summary-line"><span>Cuenta Bitso</span><strong>${p.bitsoUser}</strong></div>
    <div class="summary-line"><span>Vigencia del cálculo</span><strong>${p.daiValidityMinutes} minutos</strong></div>
  `;
}

function navActions(nextLabel = 'Continuar') {
  return `
    <div class="actions">
      <button class="btn btn-ghost" data-action="prev">Atrás</button>
      <button class="btn btn-primary" data-action="next">
        <strong>${nextLabel}</strong>
        <small>Ir al siguiente paso</small>
      </button>
    </div>
  `;
}

function modal() {
  if (!state.modal) return '';
  return `
    <div class="modal-backdrop" data-action="close-modal">
      <div class="modal-sheet" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
        <button class="modal-close" data-action="close-modal">×</button>
        ${modalContent()}
      </div>
    </div>
  `;
}

function modalContent() {
  if (state.modal === 'levels') return levelsModal();
  if (state.modal === 'recommendation') return recommendationModal();
  if (state.modal?.startsWith('service-')) return serviceDetailModal(state.modal.replace('service-', ''));
  if (state.modal === 'paints') return paintsModal();
  if (state.modal === 'payments') return paymentsModal();
  if (state.modal === 'crew') return crewModal();
  return '';
}

function serviceDetailModal(key) {
  const level = levels[key] || levels.basico;
  const needsAccess = autoAccess();
  return `
    <h2>${level.label}: ${level.short}</h2>
    <p class="muted">${level.when}</p>
    <h3>Qué incluye</h3>
    <ul class="clean-list">${level.includes.map(item => `<li>${item}</li>`).join('')}</ul>
    <h3>Alcance operativo</h3>
    <p class="quote-scope">${level.scope}</p>
    <h3>Acceso y equipo</h3>
    <p class="quote-scope">${needsAccess.scaffold ? 'Por altura y exterior, EMC revisará el acceso antes de confirmar el inicio.' : needsAccess.ladder ? 'Por altura, EMC considera escalera o extensión dentro de su operación.' : 'Con los datos actuales se considera acceso normal.'}</p>
    <h3>Tratamientos</h3>
    <p class="quote-scope">Si la superficie requiere mayor preparación, EMC lo integra dentro del nivel de servicio o en un cargo especial único cuando aplique.</p>
  `;
}

function recommendationModal() {
  const calc = calculate();
  const recommended = levels[calc.recommendedLevel];
  const recommendedRate = money(state.config.labor?.[calc.recommendedLevel] || recommended.price);
  const title = calc.recommendedLevel === 'premium'
    ? 'Por qué el sistema recomienda mínimo Plus'
    : `Por qué EMC recomienda mínimo ${recommended.label}`;
  return `
    <h2>${title}</h2>
    <p class="muted">La recomendación combina análisis visual de fotos, condiciones de acceso, altura y tipo de aplicación. EMC aún confirmará el alcance antes de agendar.</p>
    <div class="recommendation-box">
      <span>Nivel mínimo recomendado</span>
      <strong>${recommended.label} · ${recommendedRate}/m²</strong>
      <p>${recommended.short}</p>
    </div>
    <h3>Señales usadas</h3>
    <ul class="clean-list">
      ${calc.reasons.map(reason => `<li>${reason}</li>`).join('')}
    </ul>
    <h3>Alertas técnicas</h3>
    <ul class="clean-list compact">
      ${(calc.assistant.alerts || []).map(item => `<li>${item}</li>`).join('') || '<li>Sin alertas fuertes.</li>'}
    </ul>
    <h3>Qué significa el nivel</h3>
    <p class="quote-scope">${recommended.scope}</p>
    ${calc.recommendedLevel === 'premium' ? premiumRecommendationDetail() : ''}
  `;
}

function levelsModal() {
  return `
    <h2>Niveles de servicio</h2>
    <p class="muted">Elige según el estado real de la superficie. Esta comparación está escrita para que cualquier persona entienda qué paga, qué recibe y por qué cambia el precio.</p>
    ${Object.entries(levels).map(([key, level]) => {
      const allowed = isLevelAllowed(key);
      return `
      <button class="select-card ${state.quote.service.selectedLevel === key ? 'selected' : ''} ${allowed ? '' : 'limited'}" data-pick-level="${key}">
        <strong>${level.label} · ${money(state.config.labor[key])} / m²</strong>
        <span>${level.ideal || level.when}</span>
        <small>${level.scope}</small>
        <small><b>Incluye:</b> ${level.includes.join(', ')}.</small>
        <small><b>No incluye:</b> ${(level.excludes || []).join(', ')}.</small>
        <small>${levelExplanation(key)}</small>
        ${allowed ? '' : '<small>Alcance limitado: el análisis visual recomienda un nivel superior para corrección completa.</small>'}
      </button>
    `;
    }).join('')}
  `;
}

function levelExplanation(key) {
  const explanations = {
    basico: 'En palabras simples: se usa cuando la pared está sana. No es para corregir daños fuertes. Sirve para renovar color y dejar limpio, pero no incluye tratamientos profundos.',
    medio: 'En palabras simples: se usa cuando la pared necesita preparación real antes de pintar. Incluye trabajos para que la pintura agarre mejor y el resultado dure más que una aplicación sencilla.',
    premium: 'En palabras simples: se usa cuando hay daño serio o se quiere un acabado más resistente. Es el servicio más completo porque prepara, trata, sella y pinta con más cuidado técnico.'
  };
  return explanations[key];
}

function paintsModal() {
  return `
    <h2>Marcas, tipos y precios</h2>
    <p class="muted">BEREL se usa como referencia principal. EMC confirmará disponibilidad y precio antes de agendar.</p>
    ${state.config.paints.filter(paint => paint.active).map(paint => `
      <button class="select-card ${state.quote.service.paintId === paint.id ? 'selected' : ''}" data-pick-paint="${paint.id}">
        <strong>${paint.brand} · ${paint.category}</strong>
        <span>${money(paint.price)} · Cubeta ${paint.presentation} L</span>
        <small>Rendimiento: ${paint.yieldPerLiter} m²/L a 2 manos · ${paint.source?.toLowerCase().includes('carga manual') ? 'Referencia de costo' : `Fuente: ${paint.source}`} · Actualizado: ${paint.updatedAt}</small>
      </button>
    `).join('')}
  `;
}

function paymentsModal() {
  const q = state.quote;
  const p = state.config.payments;
  const calc = calculate();
  const daiAvailable = daiPaymentAvailable();
  return `
    <h2>Forma de pago</h2>
    <p class="muted">La forma de pago depende de si requieres factura.</p>
    ${q.service.invoice ? `
      <button class="select-card selected" data-pick-payment="Transferencia bancaria / SPEI">
        <strong>Transferencia bancaria / SPEI</strong>
        <span>Disponible cuando requiere factura. Se agrega IVA del ${state.config.adjustments.ivaPct}%.</span>
        <small>Banco: ${p.bank}</small>
        <small>Titular: ${p.accountHolder}</small>
        <small>CLABE: ${p.clabe}</small>
        <small>Monto con IVA: ${money(calc.total)}</small>
      </button>
    ` : `
      <button class="select-card ${q.service.paymentMethod === 'Efectivo' ? 'selected' : ''}" data-pick-payment="Efectivo">
        <strong>Efectivo</strong>
        <span>Disponible cuando no requiere factura.</span>
        <small>Total: ${money(calc.total)}</small>
        <small>EMC confirmará condiciones operativas antes de iniciar.</small>
      </button>
      <button class="select-card ${q.service.paymentMethod === 'DAI Bitso a Bitso' ? 'selected' : ''} ${daiAvailable ? '' : 'disabled'}" ${daiAvailable ? 'data-pick-payment="DAI Bitso a Bitso"' : ''}>
        <strong>DAI Bitso a Bitso</strong>
        <span>${daiAvailable ? 'Solo DAI mediante transferencia interna Bitso a Bitso. No XRP, no USDT, no wallets externas.' : 'No disponible por ahora. Selecciona efectivo o solicita a EMC otra forma de pago.'}</span>
        ${daiAvailable ? `
          <small>Total MXN: ${money(calc.total)} · Equivalente: ${calc.dai.toFixed(2)} DAI</small>
          <small>Cuenta Bitso: ${p.bitsoUser}</small>
          <small>Vigencia del cálculo: ${p.daiValidityMinutes} minutos.</small>
        ` : '<small>Selecciona efectivo o solicita a EMC activar DAI.</small>'}
      </button>
    `}
  `;
}

function crewModal() {
  const level = state.quote.service.selectedLevel || scoreDiagnostic();
  return `
    <h2>Personal y tiempo estimado</h2>
    <p class="muted">El avance diario se calcula internamente con un rendimiento conservador para no prometer tiempos irreales.</p>
    ${[1, 2, 3, 4, 5, 6].map(count => {
      const estimate = estimateDays(level, count);
      return `
        <button class="select-card ${state.quote.service.painters === count ? 'selected' : ''}" data-pick-crew="${count}">
          <strong>${count} persona(s)</strong>
          <span>${estimate.days} día(s) aproximados para ${state.quote.project.squareMeters} m²</span>
          <small>Avance de referencia: ${Math.round(estimate.dailyAdvance)} m² por día.</small>
        </button>
      `;
    }).join('')}
  `;
}

function howItWorks() {
  return `
    ${topbar('Cómo funciona')}
    <section class="screen">
      <div class="card">
        <h2>Elige qué quieres conocer</h2>
        <div class="info-grid">
          <button class="info-card" data-info="service">
            <strong>Cómo funciona el servicio</strong>
            <span>Cotización, revisión técnica, alcances y pago.</span>
          </button>
          <button class="info-card" data-info="collab">
            <strong>Cómo colaborar con nosotros</strong>
            <span>Registro, participación por servicio y responsabilidades.</span>
          </button>
        </div>
      </div>
      <div class="card" id="info-panel">
        ${serviceInfo()}
      </div>
    </section>
  `;
}

function serviceInfo() {
  return `
    <h2>Servicio de pintura</h2>
    <h3>Cómo funciona</h3>
    <div class="summary-line"><span>1</span><strong>Dejas nombre y WhatsApp</strong></div>
    <div class="summary-line"><span>2</span><strong>Compartes medidas aproximadas si las sabes</strong></div>
    <div class="summary-line"><span>3</span><strong>Subes fotos solo si puedes</strong></div>
    <div class="summary-line"><span>4</span><strong>EMC te orienta y confirma por WhatsApp</strong></div>
    <div class="summary-line"><span>5</span><strong>Antes de trabajar, se acuerda precio y alcance</strong></div>
    <h3>Alcances</h3>
    <p class="muted">La cotización inicia con datos sencillos. Si algo falta o no está claro, EMC lo revisa contigo antes de confirmar.</p>
    <h3>Compromisos EMC</h3>
    <p class="muted">Orientar al cliente, revisar lo enviado, pedir lo que falte y confirmar condiciones antes de iniciar.</p>
    <h3>Lo que pedimos al cliente</h3>
    <p class="muted">Compartir lo que sepa con honestidad. No tiene que ser experto ni mandar información perfecta.</p>
  `;
}

function collaboratorInfo() {
  return `
    <h2>Colaboradores EMC</h2>
    <div class="senior-priority compact">
      <strong>50 años o más: tu experiencia tiene prioridad</strong>
      <span>EMC valora a personas con oficio, cumplimiento y trayectoria. Cuando exista una oportunidad compatible, revisaremos primero perfiles con experiencia comprobable.</span>
    </div>
    <div class="notice strong-notice">Al inscribirte, EMC te pedirá tu edad para aplicar la revisión preferente 50+.</div>
    <h3>Cómo funciona</h3>
    <div class="summary-line"><span>1</span><strong>Registras datos, edad, experiencia y zona</strong></div>
    <div class="summary-line"><span>2</span><strong>EMC revisa perfiles para oportunidades por evento</strong></div>
    <div class="summary-line"><span>3</span><strong>Quien cumple y entrega calidad aumenta su prioridad</strong></div>
    <div class="notice">No es empleo fijo ni nómina. Es una inscripción para posibles ingresos temporales o por evento cuando exista trabajo compatible.</div>
    <div class="actions single">
      <button class="btn btn-primary" data-action="work" type="button">Inscribirme como colaborador</button>
    </div>
  `;
}

function workForm() {
  const baseRate = 20;
  return `
    ${topbar('Colaboradores')}
    <section class="screen">
      <div class="actions back-row">
        <button class="btn btn-ghost" data-action="home" type="button">Atrás</button>
      </div>
      <div class="card network-hero">
        <img class="network-hero-photo" src="/assets/emc-red-apoyo-pintor.png" alt="Persona recibiendo apoyo de la Red EMC">
        <span class="eyebrow">Colaboradores EMC</span>
        <h2>Cuando hay trabajo, llamamos primero a nuestra gente</h2>
        <p class="muted">Regístrate si buscas ingresos temporales o por evento en servicios generales. Pintura será una de las primeras áreas de referencia EMC.</p>
        <div class="senior-priority hero-priority">
          <strong>¿Tienes 50 años o más?</strong>
          <span>Tu experiencia tendrá revisión preferente para oportunidades compatibles.</span>
        </div>
        <div class="network-pill-grid">
          <span>Experiencia</span>
          <span>Cumplimiento</span>
          <span>Trabajo limpio</span>
        </div>
      </div>
      <div class="card">
        <h2>Registro de colaboradores</h2>
        <div class="senior-priority form-priority">
          <strong>Personas de 50 años o más tendrán revisión preferente</strong>
          <span>EMC busca oficio, seriedad y experiencia. No prometemos empleo fijo; consideramos perfiles cuando exista un servicio compatible.</span>
        </div>
        <div class="form-grid">
          <div class="notice strong-notice">Área: Servicios generales · Referencia inicial: pintura</div>
          <div class="notice" id="collab-rate">Ingreso por evento: referencia inicial desde ${money(baseRate)} por m² en pintura. Puede variar por experiencia, calidad, puntualidad y tipo de servicio.</div>
          <label class="check-row"><input id="collab-accept" type="checkbox"> Entiendo que es registro para posibles ingresos temporales o por evento, no empleo fijo</label>
          <label>Nombre<input id="collab-name"></label>
          <label>Teléfono<input id="collab-phone" type="tel"></label>
          <label>Edad<input id="collab-age" type="number" min="18" max="90" step="1" inputmode="numeric"></label>
          <label>Ciudad<input id="collab-city"></label>
          <label>Zona o colonia donde sales normalmente<input id="collab-zone" placeholder="Ej. Centro, Atasta, Tamulté, Gaviotas"></label>
          <label>¿Cuántos años tienes de experiencia en oficio o servicios generales?
            <input id="collab-experience-years" type="number" min="0" max="60" step="1" inputmode="numeric">
          </label>
          <label>Disponibilidad<input id="collab-availability" placeholder="Ej. fines de semana, entre semana, inmediato"></label>
          <label>Fotos opcionales de trabajos previos<input id="collab-photos" type="file" accept="image/*" multiple></label>
        </div>
        <div class="notice" style="margin-top:12px;">Tu prioridad aumenta con experiencia comprobable, puntualidad, trabajo limpio y calidad.</div>
        <div class="actions single">
          <button class="btn btn-primary" data-action="send-collab">Enviar registro como colaborador</button>
        </div>
        <div class="actions single">
          <button class="btn btn-ghost" data-action="home" type="button">Atrás</button>
        </div>
      </div>
    </section>
  `;
}

function success() {
  const quote = state.lastSavedQuote || {};
  const whatsapp = whatsappUrl(leadWhatsappText(quote.calculation || {}, quote));
  return `
    ${topbar('Cotización enviada')}
    <section class="screen">
      <div class="card success">
        <div class="success-mark">✓</div>
        <h2>Recibimos tu solicitud</h2>
        <p>Folio: <strong>${quote.folio}</strong></p>
        <p class="muted">EMC revisará tus datos, fotos y condiciones capturadas para confirmar alcance y agenda.</p>
        <div class="success-summary">
          <span>Total preliminar</span>
          <strong>${money(quote.calculation?.total)}</strong>
          <small>${quote.client?.name || ''} · ${quote.client?.serviceNeed || 'Pintura'} · ${quote.client?.city || '-'} · ${quote.project?.squareMeters || '-'} m²</small>
        </div>
        ${whatsapp ? `<a class="btn btn-dark" href="${whatsapp}" target="_blank" rel="noopener">Continuar por WhatsApp</a>` : ''}
        <button class="btn btn-ghost" data-action="copy-summary">Copiar resumen</button>
        <button class="btn btn-primary" data-action="home">Volver al inicio</button>
      </div>
    </section>
  `;
}

function render() {
  if (!state.config) {
    app.innerHTML = '<section class="home"><div class="home-card"><div class="logo">EMC</div><p>Cargando...</p></div></section>';
    return;
  }
  if (state.view === 'home') app.innerHTML = home();
  if (state.view === 'quote') app.innerHTML = quoteStep();
  if (state.view === 'how') app.innerHTML = howItWorks();
  if (state.view === 'work') app.innerHTML = workForm();
  if (state.view === 'success') app.innerHTML = success();
  bind();
  maybeAnalyzePhotosAutomatically();
}

function photoSignature() {
  return state.quote.photos.map(photo => `${photo.label}:${photo.name}:${photo.size}`).join('|');
}

function maybeAnalyzePhotosAutomatically() {
  if (state.view !== 'quote' || state.step !== 2) return;
  if (state.analyzingPhotos) return;
  if (state.quote.photos.length < 4) return;
  const signature = photoSignature();
  if (!signature || signature === state.photoAnalysisSignature) return;
  state.photoAnalysisSignature = signature;
  if (!state.aiStatus?.configured) {
    applyConservativePhotoFallback('Fotos recibidas. Pendiente revisión visual EMC antes de confirmar el nivel de servicio.');
    return;
  }
  window.setTimeout(() => analyzePhotos({ silent: true }), 250);
}

function applyConservativePhotoFallback(summary = 'Fotos cargadas sin análisis visual automático.') {
  state.photoAnalysis = {
    enabled: false,
    status: 'manual_review_required',
    summary,
    minimumLevel: 'medio',
    confidence: 0,
    photoQuality: 'Pendiente de revisión EMC',
    signals: [{ type: 'revision', severity: 'media', evidence: 'Fotos cargadas para validación EMC.' }],
    alerts: ['EMC debe revisar visualmente las fotos antes de confirmar Básico.'],
    questions: ['Confirmar manualmente si la superficie está sana antes de ofrecer Básico.'],
    recommendedActions: ['Revisión visual EMC antes de agendar.']
  };
  render();
}

function validationMessage() {
  const q = state.quote;
  syncProjectSquareMeters();
  if (state.step === 0) {
    if (!q.client.name.trim()) return 'Escribe tu nombre.';
    if (q.client.phone.replace(/\D/g, '').length < 10) return 'Escribe tu WhatsApp con 10 dígitos.';
  }
  if (state.step === 1) {
    if (projectSquareMeters() <= 0) return 'Pon metros aproximados. Si no sabes, pon 100 y EMC lo confirma.';
    if (q.project.applicationType === 'Interior y exterior' && (!Number(q.project.interiorSquareMeters || 0) || !Number(q.project.exteriorSquareMeters || 0))) {
      return 'Pon un aproximado por dentro y por fuera.';
    }
    if (Number(q.project.heightMeters) > 15) return 'Revisa la altura: parece demasiado alta para una cotización rápida.';
  }
  if (state.step === 2 && photoReviewPending()) return 'Espera unos segundos: el sistema está terminando la revisión de fotos antes de recomendar un nivel.';
  if (state.step === 4 && !q.service.selectedLevel) {
    return 'Elige usar el precio sugerido para continuar.';
  }
  if (state.step === 4 && isBelowMinimum() && !state.quote.service.riskOverrideAccepted) {
    return 'Para elegir un nivel más barato que el recomendado, acepta que será alcance limitado.';
  }
  if (state.step === 4 && !q.service.paintSupply) {
    return 'Elige quién compra la pintura.';
  }
  if (state.step === 4 && q.service.paintSupply === 'emc' && !q.service.paintId) {
    return 'Elige una pintura o marca "Yo compro la pintura".';
  }
  if (state.step === 4 && q.service.paintSupply === 'emc' && needsSealer(q.service.selectedLevel) && !q.service.sealerId) {
    return 'Elige un sellador o cambia a "Yo compro la pintura".';
  }
  if (!q.service.invoice && q.service.paymentMethod === 'DAI Bitso a Bitso' && !daiPaymentAvailable()) {
    return 'El pago en DAI Bitso a Bitso no está disponible. Elige efectivo o pide a EMC activar DAI.';
  }
  return '';
}

function validateStep() {
  return !validationMessage();
}

function quoteShareText() {
  const q = state.lastSavedQuote;
  if (!q) return '';
  const c = q.calculation || {};
  const levelName = levels[c.level]?.label || c.level || '-';
  return [
    `Cotización EMC Pintura`,
    `Folio: ${q.folio}`,
    `Cliente: ${q.client?.name || '-'}`,
    `Casa/negocio/empresa: ${q.client?.company || '-'}`,
    `WhatsApp: ${q.client?.phone || '-'}`,
    `Municipio: ${q.client?.city || '-'}`,
    `Tipo: ${q.client?.propertyType || '-'}`,
    `Servicio solicitado: ${q.client?.serviceNeed || levelName}`,
    `Urgencia: ${q.client?.urgency || '-'}`,
    `Área: ${q.project?.squareMeters || '-'} m²`,
    `Total preliminar: ${money(c.total)}`,
    `Estatus: ${q.status || 'Nueva'}`
  ].join('\n');
}

function bind() {
  document.querySelectorAll('[data-action]').forEach(button => {
    button.addEventListener('click', async event => {
      const action = button.dataset.action;
      if (action === 'home') setView('home', 0);
      if (action === 'quote') startNewQuote();
      if (action === 'work') {
        track('collaborator_start', { detail: 'red emc' });
        setView('work', 0);
      }
      if (action === 'how') setView('how', 0);
      if (action === 'prev') {
        if (state.view === 'quote' && state.step === 0) {
          setView('home', 0);
        } else {
          setView('quote', Math.max(0, state.step - 1));
        }
      }
      if (action === 'next') {
        const message = validationMessage();
        if (message) return alert(message);
        const nextStep = Math.min(5, state.step + 1);
        setView('quote', nextStep);
      }
      if (action === 'accept-recommendation') {
        const calc = calculate();
        state.quote.service.selectedLevel = calc.recommendedLevel;
        state.quote.service.riskOverrideAccepted = true;
        state.showServiceOptions = false;
        setView('quote', 4);
      }
      if (action === 'choose-service') {
        state.showServiceOptions = true;
        render();
      }
      if (action === 'toggle-crew-config') {
        state.showCrewConfig = !state.showCrewConfig;
        render();
      }
      if (action === 'accept') await acceptQuote();
      if (action === 'analyze-photos') await analyzePhotos();
      if (action === 'print-pdf') window.print();
      if (action === 'copy-summary') {
        const text = quoteShareText();
        try {
          await navigator.clipboard.writeText(text);
          alert('Resumen copiado.');
        } catch (error) {
          prompt('Copia este resumen:', text);
        }
      }
      if (action === 'send-collab') await sendCollaborator();
      if (action === 'close-modal') {
        event.stopPropagation();
        state.modal = null;
        render();
      }
    });
  });

  document.querySelectorAll('[data-modal]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      state.modal = button.dataset.modal;
      render();
    });
  });

  document.querySelectorAll('[data-service-detail]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      state.modal = `service-${button.dataset.serviceDetail}`;
      render();
    });
  });

  document.querySelectorAll('[data-path]').forEach(field => {
    field.addEventListener('input', event => {
      let value = event.target.value;
      if (event.target.type === 'number') value = Number(value);
      if (event.target.dataset.path === 'service.invoice') {
        value = value === 'true';
        state.quote.service.paymentMethod = value ? 'Transferencia bancaria / SPEI' : 'Efectivo';
      }
      update(event.target.dataset.path, value);
      if (event.target.dataset.path.startsWith('project.')) syncProjectSquareMeters();
      if (event.target.dataset.path === 'project.applicationType') render();
      if (state.step >= 4) render();
    });
  });

  document.querySelectorAll('[data-level]').forEach(field => {
    field.addEventListener('change', event => {
      const level = event.target.dataset.level;
      state.quote.service.selectedLevel = level;
      state.quote.service.riskOverrideAccepted = !isBelowMinimum(level);
      render();
    });
  });

  document.querySelectorAll('[data-pick-level]').forEach(button => {
    button.addEventListener('click', () => {
      state.quote.service.selectedLevel = button.dataset.pickLevel;
      state.quote.service.riskOverrideAccepted = !isBelowMinimum(button.dataset.pickLevel);
      state.modal = null;
      render();
    });
  });

  document.querySelectorAll('[data-select-service-level]').forEach(button => {
    button.addEventListener('click', () => {
      const level = button.dataset.selectServiceLevel;
      state.quote.service.selectedLevel = level;
      state.quote.service.riskOverrideAccepted = true;
      state.showServiceOptions = false;
      setView('quote', 4);
    });
  });

  document.querySelectorAll('[data-risk-override]').forEach(field => {
    field.addEventListener('change', event => {
      state.quote.service.riskOverrideAccepted = event.target.checked;
      render();
    });
  });

  document.querySelectorAll('[data-paint-supply]').forEach(button => {
    button.addEventListener('click', () => {
      state.quote.service.paintSupply = button.dataset.paintSupply;
      if (button.dataset.paintSupply === 'cliente') {
        state.quote.service.paintId = '';
        state.quote.service.sealerId = '';
        state.quote.service.paintBucketsOverride = '';
        state.quote.service.sealerBucketsOverride = '';
      }
      render();
    });
  });

  document.querySelectorAll('[data-client-supply-continue]').forEach(button => {
    button.addEventListener('click', () => {
      state.quote.service.paintSupply = 'cliente';
      state.quote.service.paintId = '';
      state.quote.service.sealerId = '';
      state.quote.service.paintBucketsOverride = '';
      state.quote.service.sealerBucketsOverride = '';
      setView('quote', 5);
    });
  });

  document.querySelectorAll('[data-pick-paint]').forEach(button => {
    button.addEventListener('click', () => {
      if (state.quote.service.paintId === button.dataset.pickPaint) {
        state.quote.service.paintId = '';
        state.quote.service.paintSupply = 'cliente';
        state.quote.service.paintBucketsOverride = '';
      } else {
        state.quote.service.paintId = button.dataset.pickPaint;
        state.quote.service.paintSupply = 'emc';
        state.quote.service.paintBucketsOverride = '';
      }
      state.modal = null;
      render();
    });
  });

  document.querySelectorAll('[data-pick-sealer]').forEach(button => {
    button.addEventListener('click', () => {
      state.quote.service.sealerId = state.quote.service.sealerId === button.dataset.pickSealer ? '' : button.dataset.pickSealer;
      state.quote.service.sealerBucketsOverride = '';
      render();
    });
  });

  document.querySelectorAll('[data-pick-payment]').forEach(button => {
    button.addEventListener('click', () => {
      if (button.dataset.pickPayment === 'DAI Bitso a Bitso' && !daiPaymentAvailable()) {
        alert('DAI Bitso a Bitso no está disponible en este momento.');
        return;
      }
      state.quote.service.paymentMethod = button.dataset.pickPayment;
      state.modal = null;
      render();
    });
  });

  document.querySelectorAll('[data-pick-crew]').forEach(button => {
    button.addEventListener('click', () => {
      state.quote.service.painters = Number(button.dataset.pickCrew);
      state.modal = null;
      render();
    });
  });

  document.querySelectorAll('[data-photo-index]').forEach(field => {
    field.addEventListener('change', async event => {
      const file = event.target.files[0];
      if (!file) return;
      const photo = await compressImage(file, requiredPhotos[Number(event.target.dataset.photoIndex)]);
      state.quote.photos[Number(event.target.dataset.photoIndex)] = photo;
      state.quote.photos = state.quote.photos.filter(Boolean).slice(0, 10);
      state.photoAnalysis = null;
      state.photoAnalysisSignature = '';
      render();
    });
  });

  const extraPhotos = document.querySelector('[data-extra-photos]');
  if (extraPhotos) {
    extraPhotos.addEventListener('change', async event => {
      const files = Array.from(event.target.files).slice(0, 10 - state.quote.photos.length);
      for (const file of files) {
        state.quote.photos.push(await compressImage(file, 'Foto adicional'));
      }
      state.quote.photos = state.quote.photos.slice(0, 10);
      state.photoAnalysis = null;
      state.photoAnalysisSignature = '';
      render();
    });
  }

  document.querySelectorAll('[data-info]').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelector('#info-panel').innerHTML = button.dataset.info === 'service' ? serviceInfo() : collaboratorInfo();
      document.querySelectorAll('[data-info]').forEach(item => item.classList.remove('selected'));
      button.classList.add('selected');
    });
  });

  document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp"]').forEach(link => {
    link.addEventListener('click', () => {
      track('whatsapp_click', { detail: link.textContent.trim().slice(0, 120) });
    });
  });
}

function compressImage(file, label) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const max = 1280;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({
          label,
          name: file.name,
          size: file.size,
          dataUrl: canvas.toDataURL('image/jpeg', 0.72)
        });
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function analyzePhotos(options = {}) {
  if (!state.aiStatus?.configured) {
    applyConservativePhotoFallback('Fotos recibidas. Pendiente revisión visual EMC antes de confirmar el nivel de servicio.');
    if (!options.silent) alert('EMC revisará fotos manualmente antes de confirmar Básico.');
    return;
  }
  if (state.quote.photos.length < 1) return alert('Si quieres análisis automático, sube al menos una foto. También puedes continuar sin fotos y EMC te orienta por WhatsApp.');
  state.analyzingPhotos = true;
  if (!options.silent) render();
  try {
    const response = await fetch('/api/analyze-photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: {
          client: {
            propertyType: state.quote.client.propertyType,
            city: state.quote.client.city
          },
          project: state.quote.project,
          diagnostic: state.quote.diagnostic,
          minimumByQuestionnaire: minimumLevelByRules()
        },
        photos: state.quote.photos.map(photo => ({
          label: photo.label,
          name: photo.name,
          size: photo.size,
          dataUrl: photo.dataUrl
        }))
      })
    });
    const analysis = await response.json();
    if (!response.ok) throw new Error(analysis.error || 'No se pudo analizar fotos');
    state.photoAnalysis = analysis;
  } catch (error) {
    state.photoAnalysis = {
      enabled: false,
      status: 'error',
      summary: 'No se pudo completar la revisión automática. EMC revisará las fotos antes de confirmar el nivel de servicio.',
      minimumLevel: 'medio',
      confidence: 0,
      photoQuality: 'Pendiente de revisión EMC',
      signals: [{ type: 'revision', severity: 'media', evidence: 'Fotos cargadas para validación EMC.' }],
      alerts: ['Revisar fotos manualmente antes de confirmar precio final.'],
      questions: ['Confirmar si la superficie está sana antes de ofrecer Básico.']
    };
  } finally {
    state.analyzingPhotos = false;
    render();
  }
}

async function acceptQuote() {
  if (!validateStep()) return alert('Faltan algunos datos básicos. Si no sabes una medida, escribe un aproximado y EMC lo confirma por WhatsApp.');
  const calc = calculate();
  const photoReview = {
    count: state.quote.photos.length,
    requiredCount: requiredPhotos.length,
    requiredLabels: requiredPhotos,
    receivedLabels: state.quote.photos.map(photo => photo.label),
    storage: 'Las fotos, si se enviaron, se usaron solo como apoyo preliminar; no se guardan en la cotización pública.',
    aiAnalysis: state.photoAnalysis ? {
      enabled: Boolean(state.photoAnalysis.enabled),
      status: state.photoAnalysis.status || '',
      summary: state.photoAnalysis.summary || '',
      minimumLevel: state.photoAnalysis.minimumLevel || '',
      confidence: Number(state.photoAnalysis.confidence || 0),
      photoQuality: state.photoAnalysis.photoQuality || '',
      signals: state.photoAnalysis.signals || [],
      alerts: state.photoAnalysis.alerts || [],
      questions: state.photoAnalysis.questions || [],
      recommendedActions: state.photoAnalysis.recommendedActions || []
    } : null
  };
  const payload = {
    ...state.quote,
    photos: [],
    photoReview,
    calculation: calc,
    assistant: calc.assistant,
    legal: {
      quote: 'Los precios pueden variar debido a cambios en el mercado mexicano de pinturas, materiales y consumibles. Esta cotización preliminar tiene vigencia de 15 días naturales.',
      technical: 'La cotización se genera con la información disponible. EMC confirmará medidas, condiciones y alcance por WhatsApp antes de iniciar. Si aparecen daños ocultos o cambios de alcance, se explicarán antes de ajustar el servicio.'
    }
  };
  const response = await fetch('/api/quotes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  state.lastSavedQuote = await response.json();
  track('quote_sent', { detail: state.lastSavedQuote.folio || 'cotizacion enviada' });
  state.quote = initialQuote();
  state.photoAnalysis = null;
  state.photoAnalysisSignature = '';
  state.showServiceOptions = false;
  state.showCrewConfig = false;
  setView('success', 0);
}

async function sendCollaborator() {
  const photosInput = document.querySelector('#collab-photos');
  const files = Array.from(photosInput.files || []).slice(0, 6);
  const photos = [];
  for (const file of files) photos.push(await compressImage(file, 'Trabajo previo'));
  const baseRate = 20;
  const payload = {
    network: 'Red EMC',
    promise: 'Oportunidades eventuales con prioridad de consideración cuando exista un servicio compatible; no empleo permanente.',
    area: 'Servicios generales',
    category: 'Servicios generales / pintura',
    baseRate,
    ratePolicy: `Pago mínimo inicial desde ${money(baseRate)} por m²; sujeto a evaluación por experiencia, calidad, puntualidad y tipo de servicio.`,
    acceptedByService: document.querySelector('#collab-accept').checked,
    name: document.querySelector('#collab-name').value,
    phone: document.querySelector('#collab-phone').value,
    age: Number(document.querySelector('#collab-age').value || 0),
    preferentialReview: Number(document.querySelector('#collab-age').value || 0) >= 50,
    city: document.querySelector('#collab-city').value,
    zone: document.querySelector('#collab-zone').value,
    experienceYears: Number(document.querySelector('#collab-experience-years').value || 0),
    experience: `${document.querySelector('#collab-experience-years').value || 0} años de experiencia en servicios generales`,
    availability: document.querySelector('#collab-availability').value,
    photos
  };
  if (!payload.acceptedByService || !payload.name || !payload.phone) {
    return alert('Acepta el registro como colaborador y captura nombre y teléfono.');
  }
  await fetch('/api/collaborators', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  track('collaborator_sent', { detail: payload.city || 'colaborador enviado' });
  alert('Registro enviado. EMC revisará si hay una oportunidad compatible por evento.');
  setView('home', 0);
}

loadConfig();
