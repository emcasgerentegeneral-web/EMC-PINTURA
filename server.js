const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

const PORT = Number(process.env.PORT || 8080);
const ADMIN_USER = process.env.ADMIN_USER || 'admin@emc.test';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'EMC12345';
const ADMIN_TOKEN = crypto.createHash('sha256').update(`${ADMIN_USER}:${ADMIN_PASSWORD}`).digest('hex');
const OPENAI_API_KEY = /^sk-/.test(process.env.OPENAI_API_KEY || '') ? process.env.OPENAI_API_KEY : '';
const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const ALERT_EMAIL_FROM = process.env.ALERT_EMAIL_FROM || '';
const ALERT_EMAIL_TO = process.env.ALERT_EMAIL_TO || ADMIN_USER;
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
const PUBLIC_WHATSAPP_NUMBER = String(process.env.PUBLIC_WHATSAPP_NUMBER || '').replace(/\D/g, '');
const PUBLIC_CLIENT_ONLY = String(process.env.PUBLIC_CLIENT_ONLY || '').toLowerCase() === 'true';
const ADMIN_PANEL_URL = (process.env.ADMIN_PANEL_URL || '').replace(/\/+$/, '');
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const CONFIG_FILE = path.join(DATA, 'config.json');
const QUOTES_FILE = path.join(DATA, 'quotes.json');
const COLLABORATORS_FILE = path.join(DATA, 'collaborators.json');
const ANALYTICS_FILE = path.join(DATA, 'analytics.json');
const CONFIG_RECORD_FOLIO = '__EMC_CONFIG__';
const ANALYTICS_RECORD_FOLIO = '__EMC_ANALYTICS__';
const MAX_ANALYTICS_EVENTS = 3000;


const embeddedClientFiles = {"/cliente/index.html":"<!doctype html>\n<html lang=\"es\">\n  <head>\n    <meta charset=\"utf-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n    <title>EMC Pintura</title>\n    <link rel=\"stylesheet\" href=\"/cliente/styles.css\">\n  </head>\n  <body>\n    <main id=\"app\" class=\"app-shell\"></main>\n    <script src=\"/cliente/app.js\"></script>\n  </body>\n</html>\n","/cliente/app.js":"const app = document.querySelector('#app');\n\nfunction initialQuote() {\n  return {\n    client: {\n      name: '',\n      phone: '',\n      email: '',\n      address: '',\n      city: '',\n      propertyType: 'Casa'\n    },\n    project: {\n      squareMeters: '',\n      interiorSquareMeters: '',\n      exteriorSquareMeters: '',\n      floors: '',\n      heightMeters: '',\n      applicationType: 'Interior'\n    },\n    diagnostic: {},\n    photos: [],\n    service: {\n      selectedLevel: '',\n      paintId: '',\n      sealerId: '',\n      paintSupply: '',\n      paintBucketsOverride: '',\n      sealerBucketsOverride: '',\n      riskOverrideAccepted: false,\n      invoice: false,\n      paymentMethod: 'Efectivo',\n      painters: 2\n    },\n    observations: ''\n  };\n}\n\nconst state = {\n  config: null,\n  view: 'home',\n  step: 0,\n  modal: null,\n  aiStatus: null,\n  photoAnalysis: null,\n  analyzingPhotos: false,\n  photoAnalysisSignature: '',\n  showServiceOptions: false,\n  showCrewConfig: false,\n  quote: initialQuote(),\n  lastSavedQuote: null\n};\n\nconst stepLabels = [\n  'Contacto',\n  'Proyecto',\n  'Fotos',\n  'Recomendación',\n  'Suministro',\n  'Resumen'\n];\n\nconst requiredPhotos = ['Foto general', 'Foto de daños', 'Foto de acceso', 'Foto de detalle'];\n\nconst levelOrder = ['basico', 'medio', 'premium'];\nconst referenceMaterial = {\n  paintYieldPerLiter: 7,\n  paintPresentation: 20,\n  paintYieldBaseCoats: 2,\n  sealerYieldPerLiter: 8,\n  sealerPresentation: 19\n};\n\nconst levels = {\n  basico: {\n    label: 'Básico',\n    short: 'Pintar',\n    coats: 2,\n    price: 62,\n    ideal: 'Casas habitadas, cambio de color, mantenimiento ligero y paredes en buen estado.',\n    scope: 'Protección básica de muebles y pisos, limpieza superficial de polvo, corrección de imperfecciones menores, aplicación de 2 manos de pintura y limpieza final del área.',\n    includes: ['Protección básica', 'Limpieza superficial', 'Imperfecciones menores', 'Pintura 2 manos', 'Limpieza final'],\n    excludes: ['Resanes extensos', 'Sellador', 'Tratamiento de humedad', 'Raspado completo', 'Reparación de grietas'],\n    when: 'Ideal para paredes sanas o mantenimiento ligero donde el objetivo principal es pintar.'\n  },\n  medio: {\n    label: 'Medio',\n    short: 'Pintar y corregir',\n    coats: 2,\n    price: 80,\n    ideal: 'Casas con desgaste normal, viviendas que llevan varios años sin pintar y fachadas con pequeños daños.',\n    scope: 'Incluye Básico más lijado de superficies, resanes menores, corrección de grietas superficiales, retiro de pintura suelta, preparación más detallada, aplicación uniforme de 2 manos y revisión de acabado por EMC.',\n    includes: ['Todo lo del Básico', 'Lijado', 'Resanes menores', 'Grietas superficiales', 'Retiro de pintura suelta', 'Preparación detallada', 'Revisión EMC'],\n    excludes: ['Resane total', 'Sellador general', 'Reparación de humedad severa', 'Corrección estructural'],\n    when: 'Probablemente el nivel más vendido para casas con desgaste normal y mejor relación calidad/precio.'\n  },\n  premium: {\n    label: 'Plus',\n    short: 'Renovar y embellecer',\n    coats: 3,\n    price: 180,\n    ideal: 'Casas premium, remodelaciones, entrega de propiedades y clientes exigentes.',\n    scope: 'Incluye Medio más raspado total donde sea necesario, resane completo, sellador, corrección de detalles finos, preparación integral, protección detallada, aplicación de pintura premium, acabado uniforme de alta calidad, inspección final EMC y garantía extendida.',\n    includes: ['Todo lo del Medio', 'Raspado total necesario', 'Resane completo', 'Sellador', 'Detalles finos', 'Protección detallada', 'Pintura premium', 'Inspección final EMC', 'Garantía extendida'],\n    excludes: ['Corrección estructural mayor no relacionada con pintura'],\n    when: 'Ideal para remodelaciones, entrega de propiedades, daño importante o acabado de mayor prestigio.'\n  }\n};\n\nfunction money(value) {\n  return Number(value || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });\n}\n\nfunction daiPaymentAvailable() {\n  const payments = state.config?.payments || {};\n  return Boolean(payments.daiActive && Number(payments.daiRate) > 0 && String(payments.bitsoUser || '').trim());\n}\n\nfunction projectSquareMeters() {\n  const p = state.quote.project;\n  if (p.applicationType === 'Interior') return Number(p.interiorSquareMeters || p.squareMeters || 0);\n  if (p.applicationType === 'Exterior') return Number(p.exteriorSquareMeters || p.squareMeters || 0);\n  return Number(p.interiorSquareMeters || 0) + Number(p.exteriorSquareMeters || 0);\n}\n\nfunction syncProjectSquareMeters() {\n  state.quote.project.squareMeters = projectSquareMeters();\n}\n\nfunction autoAccess() {\n  const height = Number(state.quote.project.heightMeters || 0);\n  const exterior = state.quote.project.applicationType !== 'Interior';\n  if (!height) return { ladder: false, scaffold: false, pending: true };\n  return {\n    ladder: height >= 3,\n    scaffold: exterior && height >= 4\n  };\n}\n\nfunction today() {\n  return new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' });\n}\n\nfunction scrollToPageStart() {\n  window.scrollTo(0, 0);\n  document.documentElement.scrollTop = 0;\n  document.body.scrollTop = 0;\n}\n\nfunction setView(view, step = state.step) {\n  state.view = view;\n  state.step = step;\n  state.modal = null;\n  render();\n  scrollToPageStart();\n  window.requestAnimationFrame(scrollToPageStart);\n  window.setTimeout(scrollToPageStart, 25);\n}\n\nfunction startNewQuote() {\n  state.quote = initialQuote();\n  state.step = 0;\n  state.modal = null;\n  state.photoAnalysis = null;\n  state.analyzingPhotos = false;\n  state.photoAnalysisSignature = '';\n  state.showServiceOptions = false;\n  state.showCrewConfig = false;\n  setView('quote', 0);\n}\n\nfunction update(path, value) {\n  const keys = path.split('.');\n  let target = state.quote;\n  keys.slice(0, -1).forEach(key => {\n    target = target[key];\n  });\n  target[keys.at(-1)] = value;\n}\n\nasync function loadConfig() {\n  const [configResponse, aiStatusResponse] = await Promise.all([\n    fetch('/api/config'),\n    fetch('/api/ai-status')\n  ]);\n  state.config = await configResponse.json();\n  state.aiStatus = await aiStatusResponse.json();\n  render();\n}\n\nfunction highestLevel(a, b) {\n  return levelOrder[Math.max(levelOrder.indexOf(a), levelOrder.indexOf(b))] || 'basico';\n}\n\nfunction minimumLevelByRules() {\n  let minimum = 'basico';\n  if (state.photoAnalysis?.minimumLevel) minimum = highestLevel(minimum, state.photoAnalysis.minimumLevel);\n  return minimum;\n}\n\nfunction isLevelAllowed(level) {\n  return levelOrder.indexOf(level) >= levelOrder.indexOf(minimumLevelByRules());\n}\n\nfunction isBelowMinimum(level = state.quote.service.selectedLevel) {\n  return levelOrder.indexOf(level) < levelOrder.indexOf(minimumLevelByRules());\n}\n\nfunction scoreDiagnostic() {\n  return minimumLevelByRules();\n}\n\nfunction customerMinimumLevel() {\n  return scoreDiagnostic();\n}\n\nfunction recommendationReasons() {\n  const access = autoAccess();\n  const reasons = [];\n  const finalMinimum = customerMinimumLevel();\n  if (state.photoAnalysis?.enabled) reasons.push(`Análisis visual IA: ${state.photoAnalysis.summary}`);\n  if (state.photoAnalysis?.minimumLevel && state.photoAnalysis.minimumLevel !== 'basico') {\n    reasons.push(`La revisión de fotos recomienda mínimo ${levels[finalMinimum].label}.`);\n  }\n  if (access.ladder) reasons.push('La altura se considera para equipo de acceso, pero no cambia por sí sola el nivel de servicio.');\n  if (access.scaffold) reasons.push('Si se requiere andamio o acceso especial, se cotiza aparte como costo trasladable al cliente.');\n  if (state.quote.project.applicationType !== 'Interior') reasons.push('El trabajo incluye exterior; el nivel se define por estado de la superficie, no solo por ubicación.');\n  return reasons.length ? reasons : ['Las fotos y datos del proyecto no muestran condiciones que obliguen a subir el nivel en esta revisión preliminar.'];\n}\n\nfunction emcAssistant() {\n  const q = state.quote;\n  const level = scoreDiagnostic();\n  const missing = [];\n  const alerts = [];\n  const questions = [];\n  const adminNotes = [];\n  const m2 = projectSquareMeters();\n  const height = Number(q.project.heightMeters || 0);\n\n  if (!q.client.name || !q.client.phone) missing.push('Faltan datos básicos de contacto.');\n  if (!m2) missing.push('Falta confirmar metros cuadrados aproximados.');\n  if (!height) missing.push('Falta altura aproximada en metros.');\n  if (q.photos.length < 4) missing.push('Faltan fotos mínimas del proyecto.');\n  if (q.project.applicationType !== 'Interior' && height >= 4) questions.push('El trabajo parece alto. ¿Hay espacio y permiso para trabajar con acceso especial?');\n\n  if (state.photoAnalysis?.alerts?.length) alerts.push(...state.photoAnalysis.alerts);\n  if (height >= 4) alerts.push('Riesgo operativo por altura: revisar acceso y seguridad antes de confirmar.');\n  if (q.service.selectedLevel && isBelowMinimum(q.service.selectedLevel)) alerts.push(`El cliente eligió ${levels[q.service.selectedLevel].label} por precio, pero la recomendación visual mínima es ${levels[level].label}. Debe tratarse como alcance limitado.`);\n\n  const material = materialEstimateForLevel(q.service.selectedLevel || level);\n  adminNotes.push(`Nivel sugerido: ${levels[level].label}.`);\n  adminNotes.push(`Material técnico estimado: ${material.paintLiters.toFixed(1)} L de pintura. Suministro EMC sugerido: ${material.paintBuckets} cubeta(s).`);\n  if (material.sealerLiters) adminNotes.push(`Sellador técnico sugerido: ${material.sealerLiters.toFixed(1)} L. Suministro EMC sugerido: ${material.sealerBuckets} cubeta(s).`);\n  adminNotes.push(`Revisar fotos antes de confirmar precio final y alcance.`);\n\n  return {\n    label: 'Asistente EMC',\n    summary: `Recomendación preliminar: ${levels[level].label}. ${levels[level].short}.`,\n    missing,\n    questions,\n    alerts,\n    adminNotes,\n    material,\n    reviewedAt: new Date().toISOString()\n  };\n}\n\nfunction selectedPaint() {\n  return state.config.paints.find(paint => paint.id === state.quote.service.paintId) || null;\n}\n\nfunction selectedSealer() {\n  const sealers = state.config.sealers || [];\n  return sealers.find(sealer => sealer.id === state.quote.service.sealerId) || null;\n}\n\nfunction needsSealer(level = state.quote.service.selectedLevel || scoreDiagnostic()) {\n  return level === 'premium' || state.photoAnalysis?.minimumLevel === 'premium';\n}\n\nfunction materialEstimateForLevel(level, paint = selectedPaint(), sealer = selectedSealer()) {\n  const m2 = projectSquareMeters();\n  const coats = levels[level].coats;\n  const paintYield = Number(paint?.yieldPerLiter || referenceMaterial.paintYieldPerLiter);\n  const paintYieldBaseCoats = Number(paint?.yieldBaseCoats || referenceMaterial.paintYieldBaseCoats);\n  const paintPresentation = Number(paint?.presentation || referenceMaterial.paintPresentation);\n  const sealerYield = Number(sealer?.yieldPerLiter || referenceMaterial.sealerYieldPerLiter);\n  const sealerPresentation = Number(sealer?.presentation || referenceMaterial.sealerPresentation);\n  const paintLiters = (m2 / Math.max(1, paintYield)) * (coats / Math.max(1, paintYieldBaseCoats));\n  const paintBuckets = Math.ceil(paintLiters / Math.max(1, paintPresentation));\n  const sealerLiters = needsSealer(level) ? m2 / Math.max(1, sealerYield) : 0;\n  const sealerBuckets = sealerLiters ? Math.ceil(sealerLiters / Math.max(1, sealerPresentation)) : 0;\n  return {\n    coats,\n    paintYield,\n    paintYieldBaseCoats,\n    paintPresentation,\n    paintLiters,\n    paintBuckets,\n    sealerYield,\n    sealerPresentation,\n    sealerLiters,\n    sealerBuckets\n  };\n}\n\nfunction estimateDays(level, painters = state.quote.service.painters) {\n  const perf = state.config.workerPerformance || { painterM2PerDay: 26, levelFactor: { basico: 1, medio: 0.72, premium: 0.48 } };\n  const m2 = projectSquareMeters();\n  const factor = perf.levelFactor[level] || 1;\n  const dailyAdvance = Math.max(1, Number(painters || 1) * perf.painterM2PerDay * factor);\n  return {\n    dailyAdvance,\n    days: Math.max(1, Math.ceil(m2 / dailyAdvance))\n  };\n}\n\nfunction paintMaterialDetails(calc) {\n  const m2 = projectSquareMeters();\n  const formula = `${m2} m² / ${calc.paintYield} m²/L = ${calc.liters.toFixed(1)} L`;\n  const buckets = `${calc.buckets} cubeta${calc.buckets !== 1 ? 's' : ''} de ${calc.paintPresentation} L`;\n  const cost = calc.paintCost ? money(calc.paintCost) : 'Pendiente';\n  return { formula, buckets, cost };\n}\n\nfunction sealerMaterialDetails(calc) {\n  if (!calc.sealerLiters) return null;\n  const m2 = projectSquareMeters();\n  const formula = `${m2} m² / ${calc.sealerYield} m²/L = ${calc.sealerLiters.toFixed(1)} L`;\n  const buckets = `${calc.sealerBuckets} cubeta${calc.sealerBuckets !== 1 ? 's' : ''} de ${calc.sealerPresentation} L`;\n  const cost = calc.sealerCost ? money(calc.sealerCost) : 'Pendiente';\n  return { formula, buckets, cost };\n}\n\nfunction calculate() {\n  const q = state.quote;\n  const config = state.config;\n  syncProjectSquareMeters();\n  const m2 = projectSquareMeters();\n  const recommendedLevel = scoreDiagnostic();\n  const level = q.service.selectedLevel || recommendedLevel;\n  const saleRate = Number(config.labor?.[level] || levels[level]?.price || 0);\n  const crewRate = Number(config.crewRates?.[level] || { basico: 25, medio: 30, premium: 40 }[level] || 0);\n  const painters = Number(q.service.painters || 1);\n  const crewPayment = m2 * crewRate;\n  const marginRate = Math.max(0, saleRate - crewRate);\n  const margin = m2 * marginRate;\n  const height = Number(q.project.heightMeters || 0);\n  const access = autoAccess();\n  const exteriorAdjustment = 0;\n  const ladder = 0;\n  const scaffoldRequired = Boolean(access.scaffold);\n  const serviceSubtotalWithoutPaint = m2 * saleRate;\n  const mold = 0;\n  const saltpeter = 0;\n  const difficulty = 0;\n  const treatments = mold + saltpeter;\n  const paint = selectedPaint();\n  const sealer = selectedSealer();\n  const material = materialEstimateForLevel(level, paint, sealer);\n  const liters = material.paintLiters;\n  const buckets = Number(q.service.paintBucketsOverride || 0) || material.paintBuckets;\n  const paintCost = q.service.paintSupply === 'cliente' || !paint ? 0 : buckets * paint.price;\n  const sealerLiters = material.sealerLiters;\n  const sealerBuckets = Number(q.service.sealerBucketsOverride || 0) || material.sealerBuckets;\n  const sealerCost = sealerBuckets && sealer ? sealerBuckets * sealer.price : 0;\n  const unitServiceCostWithoutPaint = m2 ? crewPayment / m2 : 0;\n  const paintQuote = paintCost + sealerCost;\n  const quoteBaseBeforeSingleAdditional = serviceSubtotalWithoutPaint + paintQuote;\n  const singleAdditionalPct = Number(config.adjustments.singleAdditionalPct ?? 15);\n  const singleAdditionalApplies = scaffoldRequired;\n  const scaffold = scaffoldRequired ? quoteBaseBeforeSingleAdditional * (singleAdditionalPct / 100) : 0;\n  const accessEquipmentCost = scaffold;\n  const singleAdditionalAmount = scaffold;\n  const directServiceCost = crewPayment + scaffold;\n  const subtotal = quoteBaseBeforeSingleAdditional + singleAdditionalAmount;\n  const iva = q.service.invoice ? subtotal * (config.adjustments.ivaPct / 100) : 0;\n  const total = subtotal + iva;\n  const daiRate = Number(config.payments.daiRate || 0);\n  const dai = daiRate > 0 ? total / daiRate : 0;\n  const schedule = estimateDays(level);\n  const assistant = emcAssistant();\n  return {\n    recommendedLevel,\n    level,\n    minimumLevel: minimumLevelByRules(),\n    crewRate,\n    saleRate,\n    crewPayment,\n    painters,\n    marginRate,\n    margin,\n    grossControlMargin: margin,\n    laborBase: serviceSubtotalWithoutPaint,\n    directServiceCost,\n    unitServiceCostWithoutPaint,\n    serviceSubtotalWithoutPaint,\n    paintQuote,\n    accessEquipmentCost,\n    ladder,\n    exteriorAdjustment,\n    consumables: singleAdditionalAmount,\n    singleAdditionalPct,\n    singleAdditionalApplies,\n    singleAdditionalAmount,\n    quoteBaseBeforeSingleAdditional,\n    scaffold,\n    scaffoldRequired,\n    treatments,\n    difficulty,\n    paint,\n    sealer,\n    coats: material.coats,\n    paintYield: material.paintYield,\n    paintYieldBaseCoats: material.paintYieldBaseCoats,\n    paintPresentation: material.paintPresentation,\n    liters,\n    buckets,\n    paintCost,\n    sealerLiters,\n    sealerYield: material.sealerYield,\n    sealerPresentation: material.sealerPresentation,\n    sealerBuckets,\n    sealerCost,\n    subtotal,\n    iva,\n    total,\n    dai,\n    painters: q.service.painters,\n    dailyAdvance: schedule.dailyAdvance,\n    estimatedDays: schedule.days,\n    reasons: recommendationReasons(),\n    assistant\n  };\n}\n\nfunction home() {\n  return `\n    <section class=\"home\">\n      <div class=\"home-card\">\n        <img class=\"brand-logo\" src=\"/assets/emc-logo.jpg\" alt=\"EMC Pintura\">\n        <h1>EMC Servicios y Suministros</h1>\n        <p class=\"division\">División Pintura</p>\n        <p class=\"home-tagline\">Cotiza tu servicio en minutos</p>\n        <div class=\"benefits\">\n          <span>Rápido</span>\n          <span>Profesional</span>\n          <span>Con materiales de calidad</span>\n        </div>\n        ${homeProcess()}\n        <div class=\"button-stack\">\n          <button class=\"btn btn-primary\" data-action=\"quote\">Cotizar servicio</button>\n          <button class=\"btn btn-secondary\" data-action=\"work\">Forma parte de la Red EMC</button>\n          <button class=\"btn btn-light\" data-action=\"how\">Cómo funciona</button>\n        </div>\n      </div>\n    </section>\n  `;\n}\n\nfunction homeProcess() {\n  const steps = [\n    ['Decidir', 'Captura datos y fotos del proyecto.'],\n    ['Entender', 'EMC revisa área, acceso y señales visibles.'],\n    ['Cotizar', 'El sistema recomienda nivel y calcula materiales.'],\n    ['Mejorar', 'El cliente comenta y EMC confirma alcance.']\n  ];\n  return `\n    <div class=\"client-method\" aria-label=\"Método EMC\">\n      <span>Método EMC</span>\n      <div class=\"client-method-grid\">\n        ${steps.map(([title, text], index) => `\n          <div class=\"client-method-card\">\n            <small>${index + 1}</small>\n            <strong>${title}</strong>\n            <em>${text}</em>\n          </div>\n        `).join('')}\n      </div>\n    </div>\n  `;\n}\n\nfunction topbar(subtitle) {\n  return `\n    <header class=\"topbar site-header\">\n      <button class=\"site-brand\" data-action=\"home\" type=\"button\" aria-label=\"Ir al inicio\">\n        <img class=\"topbar-logo\" src=\"/assets/emc-logo.jpg\" alt=\"EMC\">\n        <span>\n          <strong>EMC Servicios y Suministros</strong>\n          <small>${subtitle}</small>\n        </span>\n      </button>\n      <div class=\"topbar-title\">\n        <strong>División Pintura</strong>\n        <span>${subtitle}</span>\n      </div>\n    </header>\n  `;\n}\n\nfunction progress() {\n  return `<div class=\"progress six\">${[0, 1, 2, 3, 4, 5].map(i => `<span class=\"${i <= state.step ? 'active' : ''}\"></span>`).join('')}</div>`;\n}\n\nfunction clientPhaseIndex() {\n  if (state.step <= 1) return 0;\n  if (state.step === 2) return 1;\n  if (state.step <= 4) return 2;\n  return 3;\n}\n\nfunction clientControlPath() {\n  const current = clientPhaseIndex();\n  const phases = [\n    ['Decidir', 'Datos y medidas'],\n    ['Entender', 'Fotos y señales'],\n    ['Cotizar', 'Nivel y materiales'],\n    ['Confirmar', 'PDF y comentarios']\n  ];\n  return `\n    <div class=\"client-path\" aria-label=\"Proceso EMC\">\n      ${phases.map(([title, text], index) => `\n        <div class=\"client-path-step ${index < current ? 'done' : ''} ${index === current ? 'active' : ''}\">\n          <span>${index + 1}</span>\n          <strong>${title}</strong>\n          <small>${text}</small>\n        </div>\n      `).join('')}\n    </div>\n  `;\n}\n\nfunction input(path, label, type = 'text', attrs = '') {\n  const value = path.split('.').reduce((acc, key) => acc[key], state.quote) ?? '';\n  return `<label>${label}<input data-path=\"${path}\" type=\"${type}\" value=\"${value}\" ${attrs}></label>`;\n}\n\nfunction select(path, label, options) {\n  const value = path.split('.').reduce((acc, key) => acc[key], state.quote);\n  return `\n    <label>${label}\n      <select data-path=\"${path}\">\n        ${options.map(option => `<option value=\"${option}\" ${option === value ? 'selected' : ''}>${option}</option>`).join('')}\n      </select>\n    </label>\n  `;\n}\n\nfunction quoteStep() {\n  const calc = calculate();\n  const steps = [stepClient, stepProject, stepPhotos, stepRecommendation, stepSupply, stepSummary];\n  return `\n    ${topbar(`Paso ${state.step + 1} de 6`)}\n    <section class=\"screen\">\n      ${progress()}\n      ${clientControlPath()}\n      ${stepContext(calc)}\n      ${steps[state.step](calc)}\n    </section>\n    ${modal()}\n  `;\n}\n\nfunction stepContext(calc) {\n  const title = state.step === 0 ? 'Datos para evaluar' : state.step < 5 ? 'Evaluación en proceso' : 'Revisa antes de aceptar';\n  return `\n    <div class=\"step-context\">\n      <div>\n        <span>${stepLabels[state.step]}</span>\n        <strong>${title}</strong>\n      </div>\n      ${state.step >= 5 ? `\n        <div>\n          <span>Total estimado</span>\n          <strong>${money(calc.total)}</strong>\n        </div>\n      ` : `\n        <div>\n          <span>Estado</span>\n          <strong>En captura</strong>\n        </div>\n      `}\n    </div>\n  `;\n}\n\nfunction workVisual(src, title, caption) {\n  return `\n    <figure class=\"work-visual\">\n      <img src=\"${src}\" alt=\"${title}\">\n      <figcaption>\n        <strong>${title}</strong>\n        <span>${caption}</span>\n      </figcaption>\n    </figure>\n  `;\n}\n\nfunction stepClient() {\n  return `\n    <div class=\"card\">\n      ${workVisual('/assets/emc-uniforme-interior.png', 'Servicio profesional EMC', 'Pintores con playera azul, logo amarillo y gorra trabajando con protección y control de calidad.')}\n      <h2>Datos del cliente</h2>\n      <p class=\"muted\">Estos datos ayudan a EMC a contactarte y validar la zona del servicio antes de confirmar agenda.</p>\n      <div class=\"form-grid\">\n        ${input('client.name', 'Nombre completo', 'text', 'required autocomplete=\"name\"')}\n        ${input('client.phone', 'Teléfono WhatsApp', 'tel', 'required inputmode=\"tel\" autocomplete=\"tel\"')}\n        ${input('client.email', 'Correo opcional', 'email')}\n        ${input('client.address', 'Dirección', 'text', 'required')}\n        ${input('client.city', 'Ciudad', 'text', 'required')}\n        ${select('client.propertyType', 'Tipo de inmueble', ['Casa', 'Oficina', 'Local', 'Bodega', 'Edificio', 'Otro'])}\n      </div>\n      ${navActions()}\n    </div>\n  `;\n}\n\nfunction stepProject() {\n  const p = state.quote.project;\n  const access = autoAccess();\n  const projectVisual = {\n    Interior: {\n      src: '/assets/emc-uniforme-interior.png',\n      title: 'Trabajo interior',\n      caption: 'Pintores EMC uniformados trabajando en interiores; captura los m² interiores para cotizar correctamente.'\n    },\n    Exterior: {\n      src: '/assets/emc-uniforme-exterior.png',\n      title: 'Trabajo exterior',\n      caption: 'Pintores EMC uniformados trabajando en exterior; captura los m² exteriores, altura y acceso.'\n    },\n    'Interior y exterior': {\n      src: '/assets/emc-uniforme-exterior.png',\n      title: 'Trabajo interior y exterior',\n      caption: 'Separa m² interiores y exteriores para calcular alcance, acceso y cotización con mayor precisión.'\n    }\n  }[p.applicationType] || {\n    src: '/assets/emc-uniforme-interior.png',\n    title: 'Detalles del proyecto',\n    caption: 'Captura los metros y condiciones del servicio.'\n  };\n  return `\n    <div class=\"card visual-card project-visual\">\n      ${workVisual(projectVisual.src, projectVisual.title, projectVisual.caption)}\n      <div>\n        <h2>Detalles del proyecto</h2>\n        <p class=\"muted\">Captura los metros según el tipo de aplicación. Si es interior y exterior, separa los m² para que la recomendación y la cotización sean congruentes.</p>\n      </div>\n      <div class=\"form-grid\">\n        ${select('project.applicationType', 'Tipo de aplicación', ['Interior', 'Exterior', 'Interior y exterior'])}\n        ${p.applicationType === 'Interior' ? input('project.interiorSquareMeters', 'm² interiores', 'number', 'min=\"1\" inputmode=\"decimal\"') : ''}\n        ${p.applicationType === 'Exterior' ? input('project.exteriorSquareMeters', 'm² exteriores', 'number', 'min=\"1\" inputmode=\"decimal\"') : ''}\n        ${p.applicationType === 'Interior y exterior' ? `\n          ${input('project.interiorSquareMeters', 'm² interiores', 'number', 'min=\"0\" inputmode=\"decimal\"')}\n          ${input('project.exteriorSquareMeters', 'm² exteriores', 'number', 'min=\"0\" inputmode=\"decimal\"')}\n        ` : ''}\n        ${input('project.floors', 'Número de plantas', 'number', 'min=\"1\" inputmode=\"numeric\"')}\n        ${input('project.heightMeters', 'Altura aproximada en metros', 'number', 'min=\"1\" step=\"0.1\" inputmode=\"decimal\"')}\n      </div>\n      <div class=\"risk-rule\">\n        <span>Equipo de acceso</span>\n        <strong>${access.pending ? 'Pendiente de revisión' : access.scaffold ? 'Requiere revisión de acceso especial' : access.ladder ? 'Acceso con escalera o extensión' : 'Acceso normal'}</strong>\n        <small>EMC confirmará el acceso antes de agendar. Si se requiere andamio, se cotizará como costo adicional trasladable al cliente.</small>\n      </div>\n      ${navActions()}\n    </div>\n  `;\n}\n\nfunction stepPhotos() {\n  const aiConfigured = Boolean(state.aiStatus?.configured);\n  return `\n    <div class=\"card\">\n      ${workVisual('/assets/emc-uniforme-diagnostico.png', 'Fotos para revisión EMC', 'Las fotos ayudan a validar daño, acceso y alcance antes de confirmar el servicio.')}\n      <h2>Fotos del proyecto</h2>\n      <p class=\"muted\">Sube mínimo 4 fotos y máximo 10. Las fotos se usan para revisión preliminar durante la captura; por privacidad no se guardan en la cotización pública.</p>\n      <div class=\"photo-checklist\">\n        ${requiredPhotos.map((label, index) => `<span class=\"${state.quote.photos[index] ? 'done' : ''}\">${state.quote.photos[index] ? '✓' : index + 1} ${label}</span>`).join('')}\n      </div>\n      <div class=\"photo-grid\">\n        ${requiredPhotos.map((label, index) => photoInput(label, index)).join('')}\n      </div>\n      <label style=\"margin-top:12px;\">Fotos adicionales\n        <input type=\"file\" accept=\"image/*\" multiple data-extra-photos>\n      </label>\n      <p class=\"muted\">${state.quote.photos.length}/10 fotos cargadas</p>\n      ${photoAnalysisPanel()}\n      ${navActions()}\n    </div>\n  `;\n}\n\nfunction photoAnalysisPanel() {\n  if (!state.aiStatus?.configured && !state.photoAnalysis) {\n    return `\n      <div class=\"notice\" style=\"margin-top:12px;\">\n        Las fotos serán revisadas por EMC antes de confirmar el nivel de servicio. Con fotos cargadas, Básico no se confirma automáticamente.\n      </div>\n    `;\n  }\n  if (state.analyzingPhotos) {\n    return '<div class=\"notice\" style=\"margin-top:12px;\">Analizando fotos automáticamente...</div>';\n  }\n  const analysis = state.photoAnalysis;\n  if (!analysis) {\n    return '<div class=\"notice\" style=\"margin-top:12px;\">Cuando cargues las 4 fotos mínimas, el sistema las analizará automáticamente. EMC debe confirmar antes de ejecutar.</div>';\n  }\n  const visibleMinimum = customerMinimumLevel();\n  const level = visibleMinimum && levels[visibleMinimum] ? levels[visibleMinimum].label : 'No definido';\n  const isAutomatic = Boolean(analysis.enabled);\n  const title = isAutomatic ? 'Análisis visual IA' : 'Revisión visual EMC';\n  const confidenceRow = isAutomatic\n    ? `<div class=\"summary-line\"><span>Confianza</span><strong>${Math.round(Number(analysis.confidence || 0) * 100)}%</strong></div>`\n    : '';\n  return `\n    <div class=\"assistant-panel\">\n      <span>${title}</span>\n      <strong>${analysis.summary || 'Análisis preliminar terminado.'}</strong>\n      <div class=\"summary-line\"><span>Calidad de fotos</span><strong>${analysis.photoQuality || '-'}</strong></div>\n      <div class=\"summary-line\"><span>Nivel mínimo recomendado</span><strong>${level}</strong></div>\n      ${confidenceRow}\n      <h3>Señales detectadas</h3>\n      <ul class=\"clean-list compact\">\n        ${(analysis.signals || []).map(signal => `<li>${signal.type || 'señal'} · ${signal.severity || '-'}: ${signal.evidence || ''}</li>`).join('') || '<li>Sin señales visuales fuertes.</li>'}\n      </ul>\n      <h3>Alertas</h3>\n      <ul class=\"clean-list compact\">\n        ${(analysis.alerts || []).map(item => `<li>${item}</li>`).join('') || '<li>Sin alertas visuales fuertes.</li>'}\n      </ul>\n    </div>\n  `;\n}\n\nfunction photoInput(label, index) {\n  const photo = state.quote.photos[index];\n  return `\n    <div class=\"photo-tile\">\n      <label>${label}<input type=\"file\" accept=\"image/*\" data-photo-index=\"${index}\"></label>\n      ${photo ? `<img src=\"${photo.dataUrl}\" alt=\"${label}\">` : ''}\n    </div>\n  `;\n}\n\nfunction stepRecommendation(calc) {\n  const recommended = levels[calc.recommendedLevel];\n  const recommendedRate = money(state.config.labor?.[calc.recommendedLevel] || recommended.price);\n  const minimumText = calc.recommendedLevel === 'premium'\n    ? 'El sistema recomienda mínimo Plus'\n    : `El sistema recomienda mínimo ${recommended.label}`;\n  return `\n    <div class=\"card center-card visual-card recommendation-visual\">\n      ${workVisual('/assets/emc-uniforme-interior.png', 'Recomendación por nivel de servicio', 'El sistema revisa fotos, área y acceso para recomendar el alcance correcto.')}\n      <div class=\"success-mark small\">✓</div>\n      <h2>Recomendación del sistema EMC</h2>\n      <p class=\"muted\">${minimumText} con los datos, condiciones y fotos capturadas para controlar alcance, riesgo y resultado.</p>\n      <div class=\"recommendation-box\">\n        <span>Servicio recomendado mínimo</span>\n        <strong>${recommended.label} · ${recommendedRate}/m²</strong>\n        <p>${recommended.short}</p>\n      </div>\n      ${calc.recommendedLevel === 'premium' ? premiumRecommendationDetail() : ''}\n      <button class=\"btn btn-ghost\" data-modal=\"recommendation\" type=\"button\">Explicación de por qué el nivel</button>\n      <p class=\"service-change-question\">¿Deseas escoger otro nivel de servicio?</p>\n      <div class=\"actions recommendation-actions\">\n        <button class=\"btn btn-primary\" data-action=\"accept-recommendation\" type=\"button\">Aceptar recomendación de sistema EMC</button>\n        <button class=\"btn btn-ghost\" data-action=\"choose-service\" type=\"button\">Escoger otro tipo de servicio</button>\n      </div>\n      ${state.showServiceOptions ? serviceChoicePanel(calc) : ''}\n      <div class=\"actions single\">\n        <button class=\"btn btn-ghost\" data-action=\"prev\">Atrás</button>\n      </div>\n    </div>\n  `;\n}\n\nfunction premiumRecommendationDetail() {\n  return `\n    <div class=\"premium-explain\">\n      <h3>Qué cubre Plus</h3>\n      <p>Plus se recomienda cuando la superficie puede requerir recuperación, preparación profunda o mayor control de calidad antes de pintar. Está pensado para muros con señales de deterioro, humedad, desprendimiento, resanes importantes, sellador o acabados donde pintar encima podría provocar reclamos.</p>\n      <ul class=\"clean-list compact\">\n        <li>Raspado donde sea necesario para retirar material suelto.</li>\n        <li>Resane completo de zonas dañadas conforme al alcance confirmado.</li>\n        <li>Sellador cuando la superficie lo requiera.</li>\n        <li>Preparación integral antes de aplicar pintura.</li>\n        <li>Protección detallada del área y revisión final EMC.</li>\n      </ul>\n    </div>\n  `;\n}\n\nfunction serviceChoicePanel(calc) {\n  return `\n    <div class=\"service-choice-panel\">\n      <h3>Escoge nivel de servicio</h3>\n      <p class=\"muted\">Puedes elegir un nivel distinto por presupuesto. Si eliges uno menor al recomendado, EMC lo registrará como alcance limitado.</p>\n      <div class=\"service-choice-grid\">\n        ${Object.entries(levels).map(([key, level]) => {\n          const allowed = isLevelAllowed(key);\n          return `\n            <div class=\"service-choice-card ${key === calc.recommendedLevel ? 'recommended' : ''} ${allowed ? '' : 'limited'}\" title=\"${level.when}\">\n              <span>${key === calc.recommendedLevel ? 'Recomendado por EMC' : 'Nivel disponible'}</span>\n              <h4>${level.label}</h4>\n              <strong>${money(state.config.labor[key])} / m²</strong>\n              <p>${level.short}</p>\n              <small>${level.scope}</small>\n              ${allowed ? '' : '<small class=\"lock-note\">Alcance limitado: el análisis visual recomienda un nivel superior.</small>'}\n              <button class=\"btn btn-ghost\" data-service-detail=\"${key}\" type=\"button\">Ver servicio extendido</button>\n              <button class=\"btn btn-primary\" data-select-service-level=\"${key}\" type=\"button\">Aceptar nivel de servicio</button>\n            </div>\n          `;\n        }).join('')}\n      </div>\n      <button class=\"btn btn-dark full-btn\" data-action=\"accept-recommendation\" type=\"button\">Aceptar recomendación de sistema EMC</button>\n    </div>\n  `;\n}\n\nfunction assistantPanel(assistant) {\n  const questions = assistant.questions.length ? assistant.questions : ['No hay preguntas críticas pendientes con los datos actuales.'];\n  const alerts = assistant.alerts.length ? assistant.alerts : ['No se detectaron alertas fuertes, sujeto a revisión de EMC.'];\n  return `\n    <div class=\"assistant-panel\">\n      <span>Asistente EMC</span>\n      <strong>${assistant.summary}</strong>\n      <h3>Preguntas útiles</h3>\n      <ul class=\"clean-list compact\">\n        ${questions.map(item => `<li>${item}</li>`).join('')}\n      </ul>\n      <h3>Alertas técnicas</h3>\n      <ul class=\"clean-list compact\">\n        ${alerts.map(item => `<li>${item}</li>`).join('')}\n      </ul>\n    </div>\n  `;\n}\n\nfunction stepSupply(calc) {\n  const q = state.quote;\n  const paintDetails = paintMaterialDetails(calc);\n  const sealerDetails = sealerMaterialDetails(calc);\n  return `\n    <div class=\"card visual-card supply-visual\">\n      ${workVisual('/assets/emc-uniforme-interior.png', 'Materiales y suministro', 'Pintura, sellador y consumibles se calculan y trasladan al cliente según alcance.')}\n      <h2>Suministro de pintura</h2>\n      <p class=\"muted\">Elige si EMC cotiza y suministra pintura/sellador o si el cliente proporcionará los materiales.</p>\n      <div class=\"material-summary material-ledger\" style=\"margin-top:16px;\">\n        <div>\n          <span>${q.service.selectedLevel ? 'Nivel elegido' : 'Nivel recomendado'}</span>\n          <strong>${levels[q.service.selectedLevel || calc.recommendedLevel].label}</strong>\n          <small>${calc.coats} manos de pintura.</small>\n        </div>\n        <div>\n          <span>Pintura estimada</span>\n          <strong>${calc.liters.toFixed(1)} L</strong>\n          <small>${paintDetails.buckets} para suministro EMC.</small>\n          <small>${paintDetails.formula} · ${paintDetails.cost}</small>\n        </div>\n        <div>\n          <span>Sellador estimado</span>\n          <strong>${calc.sealerLiters ? `${calc.sealerLiters.toFixed(1)} L` : 'No requerido'}</strong>\n          <small>${sealerDetails ? `${sealerDetails.buckets} para suministro EMC.` : 'Según nivel elegido y revisión visual.'}</small>\n          ${sealerDetails ? `<small>${sealerDetails.formula} · ${sealerDetails.cost}</small>` : ''}\n        </div>\n      </div>\n      <div class=\"supply-grid\">\n        <button class=\"supply-card ${q.service.paintSupply === 'emc' ? 'selected' : ''}\" data-paint-supply=\"emc\" type=\"button\">\n          <strong>Deseo que EMC cotice pintura</strong>\n          <span>Seleccionar pintura y sellador.</span>\n          <small class=\"supply-help\">EMC calcula y cotiza pintura/sellador según área, nivel de servicio y rendimiento del material seleccionado.</small>\n        </button>\n        <button class=\"supply-card ${q.service.paintSupply === 'cliente' ? 'selected' : ''}\" data-client-supply-continue type=\"button\">\n          <strong>El cliente proporcionará la pintura</strong>\n          <span>Continuar sin agregar pintura.</span>\n          <small class=\"supply-help\">EMC no se hace responsable por calidad, tono, rendimiento, cobertura o garantía de pintura/sellador comprado por el cliente.</small>\n        </button>\n      </div>\n      ${q.service.paintSupply === 'emc' ? `\n        <h3 style=\"margin-top:18px;\">Opciones de pintura</h3>\n        <div class=\"paint-catalog\">\n          ${state.config.paints.filter(p => p.active).map(paint => paintCard(paint)).join('')}\n        </div>\n        ${q.service.paintId ? `\n          <div class=\"form-grid compact-config\">\n            <label>Cantidad de cubetas de pintura\n              <input data-path=\"service.paintBucketsOverride\" type=\"number\" min=\"1\" inputmode=\"numeric\" value=\"${q.service.paintBucketsOverride || calc.buckets}\">\n            </label>\n          </div>\n        ` : ''}\n        ${calc.sealerLiters ? `\n          <h3 style=\"margin-top:18px;\">Opciones de sellador</h3>\n          <div class=\"paint-catalog sealer-catalog\">\n            ${(state.config.sealers || []).filter(s => s.active).map(sealer => sealerCard(sealer)).join('')}\n          </div>\n          ${q.service.sealerId ? `\n            <div class=\"form-grid compact-config\">\n              <label>Cantidad de cubetas de sellador\n                <input data-path=\"service.sealerBucketsOverride\" type=\"number\" min=\"1\" inputmode=\"numeric\" value=\"${q.service.sealerBucketsOverride || calc.sealerBuckets}\">\n              </label>\n            </div>\n          ` : ''}\n        ` : '<div class=\"notice\" style=\"margin-top:14px;\">Este servicio no requiere sellador por defecto. EMC podrá recomendarlo si la revisión visual detecta una superficie que lo necesita.</div>'}\n      ` : ''}\n      <div class=\"quote-section supply-payment\">\n        <h3>Factura y forma de pago</h3>\n        <div class=\"form-grid compact-config\">\n          <label>Factura\n            <select data-path=\"service.invoice\">\n              <option value=\"false\" ${q.service.invoice ? '' : 'selected'}>Sin factura</option>\n              <option value=\"true\" ${q.service.invoice ? 'selected' : ''}>Con factura + IVA</option>\n            </select>\n          </label>\n        </div>\n        <button class=\"field-button\" data-modal=\"payments\" type=\"button\">${q.service.paymentMethod}</button>\n        <div class=\"payment-preview\" style=\"margin-top:12px;\">${paymentPreview(calc)}</div>\n      </div>\n      ${navActions('Ver cotización')}\n    </div>\n  `;\n}\n\nfunction materialLineForLevel(level) {\n  const estimate = materialEstimateForLevel(level);\n  const sealerText = estimate.sealerLiters\n    ? ` Sellador estimado ${estimate.sealerLiters.toFixed(1)} L (${estimate.sealerBuckets} cubeta${estimate.sealerBuckets > 1 ? 's' : ''} de ${estimate.sealerPresentation} L aprox.).`\n    : ' No requiere sellador por defecto.';\n  return `${estimate.coats} manos · Pintura estimada ${estimate.paintLiters.toFixed(1)} L (${estimate.paintBuckets} cubeta${estimate.paintBuckets > 1 ? 's' : ''} de ${estimate.paintPresentation} L aprox.).${sealerText}`;\n}\n\nfunction materialRecommendation(calc) {\n  return `\n    <div class=\"material-summary\">\n      <div>\n        <span>${state.quote.service.selectedLevel ? 'Nivel elegido' : 'Nivel recomendado'}</span>\n        <strong>${levels[state.quote.service.selectedLevel || calc.recommendedLevel].label}</strong>\n        <small>${calc.coats} manos de pintura</small>\n      </div>\n      <div>\n        <span>Pintura necesaria</span>\n        <strong>${calc.liters.toFixed(1)} L</strong>\n        <small>${calc.buckets} cubeta${calc.buckets !== 1 ? 's' : ''} de ${calc.paintPresentation} L aprox.</small>\n        <small>Área total · ${calc.coats} manos · rendimiento ${calc.paintYield} m²/L</small>\n      </div>\n      <div>\n        <span>Sellador</span>\n        <strong>${calc.sealerLiters ? `${calc.sealerLiters.toFixed(1)} L` : 'No requerido'}</strong>\n        <small>${calc.sealerLiters ? `${calc.sealerBuckets} cubeta${calc.sealerBuckets !== 1 ? 's' : ''} de ${calc.sealerPresentation} L aprox.${calc.sealer ? '' : ' · Selecciona sellador para cotizarlo'}` : 'Puede omitirse si la superficie está sana.'}</small>\n      </div>\n    </div>\n    ${calc.sealerLiters ? `\n      <h3 style=\"margin-top:14px;\">Opciones de sellador</h3>\n      <div class=\"paint-catalog sealer-catalog\">\n        ${(state.config.sealers || []).filter(s => s.active).map(sealer => sealerCard(sealer)).join('')}\n      </div>\n    ` : '<p class=\"muted\">Si EMC detecta una superficie porosa o con riesgo técnico, podrá recomendar sellador antes de iniciar.</p>'}\n  `;\n}\n\nfunction sealerCard(sealer) {\n  const selected = state.quote.service.sealerId === sealer.id;\n  const visual = sealer.image\n    ? `<img class=\"paint-photo\" src=\"${sealer.image}\" alt=\"${sealer.brand} ${sealer.name}\">`\n    : `<span class=\"paint-can premium\"><b>${sealer.brand}</b><small>SELLADOR</small></span>`;\n  return `\n    <button class=\"paint-card ${selected ? 'selected' : ''}\" data-pick-sealer=\"${sealer.id}\" type=\"button\">\n      <span class=\"paint-visual\">${visual}</span>\n      <span class=\"paint-info\">\n        <span class=\"paint-brand\">${sealer.brand}</span>\n        <strong>${sealer.name}</strong>\n        <span class=\"paint-price\">${money(sealer.price)}</span>\n        <small>${sealer.category} · ${sealer.presentation} L · Rinde aprox. ${sealer.yieldPerLiter} m²/L</small>\n        <small>${sealer.source} · ${sealer.updatedAt}</small>\n        <span class=\"paint-select\">${selected ? 'Seleccionado' : 'Seleccionar'}</span>\n      </span>\n    </button>\n  `;\n}\n\nfunction paintCard(paint) {\n  const selected = state.quote.service.paintId === paint.id;\n  const source = paint.source?.toLowerCase().includes('carga manual') ? 'Referencia de costo' : paint.source;\n  const visual = paint.image\n    ? `<img class=\"paint-photo\" src=\"${paint.image}\" alt=\"${paint.brand} ${paint.category}\">`\n    : `<span class=\"paint-can ${paint.category.toLowerCase()}\"><b>${paint.brand}</b><small>${paint.category}</small></span>`;\n  return `\n    <button class=\"paint-card ${selected ? 'selected' : ''}\" data-pick-paint=\"${paint.id}\" type=\"button\">\n      <span class=\"paint-visual\">${visual}</span>\n      <span class=\"paint-info\">\n        <span class=\"paint-brand\">${paint.brand}</span>\n        <strong>${paint.category}</strong>\n        <span class=\"paint-price\">${money(paint.price)}</span>\n        <small>Cubeta ${paint.presentation} L · Rinde aprox. ${paint.yieldPerLiter} m²/L a 2 manos</small>\n        <small>${source} · ${paint.updatedAt}</small>\n        <span class=\"paint-select\">${selected ? 'Seleccionada' : 'Seleccionar'}</span>\n      </span>\n    </button>\n  `;\n}\n\nfunction crewInline(calc) {\n  return `\n    <div class=\"crew-grid\">\n      ${[1, 2, 3, 4].map(count => {\n        const estimate = estimateDays(calc.level, count);\n        return `\n          <button class=\"crew-card ${state.quote.service.painters === count ? 'selected' : ''}\" data-pick-crew=\"${count}\" type=\"button\">\n            <strong>${count}</strong>\n            <span>pintor${count > 1 ? 'es' : ''}</span>\n            <small>${estimate.days} día(s)</small>\n          </button>\n        `;\n      }).join('')}\n    </div>\n    <div class=\"notice\" style=\"margin-top:12px;\">Con ${state.quote.service.painters} pintor(es), el avance de referencia es de ${Math.round(calc.dailyAdvance)} m² por jornada de 8 horas y el servicio tomaría aproximadamente ${calc.estimatedDays} día(s), según nivel elegido y condiciones capturadas.</div>\n  `;\n}\n\nfunction paymentPreview(calc) {\n  const q = state.quote;\n  const p = state.config.payments;\n  if (q.service.invoice) {\n    return `\n      <strong>Con factura</strong>\n      <span>Pago único permitido: transferencia bancaria / SPEI.</span>\n      <small>Banco: ${p.bank} · Titular: ${p.accountHolder} · CLABE: ${p.clabe}</small>\n      <small>Monto con IVA: ${money(calc.total)}</small>\n    `;\n  }\n  if (q.service.paymentMethod === 'DAI Bitso a Bitso') {\n    if (!daiPaymentAvailable()) {\n      return `\n        <strong>Sin factura · DAI no disponible</strong>\n        <span>El pago en DAI Bitso a Bitso está desactivado o incompleto en este momento.</span>\n        <small>Total a pagar: ${money(calc.total)}</small>\n      `;\n    }\n    return `\n      <strong>Sin factura · DAI Bitso a Bitso</strong>\n      <span>Solo DAI por transferencia interna Bitso a Bitso. No XRP, no USDT, no wallets externas.</span>\n      <small>Total: ${money(calc.total)} · Equivalente: ${calc.dai.toFixed(2)} DAI</small>\n      <small>Cuenta Bitso: ${p.bitsoUser} · Vigencia: ${p.daiValidityMinutes} min.</small>\n    `;\n  }\n  return `\n    <strong>Sin factura · Efectivo</strong>\n    <span>Disponible para servicios sin factura. EMC confirma condiciones antes del inicio.</span>\n    <small>Total a pagar: ${money(calc.total)}</small>\n  `;\n}\n\nfunction stepSummary(calc) {\n  return `\n    <div class=\"quote-document\">\n      ${summary(calc)}\n      ${clientQuoteProcess(calc)}\n      <div class=\"client-check\">\n        <strong>Condiciones antes de agendar</strong>\n        <span>EMC revisará fotos, medidas, accesos y daños declarados antes de agendar.</span>\n        <span>Si hay daño oculto, cambio de alcance o medidas diferentes, el precio puede ajustarse antes del inicio.</span>\n      </div>\n      <div class=\"quote-validity\">Vigencia: 15 días naturales. La cotización se basa en los datos, medidas, fotos y condiciones capturadas por el cliente.</div>\n      <div class=\"quote-section feedback-section\">\n        <h3>Comentarios para mejorar</h3>\n        <p class=\"muted\">Tu opinión ayuda a EMC a mejorar esta página. Escribe qué te gustó, qué no te gustó o qué te gustaría ver antes de aceptar la cotización.</p>\n        <label>Comentarios del cliente\n          <textarea data-path=\"observations\" placeholder=\"Ej. Me gustaría ver más opciones de pintura, explicar mejor el cálculo, agregar fotos de trabajos, cambiar algo del diseño...\">${state.quote.observations || ''}</textarea>\n        </label>\n      </div>\n      <div class=\"actions quote-actions\">\n        <button class=\"btn btn-ghost\" data-action=\"prev\">Modificar</button>\n        <button class=\"btn btn-ghost\" data-action=\"print-pdf\">Imprimir / guardar PDF</button>\n        <button class=\"btn btn-primary\" data-action=\"accept\">Aceptar cotización</button>\n      </div>\n      <div class=\"actions single\">\n        <button class=\"btn btn-ghost\" data-action=\"home\">Cancelar</button>\n      </div>\n    </div>\n  `;\n}\n\nfunction clientQuoteProcess(calc) {\n  const q = state.quote;\n  return `\n    <div class=\"quote-section quote-process\">\n      <h3>Proceso EMC aplicado</h3>\n      <div class=\"process-ledger\">\n        <div>\n          <span>1. Datos capturados</span>\n          <strong>${projectSquareMeters()} m² · ${q.project.applicationType}</strong>\n          <small>Medidas, altura, ciudad y tipo de inmueble.</small>\n        </div>\n        <div>\n          <span>2. Revisión visual</span>\n          <strong>${q.photos.length} foto${q.photos.length !== 1 ? 's' : ''}</strong>\n          <small>Las fotos orientan la recomendación antes de confirmar agenda.</small>\n        </div>\n        <div>\n          <span>3. Servicio recomendado</span>\n          <strong>${levels[calc.recommendedLevel].label}</strong>\n          <small>El cliente puede aceptar EMC o elegir otro nivel.</small>\n        </div>\n        <div>\n          <span>4. Cotización final</span>\n          <strong>${money(calc.total)}</strong>\n          <small>Servicio, pintura si aplica, IVA según selección y comentarios.</small>\n        </div>\n      </div>\n    </div>\n  `;\n}\n\nfunction summary(calc) {\n  const q = state.quote;\n  const m2 = projectSquareMeters();\n  const paintDetails = paintMaterialDetails(calc);\n  const sealerDetails = sealerMaterialDetails(calc);\n  const areaDetails = q.project.applicationType === 'Interior y exterior'\n    ? `\n      <div class=\"summary-line\"><span>m² interiores</span><strong>${q.project.interiorSquareMeters || 0} m²</strong></div>\n      <div class=\"summary-line\"><span>m² exteriores</span><strong>${q.project.exteriorSquareMeters || 0} m²</strong></div>\n    `\n    : '';\n  const accessText = calc.scaffoldRequired\n    ? 'Andamio / escalera larga'\n    : calc.ladder\n      ? 'Escalera o extensión'\n      : 'Acceso normal';\n  const paintText = q.service.paintSupply === 'cliente'\n    ? 'Cliente suministra pintura'\n    : (calc.paint ? `${calc.paint.brand} ${calc.paint.category}` : 'Pendiente de seleccionar');\n  const sealerText = calc.sealerLiters\n    ? (calc.sealer ? `${calc.sealer.brand} ${calc.sealer.name}` : 'Pendiente de seleccionar')\n    : 'No requerido';\n  const scopeNote = isBelowMinimum(calc.level)\n    ? `<div class=\"notice danger-note\">Alcance limitado: la recomendación mínima del sistema era ${levels[calc.recommendedLevel].label}, pero el cliente eligió ${levels[calc.level].label} por presupuesto.</div>`\n    : '';\n  const paintCoatFactor = calc.coats / Math.max(1, calc.paintYieldBaseCoats);\n  const paintFormula = paintCoatFactor === 1\n    ? paintDetails.formula\n    : `${m2} m² / ${calc.paintYield} m²/L × ${paintCoatFactor.toFixed(2)} ajuste por ${calc.coats} manos = ${calc.liters.toFixed(1)} L`;\n  return `\n    <div class=\"quote-header\">\n      <img src=\"/assets/emc-logo.jpg\" alt=\"EMC Pintura\">\n      <div>\n        <span>Cotización de servicio</span>\n        <strong>EMC Servicios y Suministros · División Pintura</strong>\n        <small>Fecha: ${today()} · Vigencia 15 días</small>\n      </div>\n    </div>\n    <div class=\"quote-total-hero\">\n      <span>Total estimado</span>\n      <strong>${money(calc.total)}</strong>\n      <small>${q.service.invoice ? 'Incluye IVA 16%' : 'Sin factura'}</small>\n    </div>\n    <div class=\"quote-kpis\">\n      <div><span>Cliente</span><strong>${q.client.name || 'Pendiente'}</strong></div>\n      <div><span>Área</span><strong>${m2} m²</strong></div>\n      <div><span>Servicio</span><strong>${levels[calc.level].label}</strong></div>\n      <div><span>Tiempo</span><strong>${calc.estimatedDays} día(s)</strong></div>\n    </div>\n    <div class=\"quote-layout\">\n      <div class=\"quote-section\">\n        <h3>Datos del proyecto</h3>\n        <div class=\"summary-line\"><span>Teléfono</span><strong>${q.client.phone || 'Pendiente'}</strong></div>\n        <div class=\"summary-line\"><span>Dirección</span><strong>${q.client.address || 'Pendiente'}</strong></div>\n        <div class=\"summary-line\"><span>Ciudad</span><strong>${q.client.city || 'Pendiente'}</strong></div>\n        <div class=\"summary-line\"><span>Altura</span><strong>${q.project.heightMeters} m</strong></div>\n        <div class=\"summary-line\"><span>Aplicación</span><strong>${q.project.applicationType}</strong></div>\n        ${areaDetails}\n        <div class=\"summary-line\"><span>Equipo de acceso</span><strong>${accessText}</strong></div>\n      </div>\n      <div class=\"quote-section\">\n        <h3>Servicio incluido</h3>\n        <div class=\"summary-line\"><span>Recomendado</span><strong>${levels[calc.recommendedLevel].label}</strong></div>\n        <div class=\"summary-line\"><span>Elegido</span><strong>${levels[calc.level].label}</strong></div>\n        ${scopeNote}\n        <p class=\"quote-scope\">${levels[calc.level].scope}</p>\n        <div class=\"quote-chips\">\n          ${levels[calc.level].includes.map(item => `<span>${item}</span>`).join('')}\n        </div>\n      </div>\n    </div>\n    <div class=\"quote-section\">\n      <h3>Materiales y alcance</h3>\n      <div class=\"summary-line\"><span>Pintura</span><strong>${paintText}</strong></div>\n      <div class=\"summary-line\"><span>Sellador</span><strong>${sealerText}</strong></div>\n      <div class=\"summary-line\"><span>Rendimiento pintura</span><strong>${calc.paintYield} m²/L a ${calc.paintYieldBaseCoats} manos</strong></div>\n      <div class=\"quote-note\"><strong>Cálculo de pintura:</strong> ${paintFormula}</div>\n      <div class=\"summary-line\"><span>Pintura estimada</span><strong>${calc.liters.toFixed(1)} L · ${paintDetails.buckets}</strong></div>\n      ${sealerDetails ? `<div class=\"quote-note\"><strong>Cálculo de sellador:</strong> ${sealerDetails.formula}</div>` : ''}\n      <div class=\"summary-line\"><span>Sellador estimado</span><strong>${sealerDetails ? `${calc.sealerLiters.toFixed(1)} L · ${sealerDetails.buckets}` : 'No requerido'}</strong></div>\n    </div>\n    ${quoteCostBreakdown(calc)}\n    <div class=\"quote-section\">\n      <h3>Pago</h3>\n      <div class=\"summary-line\"><span>Forma de pago</span><strong>${q.service.paymentMethod}</strong></div>\n      <div class=\"summary-line\"><span>Factura</span><strong>${q.service.invoice ? 'Sí, incluye IVA' : 'No solicitada'}</strong></div>\n      ${q.service.invoice ? bankInfo(calc) : cryptoInfo(calc)}\n    </div>\n  `;\n}\n\nfunction quoteCostBreakdown(calc) {\n  const q = state.quote;\n  const ivaLabel = q.service.invoice ? `IVA ${state.config.adjustments.ivaPct}%` : 'IVA';\n  const m2 = projectSquareMeters();\n  const serviceTotal = Number(calc.serviceSubtotalWithoutPaint || 0);\n  const scaffoldCost = Number(calc.accessEquipmentCost || calc.scaffold || calc.singleAdditionalAmount || 0);\n  const paintToSupply = Number(calc.paintCost || 0) + Number(calc.sealerCost || 0);\n  const paintSupplyText = q.service.paintSupply === 'cliente'\n    ? 'No agregado: pintura proporcionada por cliente'\n    : `${calc.buckets} cubeta${calc.buckets !== 1 ? 's' : ''} de ${calc.paintPresentation} L (${calc.liters.toFixed(1)} L estimados)${calc.sealerCost ? ` + ${calc.sealerBuckets} cubeta${calc.sealerBuckets !== 1 ? 's' : ''} de sellador de ${calc.sealerPresentation} L` : ''}`;\n  return `\n    <div class=\"quote-section cost-section\">\n      <h3>Resumen de costos</h3>\n      <div class=\"cost-table\">\n        <div class=\"cost-row header\"><span>Concepto</span><strong>Importe</strong></div>\n        <div class=\"cost-row\"><span>Servicio ${levels[calc.level].label} (${m2} m² × ${money(calc.saleRate)}/m²)</span><strong>${money(serviceTotal)}</strong></div>\n        <div class=\"cost-row\"><span>Pintura a suministrar (${paintSupplyText})</span><strong>${money(paintToSupply)}</strong></div>\n        ${scaffoldCost ? `<div class=\"cost-row\"><span>Andamio / acceso especial requerido</span><strong>${money(scaffoldCost)}</strong></div>` : ''}\n        <div class=\"cost-row subtotal\"><span>Subtotal</span><strong>${money(calc.subtotal)}</strong></div>\n        <div class=\"cost-row\"><span>${ivaLabel}</span><strong>${q.service.invoice ? money(calc.iva) : 'No agregado'}</strong></div>\n        <div class=\"cost-row total-row\"><span>Total ${q.service.invoice ? 'con IVA' : 'sin IVA'}</span><strong>${money(calc.total)}</strong></div>\n      </div>\n      <p class=\"quote-note\">El precio del servicio incluye operación EMC, transporte, herramientas, supervisión básica y gestión de garantía. Pintura y sellador se cotizan por separado cuando EMC los suministra.</p>\n    </div>\n  `;\n}\n\nfunction bankInfo(calc) {\n  const p = state.config.payments;\n  return `\n    <div class=\"summary-line\"><span>Banco</span><strong>${p.bank}</strong></div>\n    <div class=\"summary-line\"><span>Titular</span><strong>${p.accountHolder}</strong></div>\n    <div class=\"summary-line\"><span>CLABE</span><strong>${p.clabe}</strong></div>\n    <div class=\"summary-line\"><span>Monto con IVA</span><strong>${money(calc.total)}</strong></div>\n  `;\n}\n\nfunction cryptoInfo(calc) {\n  const p = state.config.payments;\n  if (state.quote.service.paymentMethod !== 'DAI Bitso a Bitso' || !daiPaymentAvailable()) return '';\n  return `\n    <div class=\"summary-line\"><span>Total MXN</span><strong>${money(calc.total)}</strong></div>\n    <div class=\"summary-line\"><span>Equivalente DAI</span><strong>${calc.dai.toFixed(2)} DAI</strong></div>\n    <div class=\"summary-line\"><span>Cuenta Bitso</span><strong>${p.bitsoUser}</strong></div>\n    <div class=\"summary-line\"><span>Vigencia del cálculo</span><strong>${p.daiValidityMinutes} minutos</strong></div>\n  `;\n}\n\nfunction navActions(nextLabel = 'Continuar') {\n  return `\n    <div class=\"actions\">\n      <button class=\"btn btn-ghost\" data-action=\"prev\">Atrás</button>\n      <button class=\"btn btn-primary\" data-action=\"next\">${nextLabel}</button>\n    </div>\n  `;\n}\n\nfunction modal() {\n  if (!state.modal) return '';\n  return `\n    <div class=\"modal-backdrop\" data-action=\"close-modal\">\n      <div class=\"modal-sheet\" role=\"dialog\" aria-modal=\"true\" onclick=\"event.stopPropagation()\">\n        <button class=\"modal-close\" data-action=\"close-modal\">×</button>\n        ${modalContent()}\n      </div>\n    </div>\n  `;\n}\n\nfunction modalContent() {\n  if (state.modal === 'levels') return levelsModal();\n  if (state.modal === 'recommendation') return recommendationModal();\n  if (state.modal?.startsWith('service-')) return serviceDetailModal(state.modal.replace('service-', ''));\n  if (state.modal === 'paints') return paintsModal();\n  if (state.modal === 'payments') return paymentsModal();\n  if (state.modal === 'crew') return crewModal();\n  return '';\n}\n\nfunction serviceDetailModal(key) {\n  const level = levels[key] || levels.basico;\n  const needsAccess = autoAccess();\n  return `\n    <h2>${level.label}: ${level.short}</h2>\n    <p class=\"muted\">${level.when}</p>\n    <h3>Qué incluye</h3>\n    <ul class=\"clean-list\">${level.includes.map(item => `<li>${item}</li>`).join('')}</ul>\n    <h3>Alcance operativo</h3>\n    <p class=\"quote-scope\">${level.scope}</p>\n    <h3>Acceso y equipo</h3>\n    <p class=\"quote-scope\">${needsAccess.scaffold ? 'Por altura y exterior, EMC revisará el acceso antes de confirmar el inicio.' : needsAccess.ladder ? 'Por altura, EMC considera escalera o extensión dentro de su operación.' : 'Con los datos actuales se considera acceso normal.'}</p>\n    <h3>Tratamientos</h3>\n    <p class=\"quote-scope\">Si la superficie requiere mayor preparación, EMC lo integra dentro del nivel de servicio o en un cargo especial único cuando aplique.</p>\n  `;\n}\n\nfunction recommendationModal() {\n  const calc = calculate();\n  const recommended = levels[calc.recommendedLevel];\n  const recommendedRate = money(state.config.labor?.[calc.recommendedLevel] || recommended.price);\n  const title = calc.recommendedLevel === 'premium'\n    ? 'Por qué el sistema recomienda mínimo Plus'\n    : `Por qué EMC recomienda mínimo ${recommended.label}`;\n  return `\n    <h2>${title}</h2>\n    <p class=\"muted\">La recomendación combina análisis visual de fotos, condiciones de acceso, altura y tipo de aplicación. EMC aún confirmará el alcance antes de agendar.</p>\n    <div class=\"recommendation-box\">\n      <span>Nivel mínimo recomendado</span>\n      <strong>${recommended.label} · ${recommendedRate}/m²</strong>\n      <p>${recommended.short}</p>\n    </div>\n    <h3>Señales usadas</h3>\n    <ul class=\"clean-list\">\n      ${calc.reasons.map(reason => `<li>${reason}</li>`).join('')}\n    </ul>\n    <h3>Alertas técnicas</h3>\n    <ul class=\"clean-list compact\">\n      ${(calc.assistant.alerts || []).map(item => `<li>${item}</li>`).join('') || '<li>Sin alertas fuertes.</li>'}\n    </ul>\n    <h3>Qué significa el nivel</h3>\n    <p class=\"quote-scope\">${recommended.scope}</p>\n    ${calc.recommendedLevel === 'premium' ? premiumRecommendationDetail() : ''}\n  `;\n}\n\nfunction levelsModal() {\n  return `\n    <h2>Niveles de servicio</h2>\n    <p class=\"muted\">Elige según el estado real de la superficie. Esta comparación está escrita para que cualquier persona entienda qué paga, qué recibe y por qué cambia el precio.</p>\n    ${Object.entries(levels).map(([key, level]) => {\n      const allowed = isLevelAllowed(key);\n      return `\n      <button class=\"select-card ${state.quote.service.selectedLevel === key ? 'selected' : ''} ${allowed ? '' : 'limited'}\" data-pick-level=\"${key}\">\n        <strong>${level.label} · ${money(state.config.labor[key])} / m²</strong>\n        <span>${level.ideal || level.when}</span>\n        <small>${level.scope}</small>\n        <small><b>Incluye:</b> ${level.includes.join(', ')}.</small>\n        <small><b>No incluye:</b> ${(level.excludes || []).join(', ')}.</small>\n        <small>${levelExplanation(key)}</small>\n        ${allowed ? '' : '<small>Alcance limitado: el análisis visual recomienda un nivel superior para corrección completa.</small>'}\n      </button>\n    `;\n    }).join('')}\n  `;\n}\n\nfunction levelExplanation(key) {\n  const explanations = {\n    basico: 'En palabras simples: se usa cuando la pared está sana. No es para corregir daños fuertes. Sirve para renovar color y dejar limpio, pero no incluye tratamientos profundos.',\n    medio: 'En palabras simples: se usa cuando la pared necesita preparación real antes de pintar. Incluye trabajos para que la pintura agarre mejor y el resultado dure más que una aplicación sencilla.',\n    premium: 'En palabras simples: se usa cuando hay daño serio o se quiere un acabado más resistente. Es el servicio más completo porque prepara, trata, sella y pinta con más cuidado técnico.'\n  };\n  return explanations[key];\n}\n\nfunction paintsModal() {\n  return `\n    <h2>Marcas, tipos y precios</h2>\n    <p class=\"muted\">BEREL se usa como referencia principal. EMC confirmará disponibilidad y precio antes de agendar.</p>\n    ${state.config.paints.filter(paint => paint.active).map(paint => `\n      <button class=\"select-card ${state.quote.service.paintId === paint.id ? 'selected' : ''}\" data-pick-paint=\"${paint.id}\">\n        <strong>${paint.brand} · ${paint.category}</strong>\n        <span>${money(paint.price)} · Cubeta ${paint.presentation} L</span>\n        <small>Rendimiento: ${paint.yieldPerLiter} m²/L a 2 manos · ${paint.source?.toLowerCase().includes('carga manual') ? 'Referencia de costo' : `Fuente: ${paint.source}`} · Actualizado: ${paint.updatedAt}</small>\n      </button>\n    `).join('')}\n  `;\n}\n\nfunction paymentsModal() {\n  const q = state.quote;\n  const p = state.config.payments;\n  const calc = calculate();\n  const daiAvailable = daiPaymentAvailable();\n  return `\n    <h2>Forma de pago</h2>\n    <p class=\"muted\">La forma de pago depende de si requieres factura.</p>\n    ${q.service.invoice ? `\n      <button class=\"select-card selected\" data-pick-payment=\"Transferencia bancaria / SPEI\">\n        <strong>Transferencia bancaria / SPEI</strong>\n        <span>Disponible cuando requiere factura. Se agrega IVA del ${state.config.adjustments.ivaPct}%.</span>\n        <small>Banco: ${p.bank}</small>\n        <small>Titular: ${p.accountHolder}</small>\n        <small>CLABE: ${p.clabe}</small>\n        <small>Monto con IVA: ${money(calc.total)}</small>\n      </button>\n    ` : `\n      <button class=\"select-card ${q.service.paymentMethod === 'Efectivo' ? 'selected' : ''}\" data-pick-payment=\"Efectivo\">\n        <strong>Efectivo</strong>\n        <span>Disponible cuando no requiere factura.</span>\n        <small>Total: ${money(calc.total)}</small>\n        <small>EMC confirmará condiciones operativas antes de iniciar.</small>\n      </button>\n      <button class=\"select-card ${q.service.paymentMethod === 'DAI Bitso a Bitso' ? 'selected' : ''} ${daiAvailable ? '' : 'disabled'}\" ${daiAvailable ? 'data-pick-payment=\"DAI Bitso a Bitso\"' : ''}>\n        <strong>DAI Bitso a Bitso</strong>\n        <span>${daiAvailable ? 'Solo DAI mediante transferencia interna Bitso a Bitso. No XRP, no USDT, no wallets externas.' : 'No disponible por ahora. Selecciona efectivo o solicita a EMC otra forma de pago.'}</span>\n        ${daiAvailable ? `\n          <small>Total MXN: ${money(calc.total)} · Equivalente: ${calc.dai.toFixed(2)} DAI</small>\n          <small>Cuenta Bitso: ${p.bitsoUser}</small>\n          <small>Vigencia del cálculo: ${p.daiValidityMinutes} minutos.</small>\n        ` : '<small>Selecciona efectivo o solicita a EMC activar DAI.</small>'}\n      </button>\n    `}\n  `;\n}\n\nfunction crewModal() {\n  const level = state.quote.service.selectedLevel || scoreDiagnostic();\n  return `\n    <h2>Personal y tiempo estimado</h2>\n    <p class=\"muted\">El avance diario se calcula internamente con un rendimiento conservador para no prometer tiempos irreales.</p>\n    ${[1, 2, 3, 4, 5, 6].map(count => {\n      const estimate = estimateDays(level, count);\n      return `\n        <button class=\"select-card ${state.quote.service.painters === count ? 'selected' : ''}\" data-pick-crew=\"${count}\">\n          <strong>${count} pintor(es)</strong>\n          <span>${estimate.days} día(s) aproximados para ${state.quote.project.squareMeters} m²</span>\n          <small>Avance de referencia: ${Math.round(estimate.dailyAdvance)} m² por día.</small>\n        </button>\n      `;\n    }).join('')}\n  `;\n}\n\nfunction howItWorks() {\n  return `\n    ${topbar('Cómo funciona')}\n    <section class=\"screen\">\n      <div class=\"card\">\n        <h2>Elige qué quieres conocer</h2>\n        <div class=\"info-grid\">\n          <button class=\"info-card\" data-info=\"service\">\n            <strong>Cómo funciona el servicio</strong>\n            <span>Cotización, revisión técnica, alcances y pago.</span>\n          </button>\n          <button class=\"info-card\" data-info=\"collab\">\n            <strong>Cómo colaborar con nosotros</strong>\n            <span>Registro, participación por servicio y responsabilidades.</span>\n          </button>\n        </div>\n      </div>\n      <div class=\"card\" id=\"info-panel\">\n        ${serviceInfo()}\n      </div>\n    </section>\n  `;\n}\n\nfunction serviceInfo() {\n  return `\n    <h2>Servicio de pintura</h2>\n    <h3>Cómo funciona</h3>\n    <div class=\"summary-line\"><span>1</span><strong>Decidir: capturas datos, medidas y fotos</strong></div>\n    <div class=\"summary-line\"><span>2</span><strong>Entender: EMC interpreta área, acceso y señales visibles</strong></div>\n    <div class=\"summary-line\"><span>3</span><strong>Cotizar: el sistema recomienda nivel, pintura y total</strong></div>\n    <div class=\"summary-line\"><span>4</span><strong>Confirmar: revisas PDF, comentarios y condiciones</strong></div>\n    <div class=\"summary-line\"><span>5</span><strong>Mejorar: EMC usa tus comentarios para ajustar el servicio</strong></div>\n    <h3>Alcances</h3>\n    <p class=\"muted\">La cotización considera metros cuadrados, tipo de aplicación, fotos, nivel de servicio, pintura, altura, acceso y forma de pago.</p>\n    <h3>Compromisos EMC</h3>\n    <p class=\"muted\">Revisar la información enviada, confirmar condiciones antes de iniciar y ejecutar el servicio conforme al nivel aceptado.</p>\n    <h3>Responsabilidades del cliente</h3>\n    <p class=\"muted\">Capturar datos reales, enviar fotos claras y confirmar cualquier cambio de alcance antes del inicio.</p>\n  `;\n}\n\nfunction collaboratorInfo() {\n  return `\n    <h2>Red EMC</h2>\n    <div class=\"senior-priority compact\">\n      <strong>50 años o más: tu experiencia tiene prioridad</strong>\n      <span>EMC valora a personas con oficio, cumplimiento y trayectoria. Cuando exista un proyecto compatible, revisaremos primero perfiles con experiencia comprobable.</span>\n    </div>\n    <div class=\"notice strong-notice\">Al inscribirte, EMC te pedirá tu edad para aplicar la revisión preferente 50+.</div>\n    <h3>Cómo funciona</h3>\n    <div class=\"summary-line\"><span>1</span><strong>Registras datos, edad, experiencia y zona</strong></div>\n    <div class=\"summary-line\"><span>2</span><strong>EMC revisa perfiles para servicios eventuales</strong></div>\n    <div class=\"summary-line\"><span>3</span><strong>Quien cumple y entrega calidad aumenta su prioridad</strong></div>\n    <div class=\"notice\">No es empleo fijo ni nómina. Es una red para oportunidades reales cuando exista trabajo compatible.</div>\n    <div class=\"actions single\">\n      <button class=\"btn btn-primary\" data-action=\"work\" type=\"button\">Inscribirme en la Red EMC</button>\n    </div>\n  `;\n}\n\nfunction workForm() {\n  const baseRate = 20;\n  return `\n    ${topbar('Colaboradores')}\n    <section class=\"screen\">\n      <div class=\"actions back-row\">\n        <button class=\"btn btn-ghost\" data-action=\"home\" type=\"button\">Atrás</button>\n      </div>\n      <div class=\"card network-hero\">\n        <img class=\"network-hero-photo\" src=\"/assets/emc-red-apoyo-pintor.png\" alt=\"Persona recibiendo apoyo de la Red EMC\">\n        <span class=\"eyebrow\">Red EMC</span>\n        <h2>Cuando hay trabajo, llamamos primero a nuestra gente</h2>\n        <p class=\"muted\">Regístrate para oportunidades eventuales en servicios generales. Pintura será una de las primeras áreas de referencia EMC.</p>\n        <div class=\"senior-priority hero-priority\">\n          <strong>¿Tienes 50 años o más?</strong>\n          <span>Tu experiencia tiene trato preferente en la revisión de colaboradores EMC.</span>\n        </div>\n        <div class=\"network-pill-grid\">\n          <span>Experiencia</span>\n          <span>Cumplimiento</span>\n          <span>Trabajo limpio</span>\n        </div>\n      </div>\n      <div class=\"card\">\n        <h2>Registro Red EMC</h2>\n        <div class=\"senior-priority form-priority\">\n          <strong>Personas de 50 años o más tendrán revisión preferente</strong>\n          <span>EMC busca oficio, seriedad y experiencia. No prometemos empleo fijo; sí damos prioridad de consideración cuando exista un servicio compatible.</span>\n        </div>\n        <div class=\"form-grid\">\n          <div class=\"notice strong-notice\">Área: Servicios generales · Referencia inicial: pintura</div>\n          <div class=\"notice\" id=\"collab-rate\">Pago mínimo inicial: desde ${money(baseRate)} por m². Sujeto a evaluación por experiencia, calidad, puntualidad y tipo de servicio.</div>\n          <label class=\"check-row\"><input id=\"collab-accept\" type=\"checkbox\"> Entiendo que es registro para oportunidades eventuales dentro de la Red EMC</label>\n          <label>Nombre<input id=\"collab-name\"></label>\n          <label>Teléfono<input id=\"collab-phone\" type=\"tel\"></label>\n          <label>Edad<input id=\"collab-age\" type=\"number\" min=\"18\" max=\"90\" step=\"1\" inputmode=\"numeric\"></label>\n          <label>Ciudad<input id=\"collab-city\"></label>\n          <label>Zona o colonia donde sales normalmente<input id=\"collab-zone\" placeholder=\"Ej. Centro, Atasta, Tamulté, Gaviotas\"></label>\n          <label>¿Cuántos años tienes de experiencia en servicios generales?\n            <input id=\"collab-experience-years\" type=\"number\" min=\"0\" max=\"60\" step=\"1\" inputmode=\"numeric\">\n          </label>\n          <label>Disponibilidad<input id=\"collab-availability\" placeholder=\"Ej. fines de semana, entre semana, inmediato\"></label>\n          <label>Fotos opcionales de trabajos previos<input id=\"collab-photos\" type=\"file\" accept=\"image/*\" multiple></label>\n        </div>\n        <div class=\"notice\" style=\"margin-top:12px;\">Tu prioridad aumenta con experiencia comprobable, puntualidad, trabajo limpio y calidad.</div>\n        <div class=\"actions single\">\n          <button class=\"btn btn-primary\" data-action=\"send-collab\">Enviar registro a la Red EMC</button>\n        </div>\n        <div class=\"actions single\">\n          <button class=\"btn btn-ghost\" data-action=\"home\" type=\"button\">Atrás</button>\n        </div>\n      </div>\n    </section>\n  `;\n}\n\nfunction success() {\n  const quote = state.lastSavedQuote || {};\n  return `\n    ${topbar('Cotización enviada')}\n    <section class=\"screen\">\n      <div class=\"card success\">\n        <div class=\"success-mark\">✓</div>\n        <h2>Recibimos tu cotización</h2>\n        <p>Folio: <strong>${quote.folio}</strong></p>\n        <p class=\"muted\">Estatus inicial: Nueva cotización. EMC revisará tus datos, fotos y condiciones capturadas.</p>\n        <div class=\"success-summary\">\n          <span>Total preliminar</span>\n          <strong>${money(quote.calculation?.total)}</strong>\n          <small>${quote.client?.name || ''} · ${quote.project?.squareMeters || '-'} m² · ${quote.project?.applicationType || '-'}</small>\n        </div>\n        <button class=\"btn btn-ghost\" data-action=\"copy-summary\">Copiar resumen</button>\n        <button class=\"btn btn-primary\" data-action=\"home\">Volver al inicio</button>\n      </div>\n    </section>\n  `;\n}\n\nfunction render() {\n  if (!state.config) {\n    app.innerHTML = '<section class=\"home\"><div class=\"home-card\"><div class=\"logo\">EMC</div><p>Cargando...</p></div></section>';\n    return;\n  }\n  if (state.view === 'home') app.innerHTML = home();\n  if (state.view === 'quote') app.innerHTML = quoteStep();\n  if (state.view === 'how') app.innerHTML = howItWorks();\n  if (state.view === 'work') app.innerHTML = workForm();\n  if (state.view === 'success') app.innerHTML = success();\n  bind();\n  maybeAnalyzePhotosAutomatically();\n}\n\nfunction photoSignature() {\n  return state.quote.photos.map(photo => `${photo.label}:${photo.name}:${photo.size}`).join('|');\n}\n\nfunction maybeAnalyzePhotosAutomatically() {\n  if (state.view !== 'quote' || state.step !== 2) return;\n  if (state.analyzingPhotos) return;\n  if (state.quote.photos.length < 4) return;\n  const signature = photoSignature();\n  if (!signature || signature === state.photoAnalysisSignature) return;\n  state.photoAnalysisSignature = signature;\n  if (!state.aiStatus?.configured) {\n    applyConservativePhotoFallback('Fotos recibidas. Pendiente revisión visual EMC antes de confirmar el nivel de servicio.');\n    return;\n  }\n  window.setTimeout(() => analyzePhotos({ silent: true }), 250);\n}\n\nfunction applyConservativePhotoFallback(summary = 'Fotos cargadas sin análisis visual automático.') {\n  state.photoAnalysis = {\n    enabled: false,\n    status: 'manual_review_required',\n    summary,\n    minimumLevel: 'medio',\n    confidence: 0,\n    photoQuality: 'Pendiente de revisión EMC',\n    signals: [{ type: 'revision', severity: 'media', evidence: 'Fotos cargadas para validación EMC.' }],\n    alerts: ['EMC debe revisar visualmente las fotos antes de confirmar Básico.'],\n    questions: ['Confirmar manualmente si la superficie está sana antes de ofrecer Básico.'],\n    recommendedActions: ['Revisión visual EMC antes de agendar.']\n  };\n  render();\n}\n\nfunction validationMessage() {\n  const q = state.quote;\n  syncProjectSquareMeters();\n  if (state.step === 0) {\n    if (!q.client.name.trim()) return 'Captura el nombre del cliente.';\n    if (q.client.phone.replace(/\\D/g, '').length < 10) return 'Captura un teléfono WhatsApp válido de al menos 10 dígitos.';\n    if (!q.client.address.trim()) return 'Captura la dirección del servicio.';\n    if (!q.client.city.trim()) return 'Captura la ciudad.';\n  }\n  if (state.step === 1) {\n    if (projectSquareMeters() <= 0) return 'Captura los metros cuadrados aproximados.';\n    if (q.project.applicationType === 'Interior y exterior' && (!Number(q.project.interiorSquareMeters || 0) || !Number(q.project.exteriorSquareMeters || 0))) {\n      return 'Para interior y exterior, captura por separado los m² interiores y exteriores.';\n    }\n    if (Number(q.project.heightMeters) <= 0) return 'Captura la altura aproximada.';\n    if (Number(q.project.heightMeters) > 15) return 'Revisa la altura: parece demasiado alta para una cotización rápida.';\n  }\n  if (state.step === 2 && state.quote.photos.length < 4) return 'Sube las 4 fotos mínimas para que EMC pueda revisar el alcance.';\n  if (state.step === 4 && !q.service.selectedLevel) {\n    return 'Acepta la recomendación EMC o escoge otro nivel de servicio antes de continuar.';\n  }\n  if (state.step === 4 && isBelowMinimum() && !state.quote.service.riskOverrideAccepted) {\n    return 'Para elegir un nivel más barato que el recomendado, acepta que será alcance limitado.';\n  }\n  if (state.step === 4 && !q.service.paintSupply) {\n    return 'Elige si la pintura será suministrada por EMC o por el cliente.';\n  }\n  if (state.step === 4 && q.service.paintSupply === 'emc' && !q.service.paintId) {\n    return 'Selecciona la pintura que quieres que EMC compre o cambia a \"Yo compro la pintura\".';\n  }\n  if (state.step === 4 && q.service.paintSupply === 'emc' && needsSealer(q.service.selectedLevel) && !q.service.sealerId) {\n    return 'Selecciona el sellador para poder cotizarlo completo.';\n  }\n  if (!q.service.invoice && q.service.paymentMethod === 'DAI Bitso a Bitso' && !daiPaymentAvailable()) {\n    return 'El pago en DAI Bitso a Bitso no está disponible. Elige efectivo o pide a EMC activar DAI.';\n  }\n  return '';\n}\n\nfunction validateStep() {\n  return !validationMessage();\n}\n\nfunction quoteShareText() {\n  const q = state.lastSavedQuote;\n  if (!q) return '';\n  const c = q.calculation || {};\n  const levelName = levels[c.level]?.label || c.level || '-';\n  return [\n    `Cotización EMC Pintura`,\n    `Folio: ${q.folio}`,\n    `Cliente: ${q.client?.name || '-'}`,\n    `Servicio: ${levelName}`,\n    `Área: ${q.project?.squareMeters || '-'} m²`,\n    `Total preliminar: ${money(c.total)}`,\n    `Estatus: ${q.status || 'Nueva'}`\n  ].join('\\n');\n}\n\nfunction bind() {\n  document.querySelectorAll('[data-action]').forEach(button => {\n    button.addEventListener('click', async event => {\n      const action = button.dataset.action;\n      if (action === 'home') setView('home', 0);\n      if (action === 'quote') startNewQuote();\n      if (action === 'work') setView('work', 0);\n      if (action === 'how') setView('how', 0);\n      if (action === 'prev') {\n        if (state.view === 'quote' && state.step === 0) {\n          setView('home', 0);\n        } else {\n          setView('quote', Math.max(0, state.step - 1));\n        }\n      }\n      if (action === 'next') {\n        const message = validationMessage();\n        if (message) return alert(message);\n        const nextStep = Math.min(5, state.step + 1);\n        setView('quote', nextStep);\n      }\n      if (action === 'accept-recommendation') {\n        const calc = calculate();\n        state.quote.service.selectedLevel = calc.recommendedLevel;\n        state.quote.service.riskOverrideAccepted = true;\n        state.showServiceOptions = false;\n        setView('quote', 4);\n      }\n      if (action === 'choose-service') {\n        state.showServiceOptions = true;\n        render();\n      }\n      if (action === 'toggle-crew-config') {\n        state.showCrewConfig = !state.showCrewConfig;\n        render();\n      }\n      if (action === 'accept') await acceptQuote();\n      if (action === 'analyze-photos') await analyzePhotos();\n      if (action === 'print-pdf') window.print();\n      if (action === 'copy-summary') {\n        const text = quoteShareText();\n        try {\n          await navigator.clipboard.writeText(text);\n          alert('Resumen copiado.');\n        } catch (error) {\n          prompt('Copia este resumen:', text);\n        }\n      }\n      if (action === 'send-collab') await sendCollaborator();\n      if (action === 'close-modal') {\n        event.stopPropagation();\n        state.modal = null;\n        render();\n      }\n    });\n  });\n\n  document.querySelectorAll('[data-modal]').forEach(button => {\n    button.addEventListener('click', event => {\n      event.preventDefault();\n      state.modal = button.dataset.modal;\n      render();\n    });\n  });\n\n  document.querySelectorAll('[data-service-detail]').forEach(button => {\n    button.addEventListener('click', event => {\n      event.preventDefault();\n      state.modal = `service-${button.dataset.serviceDetail}`;\n      render();\n    });\n  });\n\n  document.querySelectorAll('[data-path]').forEach(field => {\n    field.addEventListener('input', event => {\n      let value = event.target.value;\n      if (event.target.type === 'number') value = Number(value);\n      if (event.target.dataset.path === 'service.invoice') {\n        value = value === 'true';\n        state.quote.service.paymentMethod = value ? 'Transferencia bancaria / SPEI' : 'Efectivo';\n      }\n      update(event.target.dataset.path, value);\n      if (event.target.dataset.path.startsWith('project.')) syncProjectSquareMeters();\n      if (event.target.dataset.path === 'project.applicationType') render();\n      if (state.step >= 4) render();\n    });\n  });\n\n  document.querySelectorAll('[data-level]').forEach(field => {\n    field.addEventListener('change', event => {\n      const level = event.target.dataset.level;\n      state.quote.service.selectedLevel = level;\n      state.quote.service.riskOverrideAccepted = !isBelowMinimum(level);\n      render();\n    });\n  });\n\n  document.querySelectorAll('[data-pick-level]').forEach(button => {\n    button.addEventListener('click', () => {\n      state.quote.service.selectedLevel = button.dataset.pickLevel;\n      state.quote.service.riskOverrideAccepted = !isBelowMinimum(button.dataset.pickLevel);\n      state.modal = null;\n      render();\n    });\n  });\n\n  document.querySelectorAll('[data-select-service-level]').forEach(button => {\n    button.addEventListener('click', () => {\n      const level = button.dataset.selectServiceLevel;\n      state.quote.service.selectedLevel = level;\n      state.quote.service.riskOverrideAccepted = true;\n      state.showServiceOptions = false;\n      setView('quote', 4);\n    });\n  });\n\n  document.querySelectorAll('[data-risk-override]').forEach(field => {\n    field.addEventListener('change', event => {\n      state.quote.service.riskOverrideAccepted = event.target.checked;\n      render();\n    });\n  });\n\n  document.querySelectorAll('[data-paint-supply]').forEach(button => {\n    button.addEventListener('click', () => {\n      state.quote.service.paintSupply = button.dataset.paintSupply;\n      if (button.dataset.paintSupply === 'cliente') {\n        state.quote.service.paintId = '';\n        state.quote.service.sealerId = '';\n        state.quote.service.paintBucketsOverride = '';\n        state.quote.service.sealerBucketsOverride = '';\n      }\n      render();\n    });\n  });\n\n  document.querySelectorAll('[data-client-supply-continue]').forEach(button => {\n    button.addEventListener('click', () => {\n      state.quote.service.paintSupply = 'cliente';\n      state.quote.service.paintId = '';\n      state.quote.service.sealerId = '';\n      state.quote.service.paintBucketsOverride = '';\n      state.quote.service.sealerBucketsOverride = '';\n      setView('quote', 5);\n    });\n  });\n\n  document.querySelectorAll('[data-pick-paint]').forEach(button => {\n    button.addEventListener('click', () => {\n      if (state.quote.service.paintId === button.dataset.pickPaint) {\n        state.quote.service.paintId = '';\n        state.quote.service.paintSupply = 'cliente';\n        state.quote.service.paintBucketsOverride = '';\n      } else {\n        state.quote.service.paintId = button.dataset.pickPaint;\n        state.quote.service.paintSupply = 'emc';\n        state.quote.service.paintBucketsOverride = '';\n      }\n      state.modal = null;\n      render();\n    });\n  });\n\n  document.querySelectorAll('[data-pick-sealer]').forEach(button => {\n    button.addEventListener('click', () => {\n      state.quote.service.sealerId = state.quote.service.sealerId === button.dataset.pickSealer ? '' : button.dataset.pickSealer;\n      state.quote.service.sealerBucketsOverride = '';\n      render();\n    });\n  });\n\n  document.querySelectorAll('[data-pick-payment]').forEach(button => {\n    button.addEventListener('click', () => {\n      if (button.dataset.pickPayment === 'DAI Bitso a Bitso' && !daiPaymentAvailable()) {\n        alert('DAI Bitso a Bitso no está disponible en este momento.');\n        return;\n      }\n      state.quote.service.paymentMethod = button.dataset.pickPayment;\n      state.modal = null;\n      render();\n    });\n  });\n\n  document.querySelectorAll('[data-pick-crew]').forEach(button => {\n    button.addEventListener('click', () => {\n      state.quote.service.painters = Number(button.dataset.pickCrew);\n      state.modal = null;\n      render();\n    });\n  });\n\n  document.querySelectorAll('[data-photo-index]').forEach(field => {\n    field.addEventListener('change', async event => {\n      const file = event.target.files[0];\n      if (!file) return;\n      const photo = await compressImage(file, requiredPhotos[Number(event.target.dataset.photoIndex)]);\n      state.quote.photos[Number(event.target.dataset.photoIndex)] = photo;\n      state.quote.photos = state.quote.photos.filter(Boolean).slice(0, 10);\n      state.photoAnalysis = null;\n      state.photoAnalysisSignature = '';\n      render();\n    });\n  });\n\n  const extraPhotos = document.querySelector('[data-extra-photos]');\n  if (extraPhotos) {\n    extraPhotos.addEventListener('change', async event => {\n      const files = Array.from(event.target.files).slice(0, 10 - state.quote.photos.length);\n      for (const file of files) {\n        state.quote.photos.push(await compressImage(file, 'Foto adicional'));\n      }\n      state.quote.photos = state.quote.photos.slice(0, 10);\n      state.photoAnalysis = null;\n      state.photoAnalysisSignature = '';\n      render();\n    });\n  }\n\n  document.querySelectorAll('[data-info]').forEach(button => {\n    button.addEventListener('click', () => {\n      document.querySelector('#info-panel').innerHTML = button.dataset.info === 'service' ? serviceInfo() : collaboratorInfo();\n      document.querySelectorAll('[data-info]').forEach(item => item.classList.remove('selected'));\n      button.classList.add('selected');\n    });\n  });\n}\n\nfunction compressImage(file, label) {\n  return new Promise((resolve, reject) => {\n    const reader = new FileReader();\n    reader.onload = () => {\n      const img = new Image();\n      img.onload = () => {\n        const canvas = document.createElement('canvas');\n        const max = 1280;\n        const scale = Math.min(1, max / Math.max(img.width, img.height));\n        canvas.width = Math.round(img.width * scale);\n        canvas.height = Math.round(img.height * scale);\n        const ctx = canvas.getContext('2d');\n        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);\n        resolve({\n          label,\n          name: file.name,\n          size: file.size,\n          dataUrl: canvas.toDataURL('image/jpeg', 0.72)\n        });\n      };\n      img.onerror = reject;\n      img.src = reader.result;\n    };\n    reader.onerror = reject;\n    reader.readAsDataURL(file);\n  });\n}\n\nasync function analyzePhotos(options = {}) {\n  if (!state.aiStatus?.configured) {\n    applyConservativePhotoFallback('Fotos recibidas. Pendiente revisión visual EMC antes de confirmar el nivel de servicio.');\n    if (!options.silent) alert('EMC revisará fotos manualmente antes de confirmar Básico.');\n    return;\n  }\n  if (state.quote.photos.length < 4) return alert('Sube las 4 fotos mínimas para analizar.');\n  state.analyzingPhotos = true;\n  if (!options.silent) render();\n  try {\n    const response = await fetch('/api/analyze-photos', {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json' },\n      body: JSON.stringify({\n        context: {\n          client: {\n            propertyType: state.quote.client.propertyType,\n            city: state.quote.client.city\n          },\n          project: state.quote.project,\n          diagnostic: state.quote.diagnostic,\n          minimumByQuestionnaire: minimumLevelByRules()\n        },\n        photos: state.quote.photos.map(photo => ({\n          label: photo.label,\n          name: photo.name,\n          size: photo.size,\n          dataUrl: photo.dataUrl\n        }))\n      })\n    });\n    const analysis = await response.json();\n    if (!response.ok) throw new Error(analysis.error || 'No se pudo analizar fotos');\n    state.photoAnalysis = analysis;\n  } catch (error) {\n    state.photoAnalysis = {\n      enabled: false,\n      status: 'error',\n      summary: 'No se pudo completar la revisión automática. EMC revisará las fotos antes de confirmar el nivel de servicio.',\n      minimumLevel: 'medio',\n      confidence: 0,\n      photoQuality: 'Pendiente de revisión EMC',\n      signals: [{ type: 'revision', severity: 'media', evidence: 'Fotos cargadas para validación EMC.' }],\n      alerts: ['Revisar fotos manualmente antes de confirmar precio final.'],\n      questions: ['Confirmar si la superficie está sana antes de ofrecer Básico.']\n    };\n  } finally {\n    state.analyzingPhotos = false;\n    render();\n  }\n}\n\nasync function acceptQuote() {\n  if (!validateStep()) return alert('Faltan datos o fotos requeridas.');\n  const calc = calculate();\n  const photoReview = {\n    count: state.quote.photos.length,\n    requiredCount: requiredPhotos.length,\n    requiredLabels: requiredPhotos,\n    receivedLabels: state.quote.photos.map(photo => photo.label),\n    storage: 'Las fotos se usaron solo para captura y revisión preliminar; no se guardan en la cotización pública.',\n    aiAnalysis: state.photoAnalysis ? {\n      enabled: Boolean(state.photoAnalysis.enabled),\n      status: state.photoAnalysis.status || '',\n      summary: state.photoAnalysis.summary || '',\n      minimumLevel: state.photoAnalysis.minimumLevel || '',\n      confidence: Number(state.photoAnalysis.confidence || 0),\n      photoQuality: state.photoAnalysis.photoQuality || '',\n      signals: state.photoAnalysis.signals || [],\n      alerts: state.photoAnalysis.alerts || [],\n      questions: state.photoAnalysis.questions || [],\n      recommendedActions: state.photoAnalysis.recommendedActions || []\n    } : null\n  };\n  const payload = {\n    ...state.quote,\n    photos: [],\n    photoReview,\n    calculation: calc,\n    assistant: calc.assistant,\n    legal: {\n      quote: 'Los precios pueden variar debido a cambios en el mercado mexicano de pinturas, materiales y consumibles. Esta cotización tiene vigencia de 15 días naturales.',\n      technical: 'La cotización se genera con base en los datos, medidas, revisión preliminar de fotos y condiciones capturadas por el cliente. Por privacidad, las fotos no se almacenan en la cotización pública. Cambios de alcance, daños ocultos o condiciones no declaradas podrán generar ajustes antes del inicio del servicio.'\n    }\n  };\n  const response = await fetch('/api/quotes', {\n    method: 'POST',\n    headers: { 'Content-Type': 'application/json' },\n    body: JSON.stringify(payload)\n  });\n  state.lastSavedQuote = await response.json();\n  state.quote = initialQuote();\n  state.photoAnalysis = null;\n  state.photoAnalysisSignature = '';\n  state.showServiceOptions = false;\n  state.showCrewConfig = false;\n  setView('success', 0);\n}\n\nasync function sendCollaborator() {\n  const photosInput = document.querySelector('#collab-photos');\n  const files = Array.from(photosInput.files || []).slice(0, 6);\n  const photos = [];\n  for (const file of files) photos.push(await compressImage(file, 'Trabajo previo'));\n  const baseRate = 20;\n  const payload = {\n    network: 'Red EMC',\n    promise: 'Oportunidades eventuales con prioridad de consideración cuando exista un servicio compatible; no empleo permanente.',\n    area: 'Servicios generales',\n    category: 'Servicios generales / pintura',\n    baseRate,\n    ratePolicy: `Pago mínimo inicial desde ${money(baseRate)} por m²; sujeto a evaluación por experiencia, calidad, puntualidad y tipo de servicio.`,\n    acceptedByService: document.querySelector('#collab-accept').checked,\n    name: document.querySelector('#collab-name').value,\n    phone: document.querySelector('#collab-phone').value,\n    age: Number(document.querySelector('#collab-age').value || 0),\n    preferentialReview: Number(document.querySelector('#collab-age').value || 0) >= 50,\n    city: document.querySelector('#collab-city').value,\n    zone: document.querySelector('#collab-zone').value,\n    experienceYears: Number(document.querySelector('#collab-experience-years').value || 0),\n    experience: `${document.querySelector('#collab-experience-years').value || 0} años de experiencia en servicios generales`,\n    availability: document.querySelector('#collab-availability').value,\n    photos\n  };\n  if (!payload.acceptedByService || !payload.name || !payload.phone) {\n    return alert('Acepta el registro a la Red EMC y captura nombre y teléfono.');\n  }\n  await fetch('/api/collaborators', {\n    method: 'POST',\n    headers: { 'Content-Type': 'application/json' },\n    body: JSON.stringify(payload)\n  });\n  alert('Registro enviado a la Red EMC.');\n  setView('home', 0);\n}\n\nloadConfig();\n","/cliente/styles.css":":root {\n  --navy: #071d36;\n  --navy-2: #0c2b4e;\n  --yellow: #ffd21f;\n  --yellow-2: #f3bd14;\n  --white: #ffffff;\n  --muted: #6b7280;\n  --line: #d9e2ef;\n  --bg: #eef4fb;\n  --danger: #b3261e;\n  --ok: #177245;\n  --radius: 8px;\n  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif;\n}\n\n* {\n  box-sizing: border-box;\n}\n\nbody {\n  margin: 0;\n  color: #122033;\n  background: #071d36;\n  min-height: 100vh;\n}\n\nbutton,\ninput,\nselect,\ntextarea {\n  font: inherit;\n}\n\nbutton {\n  cursor: pointer;\n}\n\n.app-shell {\n  width: min(100%, 520px);\n  min-height: 100vh;\n  margin: 0 auto;\n  background: var(--bg);\n  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.24);\n}\n\n.home {\n  min-height: 100vh;\n  padding: 42px 22px 28px;\n  background: radial-gradient(circle at 50% 0%, rgba(255, 210, 31, 0.16), transparent 34%), var(--navy);\n  color: var(--white);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n\n.home-card {\n  width: 100%;\n  max-width: 360px;\n  text-align: center;\n}\n\n.logo {\n  color: var(--yellow);\n  font-weight: 900;\n  font-style: italic;\n  font-size: 34px;\n  line-height: 1;\n  letter-spacing: 0;\n}\n\n.brand-logo {\n  width: 174px;\n  max-width: 70%;\n  height: auto;\n  object-fit: contain;\n  margin: 0 auto 22px;\n  display: block;\n}\n\n.home h1 {\n  margin: 0;\n  font-size: 26px;\n  line-height: 1.1;\n}\n\n.home p {\n  margin: 0 auto;\n  max-width: 280px;\n  line-height: 1.2;\n}\n\n.division {\n  margin-top: 5px !important;\n  color: var(--yellow);\n  font-size: 16px;\n  font-weight: 900;\n  text-transform: uppercase;\n}\n\n.home-tagline {\n  margin-top: 30px !important;\n  margin-bottom: 22px !important;\n  font-size: 20px;\n  font-weight: 900;\n}\n\n.benefits {\n  display: grid;\n  gap: 10px;\n  width: fit-content;\n  margin: 0 auto 28px;\n  text-align: left;\n}\n\n.benefits span {\n  color: #f3f7fb;\n  font-size: 14px;\n  font-weight: 800;\n  position: relative;\n  padding-left: 24px;\n}\n\n.benefits span::before {\n  content: \"\";\n  width: 11px;\n  height: 11px;\n  border: 2px solid var(--yellow);\n  border-radius: 50%;\n  position: absolute;\n  left: 0;\n  top: 3px;\n}\n\n.button-stack {\n  display: grid;\n  gap: 10px;\n}\n\n.btn {\n  border: 0;\n  border-radius: var(--radius);\n  padding: 13px 16px;\n  min-height: 48px;\n  font-weight: 800;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 9px;\n  transition: transform 160ms ease, filter 160ms ease;\n}\n\n.btn:hover {\n  transform: translateY(-1px);\n}\n\n.btn-primary {\n  background: var(--yellow);\n  color: #101820;\n}\n\n.btn-secondary {\n  background: transparent;\n  color: var(--white);\n  border: 1px solid rgba(255, 255, 255, 0.58);\n}\n\n.btn-light {\n  background: rgba(255, 255, 255, 0.1);\n  color: var(--white);\n  border: 1px solid rgba(255, 255, 255, 0.25);\n}\n\n.btn-dark {\n  background: var(--navy);\n  color: var(--white);\n}\n\n.btn-ghost {\n  background: #fff;\n  border: 1px solid var(--line);\n  color: var(--navy);\n}\n\n.topbar {\n  position: sticky;\n  top: 0;\n  z-index: 5;\n  background: var(--navy);\n  color: var(--white);\n  padding: 16px;\n  display: flex;\n  align-items: center;\n  gap: 12px;\n}\n\n.topbar button {\n  width: 40px;\n  height: 40px;\n  border-radius: var(--radius);\n  border: 1px solid rgba(255, 255, 255, 0.3);\n  color: var(--white);\n  background: transparent;\n}\n\n.topbar-title {\n  display: grid;\n  gap: 2px;\n}\n\n.topbar-title strong {\n  color: var(--yellow);\n}\n\n.topbar-title span {\n  font-size: 13px;\n  color: #cdd9e8;\n}\n\n.screen {\n  padding: 18px;\n}\n\n.progress {\n  display: grid;\n  grid-template-columns: repeat(5, 1fr);\n  gap: 6px;\n  margin-bottom: 16px;\n}\n\n.progress.seven {\n  grid-template-columns: repeat(7, 1fr);\n}\n\n.progress.six {\n  grid-template-columns: repeat(6, 1fr);\n}\n\n.progress span {\n  height: 6px;\n  border-radius: 999px;\n  background: #cfd9e6;\n}\n\n.progress .active {\n  background: var(--yellow);\n}\n\n.card {\n  background: var(--white);\n  border: 1px solid var(--line);\n  border-radius: var(--radius);\n  padding: 16px;\n  box-shadow: 0 8px 18px rgba(13, 42, 77, 0.06);\n}\n\n.card + .card {\n  margin-top: 14px;\n}\n\n.card h2,\n.card h3 {\n  margin: 0 0 12px;\n  color: var(--navy);\n  letter-spacing: 0;\n}\n\n.card h2 {\n  font-size: 22px;\n}\n\n.card h3 {\n  font-size: 17px;\n}\n\n.form-grid {\n  display: grid;\n  gap: 12px;\n}\n\nlabel {\n  display: grid;\n  gap: 6px;\n  color: #22324a;\n  font-size: 13px;\n  font-weight: 800;\n}\n\ninput,\nselect,\ntextarea {\n  width: 100%;\n  min-height: 46px;\n  border: 1px solid var(--line);\n  border-radius: var(--radius);\n  padding: 10px 12px;\n  background: #fff;\n  color: #122033;\n}\n\ntextarea {\n  min-height: 88px;\n  resize: vertical;\n}\n\n.choice-grid,\n.diagnostic-grid {\n  display: grid;\n  gap: 9px;\n}\n\n.choice-grid {\n  grid-template-columns: 1fr 1fr;\n}\n\n.choice,\n.toggle-row {\n  border: 1px solid var(--line);\n  border-radius: var(--radius);\n  padding: 12px;\n  background: #fff;\n}\n\n.choice input,\n.toggle-row input {\n  width: auto;\n  min-height: auto;\n}\n\n.toggle-row {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  font-weight: 800;\n}\n\n.selected {\n  border-color: var(--yellow-2);\n  box-shadow: 0 0 0 2px rgba(255, 210, 31, 0.35);\n}\n\n.actions {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 10px;\n  margin-top: 16px;\n}\n\n.actions.single {\n  grid-template-columns: 1fr;\n}\n\n.notice {\n  background: #fff8d7;\n  border: 1px solid #f0d46b;\n  border-radius: var(--radius);\n  padding: 12px;\n  font-size: 13px;\n  color: #4d3d00;\n}\n\n.info-grid {\n  display: grid;\n  gap: 10px;\n}\n\n.info-card {\n  width: 100%;\n  border: 1px solid var(--line);\n  border-radius: var(--radius);\n  background: #fff;\n  color: var(--navy);\n  padding: 14px;\n  display: grid;\n  gap: 6px;\n  text-align: left;\n}\n\n.info-card strong {\n  font-size: 16px;\n}\n\n.info-card span {\n  color: var(--muted);\n  font-size: 13px;\n  line-height: 1.35;\n}\n\n.muted {\n  color: var(--muted);\n  font-size: 13px;\n}\n\n.summary-line {\n  display: flex;\n  justify-content: space-between;\n  gap: 12px;\n  padding: 8px 0;\n  border-bottom: 1px solid #edf1f6;\n}\n\n.summary-line:last-child {\n  border-bottom: 0;\n}\n\n.summary-line strong {\n  text-align: right;\n}\n\n.total {\n  background: var(--navy);\n  color: #fff;\n  border-radius: var(--radius);\n  padding: 14px;\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  font-weight: 900;\n  margin-top: 12px;\n}\n\n.total strong {\n  color: var(--yellow);\n  font-size: 22px;\n}\n\n.photo-grid {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 10px;\n}\n\n.photo-tile {\n  border: 1px solid var(--line);\n  background: #fff;\n  border-radius: var(--radius);\n  padding: 10px;\n}\n\n.photo-tile img {\n  width: 100%;\n  aspect-ratio: 1.2;\n  object-fit: cover;\n  border-radius: 6px;\n  border: 1px solid var(--line);\n  margin-top: 8px;\n}\n\n.pill {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  min-height: 30px;\n  padding: 5px 10px;\n  border-radius: 999px;\n  background: #e9f0f8;\n  color: var(--navy);\n  font-weight: 900;\n  font-size: 12px;\n}\n\n.success {\n  text-align: center;\n  display: grid;\n  gap: 12px;\n}\n\n.center-card {\n  text-align: center;\n}\n\n.success-mark {\n  width: 64px;\n  height: 64px;\n  border-radius: 50%;\n  background: var(--ok);\n  color: #fff;\n  display: grid;\n  place-items: center;\n  font-size: 34px;\n  margin: 0 auto;\n}\n\n.success-mark.small {\n  width: 54px;\n  height: 54px;\n  font-size: 28px;\n}\n\n.recommendation-box {\n  border: 1px solid #d7e1ee;\n  background: linear-gradient(180deg, #f8fbff 0%, #edf4fc 100%);\n  border-radius: var(--radius);\n  padding: 16px;\n  margin: 14px 0;\n}\n\n.recommendation-box span {\n  display: block;\n  color: var(--muted);\n  font-size: 12px;\n  font-weight: 900;\n  text-transform: uppercase;\n}\n\n.recommendation-box strong {\n  display: block;\n  color: var(--navy);\n  font-size: 25px;\n  margin-top: 6px;\n}\n\n.recommendation-box p {\n  margin: 6px 0 0;\n  font-weight: 800;\n}\n\n.clean-list {\n  margin: 0 0 14px;\n  padding: 0;\n  list-style: none;\n  display: grid;\n  gap: 8px;\n  text-align: left;\n}\n\n.clean-list li {\n  position: relative;\n  padding-left: 22px;\n  color: #25364d;\n  font-size: 14px;\n}\n\n.clean-list li::before {\n  content: \"\";\n  width: 10px;\n  height: 10px;\n  border-radius: 50%;\n  background: var(--yellow);\n  position: absolute;\n  left: 0;\n  top: 5px;\n}\n\n.clean-list.compact li {\n  padding: 9px 10px 9px 32px;\n  font-size: 13px;\n}\n\n.clean-list.compact li::before {\n  left: 12px;\n  top: 14px;\n}\n\n.assistant-panel {\n  margin: 14px 0;\n  border: 1px solid rgba(255, 210, 31, 0.46);\n  border-radius: 16px;\n  background: linear-gradient(180deg, #fffdf0 0%, #fff8d7 100%);\n  padding: 16px;\n  text-align: left;\n  box-shadow: 0 10px 22px rgba(7, 29, 54, 0.07);\n}\n\n.assistant-panel > span {\n  color: var(--navy);\n  font-size: 12px;\n  font-weight: 950;\n  text-transform: uppercase;\n}\n\n.assistant-panel > strong {\n  display: block;\n  color: var(--navy);\n  margin: 6px 0 12px;\n  line-height: 1.35;\n}\n\n.assistant-panel h3 {\n  margin: 12px 0 8px;\n  font-size: 15px;\n}\n\n.assistant-panel h3::after {\n  display: none;\n}\n\n.level-grid {\n  display: grid;\n  gap: 10px;\n}\n\n.level-option {\n  border: 1px solid var(--line);\n  border-radius: var(--radius);\n  padding: 12px;\n  background: #fff;\n  display: grid;\n  grid-template-columns: auto 1fr;\n  gap: 6px 10px;\n  align-items: start;\n}\n\n.level-option input {\n  width: auto;\n  min-height: auto;\n  grid-row: span 3;\n  margin-top: 4px;\n}\n\n.level-option strong {\n  color: var(--navy);\n  font-size: 16px;\n}\n\n.level-option span {\n  color: #152033;\n  font-weight: 900;\n}\n\n.level-option small {\n  color: var(--muted);\n  line-height: 1.35;\n}\n\n.paint-catalog {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 12px;\n}\n\n.paint-card {\n  width: 100%;\n  border: 1px solid var(--line);\n  border-radius: var(--radius);\n  background: #fff;\n  padding: 10px;\n  display: grid;\n  gap: 10px;\n  text-align: left;\n}\n\n.paint-card.selected {\n  border-color: var(--yellow-2);\n  box-shadow: 0 0 0 2px rgba(255, 210, 31, 0.36);\n  background: #fffdf2;\n}\n\n.paint-can {\n  height: 82px;\n  border-radius: 8px 8px 11px 11px;\n  background: linear-gradient(160deg, #f6f8fb 0%, #d9e1ea 48%, #ffffff 49%, #c7d2df 100%);\n  border: 2px solid #b7c3d0;\n  color: var(--navy);\n  display: grid;\n  place-items: center;\n  text-align: center;\n  padding: 8px;\n  position: relative;\n  overflow: hidden;\n}\n\n.paint-photo {\n  width: 100%;\n  height: 118px;\n  object-fit: cover;\n  border-radius: 12px;\n  border: 1px solid #cfd9e6;\n  box-shadow: 0 12px 20px rgba(7, 29, 54, 0.08);\n  background: #fff;\n}\n\n.paint-visual {\n  display: grid;\n}\n\n.paint-can::before {\n  content: \"\";\n  position: absolute;\n  inset: 0 0 auto;\n  height: 18px;\n  background: var(--yellow);\n}\n\n.paint-can.estándar::before,\n.paint-can.estandar::before {\n  background: #1b63a5;\n}\n\n.paint-can.premium::before {\n  background: #111827;\n}\n\n.paint-can b {\n  font-size: 13px;\n  z-index: 1;\n}\n\n.paint-can small {\n  font-size: 10px;\n  font-weight: 900;\n  z-index: 1;\n}\n\n.paint-info {\n  display: grid;\n  gap: 4px;\n}\n\n.paint-info strong {\n  color: var(--navy);\n  font-size: 16px;\n}\n\n.paint-brand {\n  color: var(--muted);\n  font-size: 12px;\n  font-weight: 950;\n  text-transform: uppercase;\n}\n\n.paint-price {\n  color: #1c2d44;\n  font-weight: 900;\n  font-size: 18px;\n}\n\n.paint-info small {\n  color: var(--muted);\n  line-height: 1.35;\n}\n\n.paint-select {\n  margin-top: 6px;\n  min-height: 34px;\n  border-radius: 9px;\n  background: var(--navy);\n  color: #fff !important;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  font-size: 12px;\n  font-weight: 950;\n  text-align: center;\n}\n\n.material-summary {\n  display: grid;\n  grid-template-columns: 1fr;\n  gap: 10px;\n}\n\n.material-ledger {\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n}\n\n.material-summary > div {\n  border: 1px solid #dbe5f1;\n  border-radius: 14px;\n  background: linear-gradient(180deg, #fff 0%, #f7faff 100%);\n  padding: 13px;\n  display: grid;\n  gap: 4px;\n}\n\n.material-summary span {\n  color: var(--muted);\n  font-size: 12px;\n  font-weight: 950;\n  text-transform: uppercase;\n}\n\n.material-summary strong {\n  color: var(--navy);\n  font-size: 22px;\n}\n\n.material-summary small {\n  color: #4c5d72;\n  line-height: 1.35;\n}\n\n.material-ledger > div {\n  min-width: 0;\n}\n\n.material-ledger strong {\n  font-size: clamp(20px, 2.4vw, 28px);\n}\n\n.sealer-catalog .paint-can::before {\n  background: #78a6d8;\n}\n\n.crew-grid {\n  display: grid;\n  grid-template-columns: repeat(4, 1fr);\n  gap: 8px;\n}\n\n.crew-card {\n  border: 1px solid var(--line);\n  border-radius: var(--radius);\n  background: #fff;\n  min-height: 92px;\n  padding: 10px 6px;\n  display: grid;\n  place-items: center;\n  gap: 2px;\n  text-align: center;\n}\n\n.crew-card.selected {\n  border-color: var(--yellow-2);\n  background: #fff8d7;\n  box-shadow: 0 0 0 2px rgba(255, 210, 31, 0.34);\n}\n\n.crew-card strong {\n  color: var(--navy);\n  font-size: 24px;\n  line-height: 1;\n}\n\n.crew-card span {\n  color: #25364d;\n  font-size: 12px;\n  font-weight: 900;\n}\n\n.crew-card small {\n  color: var(--muted);\n  font-size: 12px;\n}\n\n.field-button {\n  width: 100%;\n  min-height: 46px;\n  border: 1px solid var(--line);\n  border-radius: var(--radius);\n  padding: 10px 12px;\n  background: #fff;\n  color: var(--navy);\n  text-align: left;\n  font-weight: 900;\n}\n\n.payment-preview {\n  border: 1px solid #cbd7e6;\n  border-radius: var(--radius);\n  background: #f7faff;\n  padding: 12px;\n  display: grid;\n  gap: 7px;\n}\n\n.payment-preview strong {\n  color: var(--navy);\n  font-size: 15px;\n}\n\n.payment-preview span,\n.payment-preview small {\n  color: #25364d;\n  line-height: 1.35;\n}\n\n.payment-preview small {\n  font-size: 12px;\n  color: var(--muted);\n}\n\n.modal-backdrop {\n  position: fixed;\n  inset: 0;\n  z-index: 50;\n  background: rgba(7, 29, 54, 0.72);\n  display: flex;\n  align-items: flex-end;\n  justify-content: center;\n  padding: 18px;\n}\n\n.modal-sheet {\n  position: relative;\n  width: min(100%, 500px);\n  max-height: 82vh;\n  overflow: auto;\n  background: #fff;\n  border-radius: 14px 14px 8px 8px;\n  padding: 20px;\n  box-shadow: 0 22px 70px rgba(0, 0, 0, 0.35);\n}\n\n.modal-sheet h2 {\n  margin: 0 42px 8px 0;\n  color: var(--navy);\n}\n\n.modal-close {\n  position: absolute;\n  top: 12px;\n  right: 12px;\n  width: 36px;\n  height: 36px;\n  border-radius: 50%;\n  border: 1px solid var(--line);\n  background: #fff;\n  color: var(--navy);\n  font-size: 24px;\n  line-height: 1;\n}\n\n.select-card {\n  width: 100%;\n  border: 1px solid var(--line);\n  border-radius: var(--radius);\n  background: #fff;\n  padding: 13px;\n  display: grid;\n  gap: 6px;\n  text-align: left;\n  margin-top: 10px;\n}\n\n.select-card strong {\n  color: var(--navy);\n  font-size: 16px;\n}\n\n.select-card span {\n  color: #22324a;\n  font-weight: 800;\n}\n\n.select-card small {\n  color: var(--muted);\n  line-height: 1.35;\n}\n\n@media (min-width: 720px) {\n  body {\n    padding: 28px 0;\n  }\n\n  .app-shell {\n    border-radius: 22px;\n    overflow: hidden;\n    min-height: calc(100vh - 56px);\n  }\n}\n\n@media (max-width: 380px) {\n  .paint-catalog {\n    grid-template-columns: 1fr;\n  }\n}\n\n/* Flow upgrades */\n.step-context {\n  display: grid;\n  grid-template-columns: 1fr auto;\n  gap: 12px;\n  align-items: center;\n  margin-bottom: 14px;\n  border: 1px solid rgba(216, 227, 239, 0.9);\n  border-radius: 14px;\n  background: rgba(255, 255, 255, 0.96);\n  padding: 12px;\n  box-shadow: 0 8px 18px rgba(7, 29, 54, 0.06);\n}\n\n.step-context div {\n  min-width: 0;\n  display: grid;\n  gap: 3px;\n}\n\n.step-context span {\n  color: var(--muted);\n  font-size: 11px;\n  font-weight: 950;\n  text-transform: uppercase;\n}\n\n.step-context strong {\n  color: var(--navy);\n  font-size: 15px;\n  overflow-wrap: anywhere;\n}\n\n.photo-checklist {\n  display: grid;\n  gap: 8px;\n  margin: 12px 0;\n}\n\n.photo-checklist span {\n  border: 1px solid #dce6f1;\n  border-radius: 10px;\n  background: #fff;\n  color: #344960;\n  padding: 9px 10px;\n  font-size: 12px;\n  font-weight: 900;\n}\n\n.photo-checklist span.done {\n  border-color: rgba(23, 114, 69, 0.34);\n  background: #edf9f2;\n  color: var(--ok);\n}\n\n.danger-note {\n  border-color: #f2b8b8;\n  background: #fff1f1;\n  color: #7a1d1d;\n  text-align: left;\n  margin: 12px 0;\n}\n\n.diagnostic-extra {\n  margin-top: 12px;\n}\n\n.risk-rule {\n  border: 1px solid rgba(255, 210, 31, 0.48);\n  border-radius: 14px;\n  background: #fffdf0;\n  padding: 13px;\n  margin-top: 12px;\n  display: grid;\n  gap: 5px;\n}\n\n.risk-rule span,\n.risk-rule small {\n  color: #526174;\n  font-weight: 900;\n}\n\n.risk-rule span {\n  font-size: 11px;\n  text-transform: uppercase;\n}\n\n.risk-rule strong {\n  color: var(--navy);\n  font-size: 22px;\n}\n\n.level-option.locked,\n.select-card.locked,\n.level-option.limited,\n.select-card.limited {\n  opacity: 0.62;\n  background: #f4f7fb;\n  box-shadow: none;\n}\n\n.lock-note {\n  color: #9f1d1d !important;\n  font-weight: 900;\n}\n\n.inline-check {\n  margin-top: 10px;\n  display: flex;\n  align-items: center;\n  gap: 9px;\n  text-transform: none;\n  letter-spacing: 0;\n  color: #7a1d1d;\n}\n\n.inline-check input {\n  width: auto;\n  min-height: auto;\n  accent-color: var(--navy);\n}\n\n.check-row {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  min-height: 42px;\n}\n\n.check-row input {\n  width: 18px;\n  min-height: 18px;\n  height: 18px;\n  flex: 0 0 18px;\n  padding: 0;\n  accent-color: var(--navy);\n}\n\n.supply-grid {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 10px;\n  margin: 12px 0;\n}\n\n.supply-card {\n  position: relative;\n  border: 1px solid var(--line);\n  border-radius: 14px;\n  background: linear-gradient(180deg, #fff 0%, #f8fbff 100%);\n  padding: 14px;\n  display: grid;\n  gap: 6px;\n  text-align: left;\n  color: var(--navy);\n}\n\n.supply-card strong {\n  font-size: 15px;\n}\n\n.supply-card span {\n  color: #526174;\n  font-size: 12px;\n  font-weight: 800;\n}\n\n.supply-help {\n  position: absolute;\n  z-index: 5;\n  left: 14px;\n  right: 14px;\n  top: calc(100% + 8px);\n  opacity: 0;\n  pointer-events: none;\n  transform: translateY(-4px);\n  border: 1px solid rgba(255, 203, 31, 0.78);\n  border-radius: 8px;\n  background: #fff8d7;\n  color: var(--navy);\n  padding: 10px 12px;\n  font-size: 12px;\n  font-weight: 850;\n  line-height: 1.35;\n  box-shadow: 0 14px 28px rgba(7, 29, 54, 0.16);\n  transition: opacity 0.16s ease, transform 0.16s ease;\n}\n\n.supply-card:hover .supply-help,\n.supply-card:focus-visible .supply-help {\n  opacity: 1;\n  transform: translateY(0);\n}\n\n.supply-card.selected {\n  border-color: var(--yellow-2);\n  background: #fff8d7;\n  box-shadow: 0 0 0 2px rgba(255, 210, 31, 0.34);\n}\n\n@media (max-width: 420px) {\n  .supply-grid {\n    grid-template-columns: 1fr;\n  }\n}\n\n.sticky-estimate {\n  position: sticky;\n  top: 82px;\n  z-index: 4;\n  display: flex;\n  justify-content: space-between;\n  gap: 12px;\n  align-items: center;\n  border: 1px solid rgba(255, 210, 31, 0.42);\n  border-radius: 14px;\n  background: #fffdf0;\n  padding: 11px 12px;\n  margin-bottom: 14px;\n  box-shadow: 0 12px 24px rgba(7, 29, 54, 0.12);\n}\n\n.sticky-estimate span {\n  color: #31445d;\n  font-size: 12px;\n  font-weight: 900;\n}\n\n.sticky-estimate strong {\n  color: var(--navy);\n  font-size: 18px;\n  white-space: nowrap;\n}\n\n.client-check,\n.success-summary {\n  border: 1px solid #dfe8f2;\n  border-radius: 14px;\n  background: linear-gradient(180deg, #fff 0%, #f7faff 100%);\n  padding: 14px;\n  display: grid;\n  gap: 7px;\n  margin: 12px 0;\n  text-align: left;\n}\n\n.client-check strong,\n.success-summary strong {\n  color: var(--navy);\n  font-size: 18px;\n}\n\n.client-check span,\n.success-summary span,\n.success-summary small {\n  color: #43536a;\n  line-height: 1.35;\n}\n\n.success-summary strong {\n  font-size: 28px;\n}\n\n@media (max-width: 420px) {\n  .photo-grid,\n  .choice-grid {\n    grid-template-columns: 1fr;\n  }\n\n  .crew-grid {\n    grid-template-columns: 1fr 1fr;\n  }\n\n  .step-context {\n    grid-template-columns: 1fr;\n  }\n\n  .sticky-estimate {\n    top: 78px;\n  }\n}\n\n/* Premium visual pass */\n:root {\n  --bg: #f2f6fb;\n  --line: #d8e3ef;\n  --shadow: 0 18px 42px rgba(7, 29, 54, 0.12);\n  --soft-shadow: 0 8px 22px rgba(7, 29, 54, 0.08);\n}\n\nbody {\n  background:\n    radial-gradient(circle at 50% -120px, rgba(255, 210, 31, 0.18), transparent 330px),\n    linear-gradient(180deg, #04182e 0%, #071d36 100%);\n}\n\n.app-shell {\n  background:\n    linear-gradient(180deg, #071d36 0, #071d36 124px, var(--bg) 124px, var(--bg) 100%);\n}\n\n.home {\n  padding: 36px 26px 30px;\n  background:\n    radial-gradient(circle at 50% 4%, rgba(255, 210, 31, 0.18), transparent 30%),\n    linear-gradient(180deg, #071d36 0%, #06182d 100%);\n}\n\n.home-card {\n  max-width: 390px;\n  padding: 18px 0;\n}\n\n.brand-logo {\n  width: 210px;\n  margin-bottom: 24px;\n  filter: drop-shadow(0 12px 20px rgba(0, 0, 0, 0.28));\n}\n\n.home h1 {\n  font-size: 28px;\n  font-weight: 950;\n}\n\n.division {\n  font-size: 14px;\n  letter-spacing: 0.04em;\n}\n\n.home-tagline {\n  font-size: 23px;\n  line-height: 1.16 !important;\n  max-width: 310px !important;\n}\n\n.benefits {\n  width: 100%;\n  max-width: 300px;\n  padding: 14px 16px;\n  border: 1px solid rgba(255, 255, 255, 0.13);\n  border-radius: 12px;\n  background: rgba(255, 255, 255, 0.035);\n}\n\n.benefits span {\n  font-size: 15px;\n}\n\n.button-stack {\n  gap: 12px;\n}\n\n.btn {\n  min-height: 56px;\n  border-radius: 10px;\n  font-weight: 950;\n  font-size: 15px;\n  box-shadow: none;\n}\n\n.btn-primary {\n  background: linear-gradient(180deg, #ffd928 0%, #ffc414 100%);\n  box-shadow: 0 12px 24px rgba(255, 197, 20, 0.22);\n}\n\n.btn-secondary {\n  background: rgba(255, 255, 255, 0.025);\n  border-color: rgba(255, 255, 255, 0.46);\n}\n\n.btn-light {\n  background: rgba(255, 255, 255, 0.11);\n  border-color: rgba(255, 255, 255, 0.16);\n}\n\n.topbar {\n  background:\n    radial-gradient(circle at 90% 0%, rgba(255, 210, 31, 0.14), transparent 40%),\n    var(--navy);\n  padding: 14px 16px 18px;\n  box-shadow: 0 16px 30px rgba(7, 29, 54, 0.18);\n}\n\n.topbar-logo {\n  width: 58px;\n  height: 34px;\n  object-fit: contain;\n  border-radius: 4px;\n}\n\n.topbar button {\n  border-radius: 12px;\n  background: rgba(255, 255, 255, 0.08);\n  border-color: rgba(255, 255, 255, 0.14);\n  font-size: 24px;\n}\n\n.topbar-title strong {\n  color: #fff;\n  font-size: 15px;\n}\n\n.topbar-title span {\n  color: var(--yellow);\n  font-weight: 900;\n}\n\n.screen {\n  padding: 18px 16px 26px;\n}\n\n.progress {\n  padding: 0 2px;\n  margin-bottom: 14px;\n}\n\n.progress span {\n  height: 7px;\n  background: rgba(255, 255, 255, 0.42);\n}\n\n.progress .active {\n  background: var(--yellow);\n  box-shadow: 0 0 0 1px rgba(255, 210, 31, 0.18);\n}\n\n.card {\n  border: 1px solid rgba(190, 205, 222, 0.78);\n  border-radius: 14px;\n  padding: 18px;\n  box-shadow: var(--soft-shadow);\n}\n\n.card + .card {\n  margin-top: 16px;\n}\n\n.card h2 {\n  font-size: 24px;\n  letter-spacing: 0;\n}\n\n.card h3 {\n  font-size: 18px;\n}\n\n.card h2::after,\n.card h3::after {\n  content: \"\";\n  display: block;\n  width: 42px;\n  height: 4px;\n  margin-top: 8px;\n  border-radius: 999px;\n  background: var(--yellow);\n}\n\n.center-card h2::after,\n.success h2::after {\n  margin-left: auto;\n  margin-right: auto;\n}\n\nlabel {\n  font-size: 12px;\n  letter-spacing: 0.02em;\n  text-transform: uppercase;\n  color: #526174;\n}\n\ninput,\nselect,\ntextarea {\n  min-height: 50px;\n  border-radius: 10px;\n  background: #fbfdff;\n  border-color: #d7e1ee;\n  color: #0a1d35;\n  font-weight: 700;\n}\n\ninput:focus,\nselect:focus,\ntextarea:focus {\n  outline: none;\n  border-color: var(--yellow-2);\n  box-shadow: 0 0 0 3px rgba(255, 210, 31, 0.25);\n}\n\n.toggle-row {\n  border-radius: 12px;\n  min-height: 54px;\n  background: linear-gradient(180deg, #fff 0%, #f8fbff 100%);\n  box-shadow: 0 6px 16px rgba(7, 29, 54, 0.04);\n}\n\n.toggle-row input {\n  accent-color: var(--navy);\n}\n\n.photo-tile {\n  border-radius: 14px;\n  background: linear-gradient(180deg, #fff 0%, #f7faff 100%);\n  box-shadow: 0 8px 18px rgba(7, 29, 54, 0.05);\n}\n\n.photo-tile img {\n  border-radius: 10px;\n}\n\n.recommendation-box {\n  padding: 20px;\n  border-radius: 16px;\n  border-color: rgba(255, 210, 31, 0.45);\n  background:\n    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 248, 215, 0.75)),\n    #fff;\n  box-shadow: var(--soft-shadow);\n}\n\n.recommendation-box strong {\n  font-size: 31px;\n}\n\n.clean-list li {\n  padding: 11px 12px 11px 36px;\n  border: 1px solid #e1e9f2;\n  border-radius: 10px;\n  background: #fff;\n  font-weight: 750;\n}\n\n.clean-list li::before {\n  left: 14px;\n  top: 16px;\n}\n\n.level-grid {\n  gap: 12px;\n}\n\n.level-option {\n  border-radius: 14px;\n  padding: 15px;\n  background: linear-gradient(180deg, #fff 0%, #f8fbff 100%);\n  box-shadow: 0 8px 18px rgba(7, 29, 54, 0.045);\n}\n\n.level-option strong {\n  font-size: 18px;\n}\n\n.level-option span {\n  color: var(--navy);\n}\n\n.level-option input {\n  accent-color: var(--navy);\n}\n\n.level-option.selected {\n  background: linear-gradient(180deg, #fffdf1 0%, #fff7cc 100%);\n}\n\n.paint-catalog {\n  gap: 12px;\n}\n\n.paint-card {\n  border-radius: 16px;\n  padding: 12px;\n  box-shadow: 0 10px 22px rgba(7, 29, 54, 0.06);\n  background: linear-gradient(180deg, #fff 0%, #f8fbff 100%);\n}\n\n.paint-card.selected {\n  background: linear-gradient(180deg, #fffdf0 0%, #fff8d6 100%);\n}\n\n.paint-card.selected .paint-select {\n  background: var(--yellow);\n  color: var(--navy) !important;\n}\n\n.paint-can {\n  height: 118px;\n  width: 100%;\n  border-radius: 12px 12px 16px 16px;\n  box-shadow: inset -10px 0 18px rgba(7, 29, 54, 0.12), 0 12px 20px rgba(7, 29, 54, 0.08);\n}\n\n.paint-can b {\n  font-size: 15px;\n}\n\n.paint-info strong {\n  font-size: 17px;\n}\n\n.crew-grid {\n  gap: 10px;\n}\n\n.crew-card {\n  min-height: 104px;\n  border-radius: 14px;\n  background: linear-gradient(180deg, #fff 0%, #f7faff 100%);\n  box-shadow: 0 8px 18px rgba(7, 29, 54, 0.05);\n}\n\n.crew-card strong {\n  font-size: 30px;\n}\n\n.payment-preview {\n  border-radius: 14px;\n  padding: 15px;\n  border-color: rgba(255, 210, 31, 0.48);\n  background: linear-gradient(180deg, #fffdf0 0%, #fff8d7 100%);\n  box-shadow: 0 8px 18px rgba(7, 29, 54, 0.05);\n}\n\n.summary-line {\n  padding: 11px 0;\n  font-size: 14px;\n}\n\n.summary-line strong {\n  color: var(--navy);\n  font-weight: 950;\n}\n\n.total {\n  border-radius: 16px;\n  padding: 18px;\n  background:\n    radial-gradient(circle at 100% 0%, rgba(255, 210, 31, 0.18), transparent 46%),\n    var(--navy);\n  box-shadow: 0 16px 32px rgba(7, 29, 54, 0.22);\n}\n\n.total strong {\n  font-size: 26px;\n}\n\n.notice {\n  border-radius: 12px;\n  background: #fff9db;\n}\n\n.modal-backdrop {\n  align-items: center;\n  padding: 20px;\n  backdrop-filter: blur(3px);\n}\n\n.modal-sheet {\n  border-radius: 18px;\n  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.42);\n}\n\n.select-card {\n  border-radius: 14px;\n  padding: 15px;\n  box-shadow: 0 8px 18px rgba(7, 29, 54, 0.05);\n}\n\n.quote-document {\n  background: #fff;\n  border: 1px solid rgba(190, 205, 222, 0.78);\n  border-radius: 8px;\n  padding: clamp(18px, 3vw, 34px);\n  box-shadow: 0 18px 42px rgba(7, 29, 54, 0.1);\n}\n\n.quote-header {\n  display: grid;\n  grid-template-columns: 94px 1fr;\n  gap: 14px;\n  align-items: center;\n  padding-bottom: 14px;\n  border-bottom: 1px solid #e4ebf3;\n}\n\n.quote-header img {\n  width: 94px;\n  height: 58px;\n  object-fit: contain;\n  border-radius: 8px;\n  background: var(--navy);\n}\n\n.quote-header div {\n  display: grid;\n  gap: 3px;\n}\n\n.quote-header span {\n  color: var(--muted);\n  font-size: 12px;\n  font-weight: 950;\n  text-transform: uppercase;\n}\n\n.quote-header strong {\n  color: var(--navy);\n  font-size: 18px;\n  line-height: 1.15;\n}\n\n.quote-header small {\n  color: #506176;\n  font-weight: 800;\n}\n\n.quote-total-hero {\n  margin: 18px 0;\n  border-radius: 8px;\n  padding: clamp(18px, 2.8vw, 28px);\n  background:\n    radial-gradient(circle at 100% 0%, rgba(255, 210, 31, 0.18), transparent 48%),\n    var(--navy);\n  color: #fff;\n  display: grid;\n  gap: 4px;\n  box-shadow: 0 16px 32px rgba(7, 29, 54, 0.22);\n}\n\n.quote-total-hero span,\n.quote-total-hero small {\n  color: #d8e4f1;\n  font-weight: 900;\n}\n\n.quote-total-hero strong {\n  color: var(--yellow);\n  font-size: clamp(34px, 5vw, 54px);\n  line-height: 1;\n}\n\n.quote-kpis {\n  display: grid;\n  grid-template-columns: repeat(4, minmax(0, 1fr));\n  gap: 10px;\n  margin: 0 0 14px;\n}\n\n.quote-kpis div {\n  border: 1px solid #e2eaf3;\n  border-radius: 8px;\n  padding: 13px;\n  background: #fbfdff;\n  display: grid;\n  gap: 5px;\n}\n\n.quote-kpis span {\n  color: var(--muted);\n  font-size: 11px;\n  font-weight: 950;\n  text-transform: uppercase;\n}\n\n.quote-kpis strong {\n  color: var(--navy);\n  font-size: 16px;\n  line-height: 1.15;\n}\n\n.quote-layout {\n  display: grid;\n  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);\n  gap: 12px;\n}\n\n.quote-section {\n  border: 1px solid #e2eaf3;\n  border-radius: 8px;\n  padding: 14px;\n  margin-top: 12px;\n  background: linear-gradient(180deg, #fff 0%, #fbfdff 100%);\n}\n\n.quote-layout .quote-section {\n  margin-top: 0;\n}\n\n.quote-section h3 {\n  margin: 0 0 10px;\n  color: var(--navy);\n  font-size: 17px;\n}\n\n.quote-section h3::after {\n  content: \"\";\n  display: block;\n  width: 34px;\n  height: 3px;\n  margin-top: 7px;\n  border-radius: 999px;\n  background: var(--yellow);\n}\n\n.quote-scope {\n  color: #31445d;\n  line-height: 1.45;\n  margin: 8px 0 10px;\n  font-size: 14px;\n}\n\n.quote-chips {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 7px;\n}\n\n.quote-chips span {\n  border-radius: 999px;\n  background: #eef4fb;\n  color: var(--navy);\n  padding: 7px 10px;\n  font-size: 12px;\n  font-weight: 900;\n}\n\n.quote-note {\n  margin: 10px 0;\n  border: 1px solid #e2eaf3;\n  border-radius: 8px;\n  background: #f8fbff;\n  color: #405168;\n  padding: 11px 12px;\n  font-size: 13px;\n  font-weight: 750;\n  line-height: 1.45;\n}\n\n.quote-note strong {\n  color: var(--navy);\n}\n\n.process-ledger {\n  display: grid;\n  grid-template-columns: repeat(4, minmax(0, 1fr));\n  gap: 12px;\n}\n\n.process-ledger div {\n  min-height: 132px;\n  padding: 16px;\n  border: 1px solid var(--line);\n  border-radius: 8px;\n  background: #f8fbff;\n  display: grid;\n  gap: 8px;\n  align-content: start;\n}\n\n.process-ledger span {\n  color: var(--muted);\n  font-size: 12px;\n  font-weight: 900;\n  text-transform: uppercase;\n}\n\n.process-ledger strong {\n  color: var(--navy);\n  font-size: 22px;\n  line-height: 1.05;\n}\n\n.process-ledger small {\n  color: var(--muted);\n  font-size: 13px;\n  line-height: 1.32;\n}\n\n.feedback-section {\n  background: linear-gradient(180deg, #fff 0%, #f8fbff 100%);\n}\n\n.feedback-section textarea {\n  min-height: 118px;\n}\n\n.cost-section {\n  background: #fff;\n}\n\n.cost-table {\n  display: grid;\n  border: 1px solid #dfe8f2;\n  border-radius: 8px;\n  overflow: hidden;\n}\n\n.cost-row {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) auto;\n  gap: 16px;\n  align-items: center;\n  padding: 12px 14px;\n  border-bottom: 1px solid #e8eef6;\n  color: #27384f;\n}\n\n.cost-row:last-child {\n  border-bottom: 0;\n}\n\n.cost-row.header {\n  background: #eef4fb;\n  color: var(--navy);\n  font-size: 12px;\n  font-weight: 950;\n  text-transform: uppercase;\n}\n\n.cost-row span {\n  line-height: 1.35;\n}\n\n.cost-row strong {\n  color: var(--navy);\n  white-space: nowrap;\n}\n\n.cost-row.subtotal {\n  background: #fbfdff;\n  font-weight: 950;\n}\n\n.cost-row.total-row {\n  background: #071d36;\n  color: #fff;\n  font-size: 18px;\n  font-weight: 950;\n}\n\n.cost-row.total-row strong,\n.cost-row.total-row span {\n  color: #fff;\n}\n\n.supply-payment {\n  margin-top: 14px;\n}\n\n.quote-validity {\n  border: 1px solid #e2eaf3;\n  border-radius: 8px;\n  background: #fbfdff;\n  color: #43536a;\n  font-size: 13px;\n  font-weight: 800;\n  line-height: 1.45;\n  margin-top: 12px;\n  padding: 12px 14px;\n}\n\n.quote-actions {\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n}\n\n.recommendation-actions {\n  grid-template-columns: 1.1fr 0.9fr;\n}\n\n.premium-explain {\n  margin: 18px auto 14px;\n  max-width: 960px;\n  border: 1px solid rgba(255, 203, 31, 0.72);\n  border-radius: 8px;\n  background: linear-gradient(180deg, #fffef7 0%, #f8fbff 100%);\n  padding: clamp(16px, 2vw, 24px);\n  text-align: left;\n}\n\n.premium-explain h3 {\n  margin: 0 0 10px;\n  color: var(--navy);\n  font-size: clamp(22px, 2.2vw, 30px);\n}\n\n.premium-explain p {\n  margin: 0 0 12px;\n  color: #405168;\n  font-size: 16px;\n  line-height: 1.5;\n}\n\n.service-change-question {\n  margin: 18px 0 10px;\n  color: var(--navy);\n  font-size: clamp(20px, 2.1vw, 28px);\n  font-weight: 950;\n}\n\n.service-choice-panel {\n  margin-top: 18px;\n  text-align: left;\n  border-top: 1px solid #e2eaf3;\n  padding-top: 18px;\n}\n\n.service-choice-grid {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 12px;\n  margin-top: 14px;\n}\n\n.service-choice-card {\n  border: 1px solid #d8e3ef;\n  border-radius: 8px;\n  background: #fbfdff;\n  padding: 16px;\n  display: grid;\n  gap: 9px;\n}\n\n.service-choice-card.recommended {\n  border-color: var(--yellow-2);\n  background: #fff9db;\n}\n\n.service-choice-card.limited {\n  border-color: #f0b4b4;\n}\n\n.service-choice-card span {\n  color: var(--muted);\n  font-size: 11px;\n  font-weight: 950;\n  text-transform: uppercase;\n}\n\n.service-choice-card h4 {\n  margin: 0;\n  color: var(--navy);\n  font-size: 22px;\n}\n\n.service-choice-card p,\n.service-choice-card small {\n  margin: 0;\n  color: #43536a;\n  line-height: 1.4;\n}\n\n.service-choice-card > strong {\n  color: var(--navy);\n  font-size: 18px;\n}\n\n.full-btn {\n  width: 100%;\n  margin-top: 12px;\n}\n\n.network-hero {\n  min-height: 460px;\n  display: grid;\n  align-content: center;\n  gap: 12px;\n  color: #fff;\n  background:\n    linear-gradient(90deg, rgba(7, 29, 54, 0.98) 0%, rgba(7, 29, 54, 0.9) 43%, rgba(7, 29, 54, 0.5) 72%, rgba(7, 29, 54, 0.24) 100%),\n    url(\"/assets/emc-red-apoyo-pintor.png\") right center / cover no-repeat,\n    var(--navy);\n}\n\n.network-hero-photo {\n  display: none;\n}\n\n.network-hero h2 {\n  max-width: 720px;\n  color: #fff;\n  font-size: clamp(32px, 4.8vw, 56px);\n  line-height: 1.02;\n}\n\n.network-hero h2::after {\n  width: 58px;\n}\n\n.network-hero .muted {\n  max-width: 680px;\n  color: #dce7f3;\n  font-size: 16px;\n  line-height: 1.55;\n}\n\n.eyebrow {\n  color: var(--yellow);\n  font-size: 12px;\n  font-weight: 950;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n}\n\n.network-pill-grid {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 10px;\n  margin-top: 10px;\n}\n\n.network-pill-grid span {\n  border: 1px solid rgba(255, 210, 31, 0.48);\n  border-radius: 999px;\n  background: rgba(255, 255, 255, 0.09);\n  color: #fff;\n  padding: 9px 12px;\n  font-size: 13px;\n  font-weight: 950;\n}\n\n.senior-priority {\n  border: 2px solid rgba(255, 210, 31, 0.86);\n  border-radius: 8px;\n  background: linear-gradient(135deg, #fff8d7 0%, #fff 100%);\n  color: var(--navy);\n  padding: clamp(18px, 2.8vw, 30px);\n  display: grid;\n  gap: 10px;\n  box-shadow: 0 18px 38px rgba(7, 29, 54, 0.14);\n}\n\n.senior-priority strong {\n  color: var(--navy);\n  font-size: clamp(28px, 4.6vw, 56px);\n  line-height: 0.98;\n}\n\n.senior-priority span {\n  max-width: 780px;\n  color: #34435a;\n  font-size: clamp(16px, 1.7vw, 22px);\n  font-weight: 850;\n  line-height: 1.32;\n}\n\n.senior-priority.compact {\n  margin: 0 0 18px;\n  box-shadow: none;\n}\n\n.senior-priority.compact strong {\n  font-size: clamp(24px, 3vw, 38px);\n}\n\n.hero-priority {\n  width: min(100%, 780px);\n  margin: 8px 0 4px;\n}\n\n.form-priority {\n  margin: 0 0 18px;\n}\n\n.network-steps {\n  display: grid;\n  grid-template-columns: repeat(4, minmax(0, 1fr));\n  gap: 12px;\n  margin: 0 0 18px;\n}\n\n.network-steps div {\n  border: 1px solid #e0e8f2;\n  border-radius: 8px;\n  background: linear-gradient(180deg, #fff 0%, #f8fbff 100%);\n  padding: 14px;\n  display: grid;\n  gap: 6px;\n}\n\n.network-steps strong {\n  width: 32px;\n  height: 32px;\n  border-radius: 999px;\n  background: var(--yellow);\n  color: var(--navy);\n  display: grid;\n  place-items: center;\n  font-weight: 950;\n}\n\n.network-steps span {\n  color: var(--navy);\n  font-size: 15px;\n  font-weight: 950;\n}\n\n.network-steps small {\n  color: #526174;\n  line-height: 1.35;\n}\n\n.network-note {\n  margin-top: 14px;\n  border: 1px solid rgba(255, 210, 31, 0.5);\n  border-radius: 8px;\n  background: #fffdf0;\n  padding: 14px;\n  display: grid;\n  gap: 6px;\n}\n\n.network-note strong {\n  color: var(--navy);\n  font-size: 16px;\n}\n\n.network-note span {\n  color: #43536a;\n  line-height: 1.45;\n  font-weight: 800;\n}\n\n/* Website layout */\nbody {\n  background: #f2f6fb;\n}\n\n.app-shell {\n  width: 100%;\n  max-width: none;\n  min-height: 100vh;\n  margin: 0;\n  background: var(--bg);\n  box-shadow: none;\n}\n\n.home {\n  min-height: 100vh;\n  padding: 34px clamp(18px, 4vw, 64px);\n  background:\n    linear-gradient(90deg, rgba(7, 29, 54, 0.98) 0%, rgba(7, 29, 54, 0.9) 44%, rgba(7, 29, 54, 0.56) 74%, rgba(7, 29, 54, 0.34) 100%),\n    url(\"/assets/emc-uniforme-interior.png\") right center / min(52vw, 760px) cover no-repeat,\n    #071d36;\n  justify-content: flex-start;\n}\n\n.home-card {\n  width: min(100%, 1120px);\n  max-width: 1120px;\n  margin: 0 auto;\n  text-align: left;\n  display: grid;\n  align-content: center;\n  min-height: calc(100vh - 68px);\n}\n\n.home .brand-logo {\n  width: 188px;\n  max-width: 46vw;\n  margin: 0 0 34px;\n}\n\n.home h1 {\n  max-width: 760px;\n  font-size: clamp(38px, 6vw, 72px);\n  line-height: 0.98;\n}\n\n.home p {\n  margin-left: 0;\n  margin-right: 0;\n}\n\n.division {\n  font-size: 16px;\n}\n\n.home-tagline {\n  max-width: 620px !important;\n  font-size: clamp(24px, 3vw, 40px);\n  margin-top: 28px !important;\n}\n\n.benefits {\n  width: min(100%, 620px);\n  max-width: 620px;\n  margin: 0 0 30px;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n}\n\n.button-stack {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 12px;\n}\n\n.button-stack .btn {\n  min-width: 190px;\n}\n\n.client-method {\n  width: min(100%, 760px);\n  margin: 0 0 28px;\n}\n\n.client-method > span {\n  display: block;\n  margin-bottom: 10px;\n  color: var(--yellow);\n  font-size: 13px;\n  font-weight: 900;\n  text-transform: uppercase;\n  letter-spacing: 0;\n}\n\n.client-method-grid {\n  display: grid;\n  grid-template-columns: repeat(4, minmax(0, 1fr));\n  gap: 10px;\n}\n\n.client-method-card {\n  min-height: 116px;\n  padding: 14px;\n  border: 1px solid rgba(255, 255, 255, 0.18);\n  border-radius: 8px;\n  background: rgba(255, 255, 255, 0.08);\n  display: grid;\n  gap: 8px;\n  align-content: start;\n}\n\n.client-method-card small {\n  width: 28px;\n  height: 28px;\n  border-radius: 999px;\n  background: var(--yellow);\n  color: var(--navy);\n  display: grid;\n  place-items: center;\n  font-weight: 900;\n}\n\n.client-method-card strong {\n  color: var(--white);\n  font-size: 17px;\n  line-height: 1.05;\n}\n\n.client-method-card em {\n  color: rgba(255, 255, 255, 0.78);\n  font-size: 13px;\n  font-style: normal;\n  line-height: 1.28;\n}\n\n.topbar.site-header {\n  position: sticky;\n  top: 0;\n  min-height: 76px;\n  padding: 12px clamp(18px, 4vw, 56px);\n  justify-content: space-between;\n  box-shadow: 0 10px 28px rgba(7, 29, 54, 0.2);\n}\n\n.site-brand {\n  width: auto !important;\n  height: auto !important;\n  border: 0 !important;\n  background: transparent !important;\n  color: var(--white) !important;\n  display: flex !important;\n  align-items: center;\n  gap: 12px;\n  padding: 0 !important;\n  text-align: left;\n}\n\n.site-brand span {\n  display: grid;\n  gap: 2px;\n}\n\n.site-brand strong {\n  color: var(--white);\n  line-height: 1.05;\n}\n\n.site-brand small {\n  color: var(--yellow);\n  font-weight: 900;\n}\n\n.topbar-logo {\n  width: 58px;\n  height: 42px;\n  object-fit: contain;\n  border-radius: 6px;\n  background: #071d36;\n}\n\n.site-nav {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n.site-nav button {\n  width: auto !important;\n  height: auto !important;\n  min-height: 40px;\n  border-radius: 8px !important;\n  border: 1px solid rgba(255, 255, 255, 0.22) !important;\n  padding: 9px 13px;\n  background: rgba(255, 255, 255, 0.08) !important;\n  color: #f4f7fb !important;\n  font-weight: 900;\n}\n\n.site-nav button:hover {\n  background: var(--yellow) !important;\n  color: var(--navy) !important;\n}\n\n.topbar.site-header .topbar-title {\n  display: none;\n}\n\n.screen {\n  width: min(100%, 1180px);\n  margin: 0 auto;\n  padding: 34px clamp(18px, 4vw, 56px) 56px;\n}\n\n.client-path {\n  display: grid;\n  grid-template-columns: repeat(4, minmax(0, 1fr));\n  gap: 10px;\n  margin: 0 0 16px;\n}\n\n.client-path-step {\n  min-height: 84px;\n  padding: 12px;\n  border: 1px solid var(--line);\n  border-radius: 8px;\n  background: #fff;\n  color: var(--muted);\n  display: grid;\n  grid-template-columns: 30px 1fr;\n  column-gap: 10px;\n  row-gap: 4px;\n  align-items: start;\n}\n\n.client-path-step span {\n  width: 30px;\n  height: 30px;\n  border-radius: 999px;\n  background: #edf3fa;\n  color: var(--muted);\n  display: grid;\n  place-items: center;\n  font-weight: 900;\n}\n\n.client-path-step strong {\n  color: var(--navy);\n  font-size: 16px;\n  line-height: 1.05;\n}\n\n.client-path-step small {\n  grid-column: 2;\n  color: var(--muted);\n  font-size: 12px;\n  line-height: 1.25;\n}\n\n.client-path-step.done,\n.client-path-step.active {\n  border-color: rgba(255, 203, 31, 0.8);\n}\n\n.client-path-step.active {\n  background: #fff8d7;\n}\n\n.client-path-step.done span,\n.client-path-step.active span {\n  background: var(--yellow);\n  color: var(--navy);\n}\n\n.card {\n  border-radius: 8px;\n  padding: clamp(18px, 2.4vw, 30px);\n}\n\n.visual-card {\n  position: relative;\n  overflow: hidden;\n  isolation: isolate;\n}\n\n.visual-card::before {\n  content: \"\";\n  position: absolute;\n  inset: 0;\n  z-index: -2;\n  background:\n    linear-gradient(90deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.94) 54%, rgba(255, 255, 255, 0.76) 100%),\n    var(--visual-image) right center / min(42%, 430px) cover no-repeat;\n}\n\n.visual-card::after {\n  content: \"\";\n  position: absolute;\n  inset: auto 0 0 auto;\n  width: min(36vw, 360px);\n  height: min(36vw, 360px);\n  z-index: -1;\n  background: rgba(255, 210, 31, 0.16);\n  border-radius: 999px 0 0 0;\n}\n\n.project-visual {\n  --visual-image: url(\"/assets/emc-uniforme-exterior.png\");\n}\n\n.diagnostic-visual {\n  --visual-image: url(\"/assets/emc-uniforme-diagnostico.png\");\n}\n\n.recommendation-visual {\n  --visual-image: url(\"/assets/emc-uniforme-interior.png\");\n}\n\n.supply-visual {\n  --visual-image: url(\"/assets/emc-uniforme-interior.png\");\n}\n\n.work-visual {\n  position: relative;\n  min-height: clamp(220px, 32vw, 360px);\n  margin: 0 0 22px;\n  border-radius: 8px;\n  overflow: hidden;\n  background: var(--navy);\n  box-shadow: 0 18px 36px rgba(7, 29, 54, 0.16);\n}\n\n.work-visual img {\n  width: 100%;\n  height: 100%;\n  min-height: inherit;\n  display: block;\n  object-fit: cover;\n}\n\n.work-visual figcaption {\n  position: absolute;\n  inset: auto 0 0;\n  padding: 18px;\n  color: #fff;\n  display: grid;\n  gap: 5px;\n  background: linear-gradient(180deg, transparent 0%, rgba(7, 29, 54, 0.82) 56%, rgba(7, 29, 54, 0.96) 100%);\n}\n\n.work-visual strong {\n  color: #fff;\n  font-size: clamp(20px, 2.3vw, 30px);\n  line-height: 1.08;\n}\n\n.work-visual span {\n  max-width: 680px;\n  color: #e5edf7;\n  font-size: 14px;\n  font-weight: 800;\n  line-height: 1.35;\n}\n\n.crew-config-panel,\n.compact-config {\n  margin-top: 14px;\n  border: 1px solid #dfe8f2;\n  border-radius: 8px;\n  background: rgba(255, 255, 255, 0.92);\n  padding: 14px;\n}\n\n.compact-config {\n  grid-template-columns: minmax(220px, 360px);\n}\n\n.form-grid {\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 16px;\n}\n\n.form-grid .notice,\n.form-grid .check-row,\n.form-grid label:has(textarea),\n.form-grid label:has(input[type=\"file\"]) {\n  grid-column: 1 / -1;\n}\n\n.actions.single {\n  display: flex;\n  justify-content: flex-end;\n}\n\n.actions.single .btn {\n  min-width: 220px;\n}\n\n.back-row {\n  display: flex;\n  justify-content: flex-start;\n  margin: 0 0 14px;\n}\n\n.back-row .btn {\n  min-width: 150px;\n}\n\n.info-grid,\n.level-grid,\n.paint-catalog,\n.crew-grid {\n  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));\n}\n\n.sticky-estimate {\n  width: min(100% - 36px, 1180px);\n  left: 50%;\n  transform: translateX(-50%);\n  border-radius: 0 0 8px 8px;\n}\n\n@media (min-width: 720px) {\n  body {\n    padding: 0;\n  }\n\n  .app-shell {\n    border-radius: 0;\n    overflow: visible;\n    min-height: 100vh;\n  }\n}\n\n@media (max-width: 760px) {\n  .home {\n    min-height: auto;\n    background:\n      linear-gradient(180deg, rgba(7, 29, 54, 0.86) 0%, rgba(7, 29, 54, 0.96) 46%, rgba(7, 29, 54, 0.98) 100%),\n      url(\"/assets/emc-uniforme-interior.png\") center top / cover no-repeat,\n      #071d36;\n  }\n\n  .home-card {\n    min-height: auto;\n    text-align: center;\n  }\n\n  .home .brand-logo,\n  .home p,\n  .benefits,\n  .client-method {\n    margin-left: auto;\n    margin-right: auto;\n  }\n\n  .benefits,\n  .client-method-grid,\n  .process-ledger,\n  .quote-kpis,\n  .quote-layout,\n  .material-ledger,\n  .form-grid {\n    grid-template-columns: 1fr;\n  }\n\n  .visual-card::before {\n    background:\n      linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.94) 100%),\n      var(--visual-image) center bottom / 100% auto no-repeat;\n  }\n\n  .work-visual {\n    min-height: 260px;\n  }\n\n  .button-stack {\n    display: grid;\n  }\n\n  .site-nav {\n    width: 100%;\n    display: grid;\n    grid-template-columns: repeat(3, minmax(0, 1fr));\n    overflow-x: visible;\n    padding-bottom: 2px;\n  }\n\n  .site-nav button {\n    min-width: 0;\n    padding: 9px 8px;\n    font-size: 12px;\n    white-space: normal;\n  }\n\n  .quote-actions {\n    grid-template-columns: 1fr;\n  }\n\n  .recommendation-actions,\n  .service-choice-grid,\n  .network-steps {\n    grid-template-columns: 1fr;\n  }\n\n  .network-hero {\n    min-height: auto;\n    padding-top: 18px;\n    align-content: start;\n    background:\n      linear-gradient(180deg, rgba(7, 29, 54, 0.98) 0%, rgba(7, 29, 54, 0.94) 100%),\n      var(--navy);\n  }\n\n  .network-hero-photo {\n    display: block;\n    width: 100%;\n    aspect-ratio: 1.18;\n    object-fit: cover;\n    object-position: center;\n    border-radius: 8px;\n    border: 1px solid rgba(255, 255, 255, 0.18);\n    box-shadow: 0 18px 34px rgba(0, 0, 0, 0.24);\n    margin-bottom: 8px;\n  }\n\n  .network-hero h2 {\n    font-size: 30px;\n  }\n\n  .topbar.site-header {\n    align-items: flex-start;\n    flex-direction: column;\n  }\n\n  .client-path {\n    display: flex;\n    overflow-x: auto;\n    gap: 8px;\n    padding-bottom: 8px;\n    scroll-snap-type: x mandatory;\n  }\n\n  .client-path-step {\n    min-width: 174px;\n    min-height: 76px;\n    padding: 10px;\n    scroll-snap-align: start;\n  }\n\n  .client-path-step small {\n    font-size: 11px;\n  }\n}\n\n@media print {\n  body {\n    background: #fff !important;\n  }\n\n  .site-header,\n  .sticky-estimate,\n  .quote-actions,\n  .quote-document > .actions.single,\n  .modal-backdrop {\n    display: none !important;\n  }\n\n  .app-shell,\n  .screen {\n    width: 100% !important;\n    max-width: none !important;\n    margin: 0 !important;\n    padding: 0 !important;\n    background: #fff !important;\n    box-shadow: none !important;\n  }\n\n  .quote-document {\n    border: 0 !important;\n    border-radius: 0 !important;\n    box-shadow: none !important;\n    padding: 0 !important;\n  }\n\n  .quote-section,\n  .quote-kpis div,\n  .client-check,\n  .quote-process,\n  .quote-validity {\n    break-inside: avoid;\n  }\n\n  .quote-total-hero {\n    color: #071d36 !important;\n    background: #fff8d7 !important;\n    box-shadow: none !important;\n    border: 1px solid #f0d46b;\n  }\n\n  .quote-total-hero strong {\n    color: #071d36 !important;\n  }\n}\n\n/* Final polish: public client portal */\n:root {\n  --ink: #0a1c33;\n  --steel: #53647a;\n  --panel: #ffffff;\n  --panel-soft: #f8fbff;\n  --line-soft: #e3ebf5;\n  --focus: rgba(255, 210, 31, 0.28);\n}\n\nbody {\n  color: var(--ink);\n  background:\n    linear-gradient(180deg, #eaf1f9 0%, #f6f8fb 54%, #eef4fb 100%);\n}\n\n.site-header {\n  border-bottom: 1px solid rgba(255, 255, 255, 0.08);\n  background:\n    linear-gradient(90deg, #06182e 0%, #09213c 58%, #132c3f 100%) !important;\n}\n\n.site-brand strong {\n  font-size: clamp(18px, 2vw, 25px);\n}\n\n.site-nav button {\n  transition: background 160ms ease, color 160ms ease, border-color 160ms ease, transform 160ms ease;\n}\n\n.site-nav button:hover {\n  transform: translateY(-1px);\n}\n\n.screen {\n  padding-top: clamp(24px, 3.4vw, 44px);\n}\n\n.client-path {\n  gap: 12px;\n}\n\n.client-path-step {\n  border-color: var(--line-soft);\n  background:\n    linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 251, 255, 0.98) 100%);\n  box-shadow: 0 10px 24px rgba(7, 29, 54, 0.055);\n}\n\n.client-path-step.active {\n  background:\n    linear-gradient(180deg, #fffaf0 0%, #fff6cc 100%);\n  box-shadow: 0 14px 30px rgba(255, 196, 20, 0.15);\n}\n\n.card,\n.quote-section,\n.quote-kpis div,\n.client-check,\n.success-summary,\n.premium-explain,\n.service-choice-card,\n.network-steps div,\n.material-summary > div {\n  border-color: var(--line-soft);\n  box-shadow: 0 14px 34px rgba(7, 29, 54, 0.07);\n}\n\n.card {\n  background:\n    linear-gradient(180deg, rgba(255, 255, 255, 0.99) 0%, rgba(252, 254, 255, 0.99) 100%);\n}\n\n.visual-card::after {\n  opacity: 0.8;\n}\n\ninput,\nselect,\ntextarea {\n  border-color: #dce6f1;\n  background: #fcfdff;\n  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);\n}\n\ninput:focus,\nselect:focus,\ntextarea:focus {\n  border-color: #f3bd14;\n  box-shadow: 0 0 0 4px var(--focus);\n}\n\n.btn {\n  transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease, border-color 160ms ease;\n}\n\n.btn:hover {\n  box-shadow: 0 12px 22px rgba(7, 29, 54, 0.12);\n}\n\n.btn-primary:hover {\n  box-shadow: 0 16px 26px rgba(255, 196, 20, 0.26);\n}\n\n.btn-ghost {\n  background: #fff;\n  border-color: #dce6f1;\n  color: var(--ink);\n}\n\n.recommendation-box,\n.assistant-panel,\n.senior-priority,\n.service-choice-card.recommended {\n  border-color: rgba(255, 203, 31, 0.72);\n}\n\n.recommendation-box strong,\n.service-choice-card h4,\n.quote-total-hero strong,\n.total strong {\n  letter-spacing: 0;\n}\n\n.level-option,\n.paint-card,\n.supply-card,\n.select-card,\n.photo-tile,\n.crew-card {\n  border-color: var(--line-soft);\n  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;\n}\n\n.level-option:hover,\n.paint-card:hover,\n.supply-card:hover,\n.select-card:hover,\n.photo-tile:hover,\n.crew-card:hover {\n  transform: translateY(-1px);\n  box-shadow: 0 16px 30px rgba(7, 29, 54, 0.09);\n}\n\n.selected,\n.paint-card.selected,\n.supply-card.selected,\n.level-option.selected,\n.crew-card.selected {\n  border-color: #ffc414;\n  box-shadow: 0 0 0 3px rgba(255, 210, 31, 0.28), 0 16px 32px rgba(7, 29, 54, 0.08);\n}\n\n.quote-document {\n  border-color: #d8e3ef;\n  box-shadow: 0 24px 56px rgba(7, 29, 54, 0.12);\n}\n\n.quote-header {\n  border-bottom-color: #dfe8f2;\n}\n\n.quote-total-hero {\n  background:\n    radial-gradient(circle at 96% 12%, rgba(255, 210, 31, 0.24), transparent 34%),\n    linear-gradient(135deg, #06182e 0%, #09213c 62%, #0e304f 100%);\n}\n\n.cost-row.header {\n  background: #eaf1f9;\n}\n\n.cost-row.total-row {\n  background:\n    linear-gradient(135deg, #06182e 0%, #09213c 100%);\n}\n\n.quote-validity,\n.quote-note,\n.payment-preview,\n.risk-rule,\n.network-note {\n  border-color: rgba(255, 203, 31, 0.45);\n  background: #fffdf2;\n}\n\n.modal-sheet {\n  border: 1px solid rgba(255, 255, 255, 0.56);\n}\n\n@media (max-width: 760px) {\n  .site-brand strong {\n    font-size: 18px;\n  }\n\n  .screen {\n    padding-top: 24px;\n  }\n\n  .client-path-step {\n    min-height: 74px;\n  }\n}\n\n/* Red EMC must keep its photo treatment over generic card polish */\n.network-hero.card {\n  border-color: rgba(255, 210, 31, 0.2);\n  color: #fff;\n  background:\n    linear-gradient(90deg, rgba(7, 29, 54, 0.98) 0%, rgba(7, 29, 54, 0.9) 43%, rgba(7, 29, 54, 0.5) 72%, rgba(7, 29, 54, 0.24) 100%),\n    url(\"/assets/emc-red-apoyo-pintor.png\") right center / cover no-repeat,\n    var(--navy);\n}\n\n.network-hero.card h2,\n.network-hero.card .muted,\n.network-hero.card .network-pill-grid span {\n  color: #fff;\n}\n\n.network-hero.card .muted {\n  color: #dce7f3;\n}\n\n@media (max-width: 760px) {\n  .network-hero.card {\n    background:\n      linear-gradient(180deg, rgba(7, 29, 54, 0.98) 0%, rgba(7, 29, 54, 0.94) 100%),\n      var(--navy);\n  }\n}\n"};

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8'
};

function ensureDataFiles() {
  if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });
  if (!fs.existsSync(QUOTES_FILE)) fs.writeFileSync(QUOTES_FILE, '[]');
  if (!fs.existsSync(COLLABORATORS_FILE)) fs.writeFileSync(COLLABORATORS_FILE, '[]');
  if (!fs.existsSync(ANALYTICS_FILE)) fs.writeFileSync(ANALYTICS_FILE, '[]');
}

function readJson(file) {
  ensureDataFiles();
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

async function supabaseRequest(table, { method = 'GET', query = '', body = null, prefer = '' } = {}) {
  if (!USE_SUPABASE) throw new Error('Supabase no configurado');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Error Supabase ${response.status}`);
  }
  return data;
}

async function loadConfigRecord() {
  const localConfig = readJson(CONFIG_FILE);
  const withPublicContact = config => ({
    ...config,
    contact: {
      ...(config.contact || {}),
      whatsapp: PUBLIC_WHATSAPP_NUMBER || config.contact?.whatsapp || ''
    }
  });
  if (!USE_SUPABASE) return withPublicContact(localConfig);

  try {
    const rows = await supabaseRequest('emc_quotes', {
      query: `?folio=eq.${CONFIG_RECORD_FOLIO}&select=payload&limit=1`
    });
    if (rows?.[0]?.payload) return withPublicContact(rows[0].payload);

    await saveConfigRecord(localConfig);
    return withPublicContact(localConfig);
  } catch (error) {
    console.warn(`No se pudo leer la configuración compartida; se usará configuración local: ${error.message}`);
    return withPublicContact(localConfig);
  }
}

async function saveConfigRecord(config) {
  writeJson(CONFIG_FILE, config);
  if (!USE_SUPABASE) return config;

  const now = new Date().toISOString();
  const rows = await supabaseRequest('emc_quotes', {
    method: 'POST',
    query: '?on_conflict=folio',
    body: {
      folio: CONFIG_RECORD_FOLIO,
      status: 'Sistema',
      created_at: now,
      updated_at: now,
      total: 0,
      payload: config
    },
    prefer: 'resolution=merge-duplicates,return=representation'
  });
  return rows?.[0]?.payload || config;
}

function quoteRow(quote, { extended = true } = {}) {
  const row = {
    folio: quote.folio,
    status: quote.status || 'Nueva',
    created_at: quote.createdAt,
    updated_at: quote.updatedAt || null,
    valid_until: quote.validUntil || null,
    client_name: quote.client?.name || '',
    client_phone: quote.client?.phone || '',
    client_city: quote.client?.city || '',
    total: Number(quote.calculation?.total || 0),
    payload: quote
  };
  if (extended) {
    row.client_company = quote.client?.company || '';
    row.client_type = quote.client?.propertyType || '';
    row.service_need = quote.client?.serviceNeed || '';
    row.urgency = quote.client?.urgency || '';
  }
  return row;
}

function collaboratorRow(record) {
  return {
    id: record.id,
    status: record.status || 'Nuevo',
    created_at: record.createdAt,
    name: record.name || '',
    phone: record.phone || '',
    city: record.city || '',
    zone: record.zone || '',
    age: Number(record.age || 0),
    preferential_review: Boolean(record.preferentialReview),
    payload: record
  };
}

async function listQuotes() {
  if (!USE_SUPABASE) return readJson(QUOTES_FILE);
  const rows = await supabaseRequest('emc_quotes', {
    query: `?folio=not.in.(${CONFIG_RECORD_FOLIO},${ANALYTICS_RECORD_FOLIO})&select=payload&order=created_at.desc`
  });
  return rows
    .map(row => row.payload)
    .filter(item => item?.folio);
}

async function createQuoteRecord(quote) {
  if (!USE_SUPABASE) {
    const quotes = readJson(QUOTES_FILE);
    quotes.unshift(quote);
    writeJson(QUOTES_FILE, quotes);
    return quote;
  }
  let rows;
  try {
    rows = await supabaseRequest('emc_quotes', {
      method: 'POST',
      body: quoteRow(quote),
      prefer: 'return=representation'
    });
  } catch (error) {
    if (!/client_company|client_type|service_need|urgency|schema cache|column/i.test(error.message)) throw error;
    rows = await supabaseRequest('emc_quotes', {
      method: 'POST',
      body: quoteRow(quote, { extended: false }),
      prefer: 'return=representation'
    });
  }
  return rows?.[0]?.payload || quote;
}

async function updateQuoteRecord(quoteFolio, changes) {
  const quotes = await listQuotes();
  const quote = quotes.find(item => item.folio === quoteFolio);
  if (!quote) return null;
  quote.status = changes.status || quote.status;
  quote.adminNotes = changes.adminNotes ?? quote.adminNotes;
  quote.updatedAt = new Date().toISOString();

  if (!USE_SUPABASE) {
    writeJson(QUOTES_FILE, quotes);
    return quote;
  }

  let rows;
  try {
    rows = await supabaseRequest('emc_quotes', {
      method: 'PATCH',
      query: `?folio=eq.${encodeURIComponent(quoteFolio)}`,
      body: quoteRow(quote),
      prefer: 'return=representation'
    });
  } catch (error) {
    if (!/client_company|client_type|service_need|urgency|schema cache|column/i.test(error.message)) throw error;
    rows = await supabaseRequest('emc_quotes', {
      method: 'PATCH',
      query: `?folio=eq.${encodeURIComponent(quoteFolio)}`,
      body: quoteRow(quote, { extended: false }),
      prefer: 'return=representation'
    });
  }
  return rows?.[0]?.payload || quote;
}

async function deleteQuoteRecord(quoteFolio) {
  if (!USE_SUPABASE) {
    const quotes = readJson(QUOTES_FILE);
    const nextQuotes = quotes.filter(item => item.folio !== quoteFolio);
    if (nextQuotes.length === quotes.length) return false;
    writeJson(QUOTES_FILE, nextQuotes);
    return true;
  }
  const rows = await supabaseRequest('emc_quotes', {
    method: 'DELETE',
    query: `?folio=eq.${encodeURIComponent(quoteFolio)}`,
    prefer: 'return=representation'
  });
  return Boolean(rows?.length);
}

async function listCollaborators() {
  if (!USE_SUPABASE) return readJson(COLLABORATORS_FILE);
  const rows = await supabaseRequest('emc_collaborators', {
    query: '?select=payload&order=created_at.desc'
  });
  return rows.map(row => row.payload);
}

async function createCollaboratorRecord(record) {
  if (!USE_SUPABASE) {
    const collaborators = readJson(COLLABORATORS_FILE);
    collaborators.unshift(record);
    writeJson(COLLABORATORS_FILE, collaborators);
    return record;
  }
  const rows = await supabaseRequest('emc_collaborators', {
    method: 'POST',
    body: collaboratorRow(record),
    prefer: 'return=representation'
  });
  return rows?.[0]?.payload || record;
}

async function deleteCollaboratorRecord(collaboratorId) {
  if (!USE_SUPABASE) {
    const collaborators = readJson(COLLABORATORS_FILE);
    const nextCollaborators = collaborators.filter(item => item.id !== collaboratorId);
    if (nextCollaborators.length === collaborators.length) return false;
    writeJson(COLLABORATORS_FILE, nextCollaborators);
    return true;
  }
  const rows = await supabaseRequest('emc_collaborators', {
    method: 'DELETE',
    query: `?id=eq.${encodeURIComponent(collaboratorId)}`,
    prefer: 'return=representation'
  });
  return Boolean(rows?.length);
}

function analyticsAccessAllowed(req, url) {
  const configuredPassword = process.env.VISITS_PASSWORD || ADMIN_PASSWORD;
  const queryPassword = url.searchParams.get('clave') || '';
  return isAdmin(req) || (configuredPassword && queryPassword === configuredPassword);
}

function recordsAccessAllowed(req, url) {
  const configuredPassword = process.env.RECORDS_PASSWORD || process.env.VISITS_PASSWORD || ADMIN_PASSWORD;
  const queryPassword = url.searchParams.get('clave') || '';
  return isAdmin(req) || (configuredPassword && queryPassword === configuredPassword);
}

function clientIpHash(req) {
  const raw = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0]
    .trim();
  return crypto.createHash('sha256').update(`${raw}:emc-pintura`).digest('hex').slice(0, 16);
}

function normalizeAnalyticsPath(value) {
  const text = String(value || '/cliente/').slice(0, 220);
  try {
    const parsed = new URL(text, 'https://emc.local');
    return parsed.pathname || '/cliente/';
  } catch (error) {
    return text.startsWith('/') ? text : '/cliente/';
  }
}

function cleanAnalyticsEvent(req, body = {}) {
  const allowedTypes = new Set([
    'pageview',
    'quote_start',
    'quote_step',
    'quote_sent',
    'whatsapp_click',
    'collaborator_start',
    'collaborator_sent'
  ]);
  const type = allowedTypes.has(body.type) ? body.type : 'pageview';
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    type,
    path: normalizeAnalyticsPath(body.path),
    title: String(body.title || '').slice(0, 160),
    referrer: String(body.referrer || '').slice(0, 280),
    sessionId: String(body.sessionId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80),
    step: Number.isFinite(Number(body.step)) ? Number(body.step) : null,
    detail: String(body.detail || '').slice(0, 160),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 220),
    ipHash: clientIpHash(req)
  };
}

async function listAnalyticsEvents() {
  if (!USE_SUPABASE) return readJson(ANALYTICS_FILE);
  const rows = await supabaseRequest('emc_quotes', {
    query: `?folio=eq.${ANALYTICS_RECORD_FOLIO}&select=payload&limit=1`
  });
  return Array.isArray(rows?.[0]?.payload?.events) ? rows[0].payload.events : [];
}

async function saveAnalyticsEvents(events) {
  const cleanEvents = events
    .filter(Boolean)
    .slice(-MAX_ANALYTICS_EVENTS);

  if (!USE_SUPABASE) {
    writeJson(ANALYTICS_FILE, cleanEvents);
    return cleanEvents;
  }

  const now = new Date().toISOString();
  await supabaseRequest('emc_quotes', {
    method: 'POST',
    query: '?on_conflict=folio',
    body: {
      folio: ANALYTICS_RECORD_FOLIO,
      status: 'Sistema',
      created_at: now,
      updated_at: now,
      total: 0,
      payload: { events: cleanEvents, updatedAt: now }
    },
    prefer: 'resolution=merge-duplicates,return=minimal'
  });
  return cleanEvents;
}

async function createAnalyticsEvent(req, body) {
  const event = cleanAnalyticsEvent(req, body);
  const events = await listAnalyticsEvents();
  events.push(event);
  await saveAnalyticsEvents(events);
  return { ok: true, id: event.id };
}

async function deleteAnalyticsEvent(eventId) {
  const events = await listAnalyticsEvents();
  const nextEvents = events.filter(event => event.id !== eventId);
  if (nextEvents.length === events.length) return false;
  await saveAnalyticsEvents(nextEvents);
  return true;
}

function sameDay(date, reference) {
  return date.toISOString().slice(0, 10) === reference.toISOString().slice(0, 10);
}

function uniqueCount(events, key) {
  return new Set(events.map(event => event[key]).filter(Boolean)).size;
}

function topCounts(events, mapper, limit = 8) {
  const counts = new Map();
  for (const event of events) {
    const value = mapper(event);
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function analyticsSummary(events) {
  const now = new Date();
  const todayEvents = events.filter(event => sameDay(new Date(event.createdAt), now));
  const last7 = events.filter(event => Date.now() - new Date(event.createdAt).getTime() <= 7 * 24 * 60 * 60 * 1000);
  const last30 = events.filter(event => Date.now() - new Date(event.createdAt).getTime() <= 30 * 24 * 60 * 60 * 1000);
  const pageviews = events.filter(event => event.type === 'pageview');

  return {
    updatedAt: new Date().toISOString(),
    totals: {
      todayVisits: todayEvents.filter(event => event.type === 'pageview').length,
      todayPeople: uniqueCount(todayEvents, 'sessionId') || uniqueCount(todayEvents, 'ipHash'),
      last7Visits: last7.filter(event => event.type === 'pageview').length,
      last30Visits: last30.filter(event => event.type === 'pageview').length,
      quoteStarts: events.filter(event => event.type === 'quote_start').length,
      quoteSent: events.filter(event => event.type === 'quote_sent').length,
      whatsappClicks: events.filter(event => event.type === 'whatsapp_click').length
    },
    topPages: topCounts(pageviews, event => event.path),
    topReferrers: topCounts(pageviews, event => {
      if (!event.referrer) return 'Directo / WhatsApp';
      try {
        return new URL(event.referrer).hostname.replace(/^www\./, '');
      } catch (error) {
        return event.referrer;
      }
    }),
    recent: events.slice(-60).reverse()
  };
}

function quoteRecordSummary(quote) {
  const client = quote.client || quote.customer || {};
  const project = quote.project || {};
  const calculation = quote.calculation || {};
  return {
    folio: quote.folio || '',
    status: quote.status || 'Nueva',
    createdAt: quote.createdAt || quote.created_at || '',
    validUntil: quote.validUntil || '',
    name: client.name || '',
    company: client.company || '',
    phone: client.phone || '',
    email: client.email || '',
    address: client.address || '',
    city: client.city || '',
    propertyType: client.propertyType || '',
    serviceNeed: client.serviceNeed || calculation.levelLabel || calculation.level || '',
    urgency: client.urgency || '',
    area: calculation.area ?? project.squareMeters ?? project.totalSquareMeters ?? '',
    level: calculation.levelLabel || calculation.level || '',
    paintSupply: quote.service?.paintSupply || '',
    total: Number(calculation.totalWithIva ?? calculation.finalTotal ?? calculation.total ?? 0),
    observations: quote.observations || '',
    adminNotes: quote.adminNotes || ''
  };
}

function sameCalendarDay(value, reference = new Date()) {
  if (!value) return false;
  return new Date(value).toISOString().slice(0, 10) === reference.toISOString().slice(0, 10);
}

function recordsSummary(quotes) {
  const records = quotes.map(quoteRecordSummary);
  return {
    updatedAt: new Date().toISOString(),
    totals: {
      total: records.length,
      newQuotes: records.filter(record => record.status === 'Nueva').length,
      urgentQuotes: records.filter(record => /urgente/i.test(record.urgency)).length,
      todayQuotes: records.filter(record => sameCalendarDay(record.createdAt)).length
    },
    records
  };
}

function send(res, status, body, contentType = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) {
        reject(new Error('Payload demasiado grande'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function isAdmin(req) {
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${ADMIN_TOKEN}`;
}

function folio() {
  const date = new Date();
  const stamp = date.toISOString().slice(2, 10).replace(/-/g, '');
  const random = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `EMC-PIN-${stamp}-${random}`;
}

function money(value) {
  return Number(value || 0).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN'
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getPublicBaseUrl(req) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL;
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  return `${protocol}://${host}`.replace(/\/+$/, '');
}

function getAdminPanelUrl(req) {
  if (ADMIN_PANEL_URL) return ADMIN_PANEL_URL;
  if (PUBLIC_CLIENT_ONLY) return '';
  return `${getPublicBaseUrl(req)}/admin/`;
}

async function sendEmailAlert({ subject, text, html }) {
  if (!RESEND_API_KEY || !ALERT_EMAIL_FROM || !ALERT_EMAIL_TO) {
    console.log('Alerta de correo no enviada: faltan RESEND_API_KEY, ALERT_EMAIL_FROM o ALERT_EMAIL_TO.');
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: ALERT_EMAIL_FROM,
      to: ALERT_EMAIL_TO.split(',').map(email => email.trim()).filter(Boolean),
      subject,
      text,
      html
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Resend rechazo el correo: ${details}`);
  }
}

function notifyNewQuote(req, quote) {
  const adminUrl = getAdminPanelUrl(req);
  const customer = quote.client || quote.customer || {};
  const project = quote.project || {};
  const calculation = quote.calculation || {};
  const subject = `EMC Suministros y Servicios: nueva solicitud ${quote.folio}`;
  const total = calculation.totalWithIva ?? calculation.finalTotal ?? calculation.total ?? 0;
  const level = customer.serviceNeed || calculation.levelLabel || calculation.level || project.selectedLevel || 'Pendiente';
  const area = calculation.area ?? project.squareMeters ?? project.totalSquareMeters ?? '';
  const lines = [
    'Revisa el panel EMC. Tienes una solicitud nueva.',
    '',
    `Folio: ${quote.folio}`,
    `Cliente: ${customer.name || 'Sin nombre'}`,
    `Casa/negocio/empresa: ${customer.company || 'Sin dato'}`,
    `Telefono: ${customer.phone || 'Sin telefono'}`,
    `Ciudad: ${customer.city || 'Sin ciudad'}`,
    `Tipo de cliente: ${customer.propertyType || 'Sin tipo'}`,
    `Servicio solicitado: ${customer.serviceNeed || 'Sin servicio'}`,
    `Urgencia: ${customer.urgency || 'Sin urgencia'}`,
    `Direccion: ${customer.address || 'Sin direccion'}`,
    `Area: ${area ? `${area} m2` : 'Pendiente'}`,
    `Nivel/servicio calculado: ${level}`,
    `Total estimado: ${money(total)}`,
    `Comentarios: ${quote.observations || 'Sin comentarios'}`,
    '',
    adminUrl ? `Panel administrador: ${adminUrl}` : 'Abre tu panel privado EMC para revisar la solicitud.'
  ];

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.45;color:#0b1f36">
      <h2 style="margin:0 0 12px">Revisa el panel EMC</h2>
      <p>Tienes una solicitud nueva de servicios.</p>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;border:1px solid #dbe5f1">
        <tr><td><strong>Folio</strong></td><td>${escapeHtml(quote.folio)}</td></tr>
        <tr><td><strong>Cliente</strong></td><td>${escapeHtml(customer.name || 'Sin nombre')}</td></tr>
        <tr><td><strong>Casa/negocio/empresa</strong></td><td>${escapeHtml(customer.company || 'Sin dato')}</td></tr>
        <tr><td><strong>Telefono</strong></td><td>${escapeHtml(customer.phone || 'Sin telefono')}</td></tr>
        <tr><td><strong>Ciudad</strong></td><td>${escapeHtml(customer.city || 'Sin ciudad')}</td></tr>
        <tr><td><strong>Tipo de cliente</strong></td><td>${escapeHtml(customer.propertyType || 'Sin tipo')}</td></tr>
        <tr><td><strong>Servicio solicitado</strong></td><td>${escapeHtml(customer.serviceNeed || 'Sin servicio')}</td></tr>
        <tr><td><strong>Urgencia</strong></td><td>${escapeHtml(customer.urgency || 'Sin urgencia')}</td></tr>
        <tr><td><strong>Direccion</strong></td><td>${escapeHtml(customer.address || 'Sin direccion')}</td></tr>
        <tr><td><strong>Area</strong></td><td>${escapeHtml(area ? `${area} m2` : 'Pendiente')}</td></tr>
        <tr><td><strong>Nivel/servicio calculado</strong></td><td>${escapeHtml(level)}</td></tr>
        <tr><td><strong>Total estimado</strong></td><td>${escapeHtml(money(total))}</td></tr>
        <tr><td><strong>Comentarios</strong></td><td>${escapeHtml(quote.observations || 'Sin comentarios')}</td></tr>
      </table>
      ${adminUrl ? `<p><a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:#0b1f36;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px">Abrir panel EMC</a></p>` : '<p>Abre tu panel privado EMC para revisar la solicitud.</p>'}
    </div>
  `;

  sendEmailAlert({ subject, text: lines.join('\n'), html })
    .catch(error => console.error('No se pudo enviar alerta de cotizacion:', error.message));
}

function notifyNewCollaborator(req, record) {
  const adminUrl = getAdminPanelUrl(req);
  const subject = 'EMC Pintura: nuevo colaborador registrado';
  const text = [
    'Revisa el panel EMC. Tienes un colaborador nuevo en la red.',
    '',
    `Nombre: ${record.name || 'Sin nombre'}`,
    `Telefono: ${record.phone || 'Sin telefono'}`,
    `Ciudad: ${record.city || 'Sin ciudad'}`,
    `Servicio: ${record.service || 'Sin servicio'}`,
    '',
    adminUrl ? `Panel administrador: ${adminUrl}` : 'Abre tu panel privado EMC para revisar el registro.'
  ].join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.45;color:#0b1f36">
      <h2 style="margin:0 0 12px">Nuevo colaborador EMC</h2>
      <p>Alguien se registro para formar parte de la Red EMC.</p>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;border:1px solid #dbe5f1">
        <tr><td><strong>Nombre</strong></td><td>${escapeHtml(record.name || 'Sin nombre')}</td></tr>
        <tr><td><strong>Telefono</strong></td><td>${escapeHtml(record.phone || 'Sin telefono')}</td></tr>
        <tr><td><strong>Ciudad</strong></td><td>${escapeHtml(record.city || 'Sin ciudad')}</td></tr>
        <tr><td><strong>Servicio</strong></td><td>${escapeHtml(record.service || 'Sin servicio')}</td></tr>
      </table>
      ${adminUrl ? `<p><a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:#0b1f36;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px">Abrir panel EMC</a></p>` : '<p>Abre tu panel privado EMC para revisar el registro.</p>'}
    </div>
  `;

  sendEmailAlert({ subject, text, html })
    .catch(error => console.error('No se pudo enviar alerta de colaborador:', error.message));
}

function parseJsonFromText(text) {
  const cleaned = String(text || '').replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  return JSON.parse(cleaned);
}

async function analyzePhotosWithOpenAI(body) {
  if (!OPENAI_API_KEY) {
    return {
      enabled: false,
      status: 'missing_api_key',
      summary: 'Fotos recibidas. Pendiente revisión visual EMC antes de confirmar el nivel de servicio.',
      minimumLevel: 'medio',
      confidence: 0,
      photoQuality: 'Pendiente de revisión',
      signals: [{ type: 'revision', severity: 'media', evidence: 'Fotos cargadas para validación EMC.' }],
      alerts: ['EMC debe revisar visualmente las fotos antes de confirmar Básico.'],
      questions: ['Revisar fotos manualmente antes de confirmar precio final.']
    };
  }

  const photos = Array.isArray(body.photos) ? body.photos.slice(0, 10) : [];
  if (photos.length < 1) throw new Error('No se recibieron fotos para analizar');

  const content = [
    {
      type: 'input_text',
      text: `Eres un asistente técnico de EMC Pintura. Analiza fotos de muros/superficies para cotización preliminar.

No emitas diagnóstico definitivo. Solo señales visuales y riesgo comercial.

Reglas de nivel mínimo:
- basico: SOLO superficie aparentemente sana, sin humedad, sin salitre, sin moho, sin pintura desprendida y sin resanes relevantes.
- medio: desgaste normal, lijado/raspado probable, pintura suelta menor, resanes menores, cambio fuerte de color o preparación ligera.
- premium: cualquier humedad visible, moho, salitre/manchas blancas, desprendimiento amplio, resanes fuertes, sellador requerido, superficie deteriorada o riesgo alto.

Regla comercial crítica:
- Si ves humedad, moho, salitre, desprendimiento notorio o superficie deteriorada, NO recomiendes basico.
- Si la imagen no es suficiente para descartar humedad o desprendimiento, usa medio como mínimo y pide revisión EMC.
- No subas el nivel a premium solo por altura, exterior, andamio, escalera o dificultad de acceso. Esos conceptos son costos/equipo de acceso separados.
- Si la casa o superficie se ve nueva/sana y no hay daño visible, el nivel mínimo puede ser basico aunque el trabajo sea exterior o requiera revisar acceso.

Responde SOLO JSON válido con esta forma:
{
  "enabled": true,
  "status": "ok",
  "summary": "texto corto",
  "minimumLevel": "basico|medio|premium",
  "confidence": 0.0,
  "photoQuality": "buena|regular|mala",
  "signals": [{"type":"humedad|salitre|desprendimiento|grietas|resanes|suciedad|acceso|otro","severity":"baja|media|alta","evidence":"texto breve"}],
  "alerts": ["texto"],
  "questions": ["texto"],
  "recommendedActions": ["texto"]
}

Datos del cliente/cuestionario:
${JSON.stringify(body.context || {}, null, 2)}`
    },
    ...photos.map(photo => ({
      type: 'input_image',
      image_url: photo.dataUrl,
      detail: 'high'
    }))
  ];

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: OPENAI_VISION_MODEL,
      input: [{ role: 'user', content }],
      temperature: 0.1,
      max_output_tokens: 1200
    })
  });

  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'No se pudo analizar la imagen');
  const text = result.output_text || result.output?.flatMap(item => item.content || []).map(item => item.text || '').join('\n');
  const analysis = parseJsonFromText(text);
  if (!['basico', 'medio', 'premium'].includes(analysis.minimumLevel)) analysis.minimumLevel = 'medio';
  const signals = Array.isArray(analysis.signals) ? analysis.signals : [];
  const surfaceText = [
    analysis.summary,
    ...signals.map(signal => `${signal.type || ''} ${signal.severity || ''} ${signal.evidence || ''}`)
  ].join(' ').toLowerCase();
  const hasPremiumSignal = signals.some(signal => {
    const type = String(signal.type || '').toLowerCase();
    const severity = String(signal.severity || '').toLowerCase();
    return ['humedad', 'moho', 'salitre'].includes(type)
      || (['resanes', 'desprendimiento', 'grietas'].includes(type) && severity === 'alta');
  }) || /deterior|sellador|required|sever|fuerte|amplio|notorio|descarapel|desprendimiento amplio|humedad|moho|salitre/.test(surfaceText);
  const hasMediumSignal = signals.some(signal => {
    const type = String(signal.type || '').toLowerCase();
    const severity = String(signal.severity || '').toLowerCase();
    return ['desprendimiento', 'resanes', 'grietas'].includes(type) && ['baja', 'media', 'alta'].includes(severity);
  }) || /desgaste|lijad|raspad|pintura suelta|imperfeccion|grieta|resane|preparacion/.test(surfaceText);
  if (hasPremiumSignal) analysis.minimumLevel = 'premium';
  if (analysis.minimumLevel === 'premium' && !hasPremiumSignal) analysis.minimumLevel = hasMediumSignal ? 'medio' : 'basico';
  if (hasMediumSignal && analysis.minimumLevel === 'basico') analysis.minimumLevel = 'medio';
  return analysis;
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/cliente/';
  if (pathname === '/cliente') pathname = '/cliente/';
  if (pathname === '/admin/visitas') pathname = '/admin/visitas/';
  if (pathname === '/admin/registros') pathname = '/admin/registros/';
  if (PUBLIC_CLIENT_ONLY && pathname.startsWith('/admin') && !pathname.startsWith('/admin/visitas') && !pathname.startsWith('/admin/registros')) {
    return send(res, 404, 'No encontrado', 'text/plain; charset=utf-8');
  }
  if (pathname === '/admin') pathname = '/admin/';
  if (pathname.endsWith('/')) pathname += 'index.html';

  const filePath = path.normalize(path.join(PUBLIC, pathname));
  if (!filePath.startsWith(PUBLIC)) return send(res, 403, 'Acceso denegado', 'text/plain; charset=utf-8');
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return send(res, 404, 'No encontrado', 'text/plain; charset=utf-8');
  }

  const ext = path.extname(filePath).toLowerCase();
  const diskContent = fs.readFileSync(filePath);
  const embeddedKey = pathname === '/cliente/' || pathname === '/cliente/index.html' ? '/cliente/index.html' : pathname;
  const embeddedContent = embeddedClientFiles[embeddedKey];
  const content = diskContent.length || !embeddedContent ? diskContent : Buffer.from(embeddedContent, 'utf8');
  res.writeHead(200, {
    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store',
    'Content-Length': content.length
  });
  res.end(content);
  if (ext === '.html' && pathname.startsWith('/seo/')) {
    createAnalyticsEvent(req, {
      type: 'pageview',
      path: pathname.replace(/index\.html$/, ''),
      title: 'Página SEO',
      referrer: req.headers.referer || '',
      sessionId: clientIpHash(req)
    }).catch(error => console.warn(`No se pudo registrar visita SEO: ${error.message}`));
  }
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') return send(res, 204, '');

  try {
    if (PUBLIC_CLIENT_ONLY && url.pathname.startsWith('/api/admin/')) {
      return send(res, 404, { error: 'Ruta no disponible en portal público' });
    }

    if (url.pathname === '/api/config' && req.method === 'GET') {
      return send(res, 200, await loadConfigRecord());
    }

    if (url.pathname === '/api/ai-status' && req.method === 'GET') {
      return send(res, 200, {
        configured: Boolean(OPENAI_API_KEY),
        model: OPENAI_API_KEY ? OPENAI_VISION_MODEL : '',
        storage: USE_SUPABASE ? 'supabase' : 'local-json',
        message: OPENAI_API_KEY
          ? 'Análisis visual IA activo.'
          : 'Análisis visual IA no activo. Falta configurar OPENAI_API_KEY en el servidor.'
      });
    }

    if (url.pathname === '/api/track' && req.method === 'POST') {
      const body = await parseBody(req);
      return send(res, 201, await createAnalyticsEvent(req, body));
    }

    if (url.pathname === '/api/visits/summary' && req.method === 'GET') {
      if (!analyticsAccessAllowed(req, url)) return send(res, 401, { error: 'Clave incorrecta' });
      const events = await listAnalyticsEvents();
      return send(res, 200, analyticsSummary(events));
    }

    if (url.pathname.startsWith('/api/visits/events/') && req.method === 'DELETE') {
      if (!analyticsAccessAllowed(req, url)) return send(res, 401, { error: 'Clave incorrecta' });
      const eventId = decodeURIComponent(url.pathname.split('/').pop());
      const deleted = await deleteAnalyticsEvent(eventId);
      if (!deleted) return send(res, 404, { error: 'Visita no encontrada' });
      return send(res, 200, { deleted: true, id: eventId });
    }

    if (url.pathname === '/api/records/quotes' && req.method === 'GET') {
      if (!recordsAccessAllowed(req, url)) return send(res, 401, { error: 'Clave incorrecta' });
      return send(res, 200, recordsSummary(await listQuotes()));
    }

    if (!PUBLIC_CLIENT_ONLY && url.pathname === '/api/admin/login' && req.method === 'POST') {
      const body = await parseBody(req);
      if (body.email === ADMIN_USER && body.password === ADMIN_PASSWORD) {
        return send(res, 200, { token: ADMIN_TOKEN, email: ADMIN_USER });
      }
      return send(res, 401, { error: 'Credenciales incorrectas' });
    }

    if (url.pathname === '/api/quotes' && req.method === 'POST') {
      const body = await parseBody(req);
      const now = new Date().toISOString();
      const quote = {
        ...body,
        folio: folio(),
        status: 'Nueva',
        createdAt: now,
        validUntil: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
      };
      await createQuoteRecord(quote);
      notifyNewQuote(req, quote);
      return send(res, 201, quote);
    }

    if (url.pathname === '/api/collaborators' && req.method === 'POST') {
      const body = await parseBody(req);
      const record = {
        ...body,
        id: crypto.randomUUID(),
        status: 'Nuevo',
        createdAt: new Date().toISOString()
      };
      await createCollaboratorRecord(record);
      notifyNewCollaborator(req, record);
      return send(res, 201, record);
    }

    if (url.pathname === '/api/analyze-photos' && req.method === 'POST') {
      const body = await parseBody(req);
      const analysis = await analyzePhotosWithOpenAI(body);
      return send(res, 200, analysis);
    }

    if (!isAdmin(req)) return send(res, 401, { error: 'Acceso privado EMC' });

    if (url.pathname === '/api/admin/quotes' && req.method === 'GET') {
      return send(res, 200, await listQuotes());
    }

    if (url.pathname.startsWith('/api/admin/quotes/') && req.method === 'PATCH') {
      const quoteFolio = decodeURIComponent(url.pathname.split('/').pop());
      const body = await parseBody(req);
      const quote = await updateQuoteRecord(quoteFolio, body);
      if (!quote) return send(res, 404, { error: 'Cotización no encontrada' });
      return send(res, 200, quote);
    }

    if (url.pathname.startsWith('/api/admin/quotes/') && req.method === 'DELETE') {
      const quoteFolio = decodeURIComponent(url.pathname.split('/').pop());
      const deleted = await deleteQuoteRecord(quoteFolio);
      if (!deleted) return send(res, 404, { error: 'Cotización no encontrada' });
      return send(res, 200, { deleted: true, folio: quoteFolio });
    }

    if (url.pathname === '/api/admin/config' && req.method === 'PUT') {
      const body = await parseBody(req);
      return send(res, 200, await saveConfigRecord(body));
    }

    if (url.pathname === '/api/admin/collaborators' && req.method === 'GET') {
      return send(res, 200, await listCollaborators());
    }

    if (url.pathname.startsWith('/api/admin/collaborators/') && req.method === 'DELETE') {
      const collaboratorId = decodeURIComponent(url.pathname.split('/').pop());
      const deleted = await deleteCollaboratorRecord(collaboratorId);
      if (!deleted) return send(res, 404, { error: 'Colaborador no encontrado' });
      return send(res, 200, { deleted: true, id: collaboratorId });
    }

    return send(res, 404, { error: 'Ruta no encontrada' });
  } catch (error) {
    return send(res, 400, { error: error.message || 'Solicitud inválida' });
  }
}

ensureDataFiles();

http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return handleApi(req, res);
  return serveStatic(req, res);
}).listen(PORT, () => {
  console.log(`EMC Pintura V1 listo en http://localhost:${PORT}`);
  console.log(`Cliente: http://localhost:${PORT}/cliente/`);
  if (PUBLIC_CLIENT_ONLY) {
    console.log('Modo público: admin web desactivado.');
  } else {
    console.log(`Admin:   http://localhost:${PORT}/admin/`);
    console.log(`Admin demo: ${ADMIN_USER} / ${ADMIN_PASSWORD}`);
  }
});
