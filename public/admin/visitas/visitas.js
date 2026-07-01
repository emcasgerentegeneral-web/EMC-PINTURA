const login = document.querySelector('#login');
const dashboard = document.querySelector('#dashboard');
const form = document.querySelector('#login-form');
const password = document.querySelector('#password');
const refresh = document.querySelector('#refresh');
const storageKey = 'emc_visitas_clave';

function fmtDate(value) {
  return new Date(value).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function eventLabel(type) {
  return {
    pageview: 'Visita',
    quote_start: 'Inició cotización',
    quote_step: 'Paso cotizador',
    quote_sent: 'Cotización enviada',
    whatsapp_click: 'WhatsApp',
    collaborator_start: 'Red EMC',
    collaborator_sent: 'Colaborador enviado'
  }[type] || type;
}

function setText(id, value) {
  document.querySelector(`#${id}`).textContent = value;
}

function renderList(id, rows, emptyText) {
  const box = document.querySelector(`#${id}`);
  box.innerHTML = rows.length
    ? rows.map(row => `
        <div class="row">
          <strong>${row.label}</strong>
          <span>${row.count}</span>
        </div>
      `).join('')
    : `<div class="row"><strong>${emptyText}</strong><span>0</span></div>`;
}

function renderRecent(rows) {
  const box = document.querySelector('#recent');
  box.innerHTML = rows.length
    ? rows.map(row => `
        <div class="row">
          <span>${fmtDate(row.createdAt)}</span>
          <strong>${row.path || row.detail || '-'}</strong>
          <em class="pill">${eventLabel(row.type)}</em>
        </div>
      `).join('')
    : '<div class="row"><strong>Todavía no hay movimientos.</strong><span>0</span></div>';
}

async function loadSummary(clave) {
  const response = await fetch(`/api/visits/summary?clave=${encodeURIComponent(clave)}`, { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo cargar');

  localStorage.setItem(storageKey, clave);
  login.hidden = true;
  dashboard.hidden = false;

  const totals = data.totals || {};
  setText('todayVisits', totals.todayVisits || 0);
  setText('todayPeople', totals.todayPeople || 0);
  setText('last7Visits', totals.last7Visits || 0);
  setText('last30Visits', totals.last30Visits || 0);
  setText('quoteStarts', totals.quoteStarts || 0);
  setText('quoteSent', totals.quoteSent || 0);
  setText('whatsappClicks', totals.whatsappClicks || 0);

  renderList('topPages', data.topPages || [], 'Sin páginas registradas');
  renderList('topReferrers', data.topReferrers || [], 'Sin origen registrado');
  renderRecent(data.recent || []);
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await loadSummary(password.value);
  } catch (error) {
    alert(error.message);
  }
});

refresh.addEventListener('click', async () => {
  const clave = localStorage.getItem(storageKey) || password.value;
  if (!clave) return password.focus();
  try {
    await loadSummary(clave);
  } catch (error) {
    alert(error.message);
  }
});

const saved = localStorage.getItem(storageKey);
if (saved) {
  password.value = saved;
  loadSummary(saved).catch(() => {
    localStorage.removeItem(storageKey);
    login.hidden = false;
    dashboard.hidden = true;
  });
}
