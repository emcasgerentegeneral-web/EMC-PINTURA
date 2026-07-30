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
    'step_1_complete',
    'price_view',
    'package_selected',
    'photo_upload',
    'quote_sent',
    'lead_submit',
    'visit_booked',
    'sale_closed',
    'whatsapp_click',
    'render_interest',
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
    utmSource: String(body.utmSource || '').slice(0, 80),
    utmMedium: String(body.utmMedium || '').slice(0, 80),
    utmCampaign: String(body.utmCampaign || '').slice(0, 120),
    utmContent: String(body.utmContent || '').slice(0, 120),
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

let analyticsWriteQueue = Promise.resolve();

async function createAnalyticsEvent(req, body) {
  const event = cleanAnalyticsEvent(req, body);
  const pending = analyticsWriteQueue.then(async () => {
    const events = await listAnalyticsEvents();
    events.push(event);
    await saveAnalyticsEvents(events);
    return { ok: true, id: event.id };
  });
  analyticsWriteQueue = pending.catch(() => {});
  return pending;
}

async function deleteAnalyticsEvent(eventId) {
  const events = await listAnalyticsEvents();
  const nextEvents = events.filter(event => event.id !== eventId);
  if (nextEvents.length === events.length) return false;
  await saveAnalyticsEvents(nextEvents);
  return true;
}

async function resetAnalyticsEvents() {
  const events = await listAnalyticsEvents();
  await saveAnalyticsEvents([]);
  return events.length;
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
      priceViews: events.filter(event => event.type === 'price_view').length,
      quoteSent: events.filter(event => event.type === 'quote_sent').length,
      leads: events.filter(event => event.type === 'lead_submit').length,
      whatsappClicks: events.filter(event => event.type === 'whatsapp_click').length,
      renderInterests: events.filter(event => event.type === 'render_interest').length,
      visitsBooked: events.filter(event => event.type === 'visit_booked').length,
      salesClosed: events.filter(event => event.type === 'sale_closed').length
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
    topCampaigns: topCounts(pageviews, event => {
      if (!event.utmCampaign && !event.utmSource) return '';
      return [event.utmSource || 'sin-fuente', event.utmCampaign || 'sin-campaña', event.utmContent || 'general'].join(' / ');
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
  const content = fs.readFileSync(filePath);
  const cacheControl = ext === '.html'
    ? 'public, max-age=300'
    : 'public, max-age=86400, stale-while-revalidate=604800';
  res.writeHead(200, {
    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'X-Frame-Options': 'SAMEORIGIN',
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

    if (url.pathname === '/api/visits/reset' && req.method === 'DELETE') {
      if (!analyticsAccessAllowed(req, url)) return send(res, 401, { error: 'Clave incorrecta' });
      const deleted = await resetAnalyticsEvents();
      return send(res, 200, { reset: true, deleted });
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

    if (url.pathname === '/api/records/health' && req.method === 'GET') {
      if (!recordsAccessAllowed(req, url)) return send(res, 401, { error: 'Clave incorrecta' });
      return send(res, 200, {
        checkedAt: new Date().toISOString(),
        storage: {
          provider: USE_SUPABASE ? 'supabase' : 'local',
          configured: USE_SUPABASE
        },
        notifications: {
          emailConfigured: Boolean(RESEND_API_KEY && ALERT_EMAIL_FROM && ALERT_EMAIL_TO),
          provider: RESEND_API_KEY ? 'resend' : 'none'
        },
        followUp: {
          publicWhatsappConfigured: Boolean(PUBLIC_WHATSAPP_NUMBER),
          adminPanelConfigured: Boolean(ADMIN_PANEL_URL)
        }
      });
    }

    if (url.pathname === '/api/leads/pulse' && req.method === 'GET') {
      const quotes = await listQuotes();
      const latest = quotes
        .filter(quote => quote && quote.folio !== CONFIG_RECORD_FOLIO && quote.folio !== ANALYTICS_RECORD_FOLIO)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;
      const fingerprint = latest
        ? crypto.createHash('sha256').update(`${latest.folio || ''}:${latest.createdAt || ''}`).digest('hex').slice(0, 16)
        : '';
      return send(res, 200, {
        checkedAt: new Date().toISOString(),
        total: quotes.filter(quote => quote && quote.folio !== CONFIG_RECORD_FOLIO && quote.folio !== ANALYTICS_RECORD_FOLIO).length,
        newQuotes: quotes.filter(quote => quote && quote.status === 'Nueva').length,
        latestCreatedAt: latest?.createdAt || null,
        fingerprint
      });
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
      if (body.status === 'Ganada') await createAnalyticsEvent(req, { type: 'sale_closed', detail: quoteFolio, path: '/admin/' });
      if (body.status === 'Visita agendada') await createAnalyticsEvent(req, { type: 'visit_booked', detail: quoteFolio, path: '/admin/' });
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
