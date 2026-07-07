const login = document.querySelector('#login');
const dashboard = document.querySelector('#dashboard');
const form = document.querySelector('#login-form');
const password = document.querySelector('#password');
const refresh = document.querySelector('#refresh');
const search = document.querySelector('#search');
const recordsBox = document.querySelector('#records');
const storageKey = 'emc_registros_clave';
let records = [];

function fmtMoney(value) {
  return Number(value || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function fmtDate(value) {
  return new Date(value).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function setText(id, value) {
  document.querySelector(`#${id}`).textContent = value;
}

function whatsappLink(record) {
  const phone = digits(record.phone);
  if (!phone) return '';
  const mxPhone = phone.length === 10 ? `52${phone}` : phone;
  const text = encodeURIComponent([
    `Hola ${record.name || ''}, soy de EMCAS.`,
    `Recibimos tu solicitud ${record.folio || ''} para ${record.serviceNeed || 'servicio'}.`,
    '¿Me confirmas ubicación y cuándo podemos revisar el trabajo?'
  ].join('\n'));
  return `https://wa.me/${mxPhone}?text=${text}`;
}

function mailLink(record) {
  if (!record.email) return '';
  const subject = encodeURIComponent(`Seguimiento EMCAS ${record.folio || ''}`);
  const body = encodeURIComponent(`Hola ${record.name || ''},\n\nRecibimos tu solicitud para ${record.serviceNeed || 'servicio'} en ${record.city || 'tu zona'}.\n\nQuedamos atentos para confirmar alcance y visita.\n\nEMCAS`);
  return `mailto:${record.email}?subject=${subject}&body=${body}`;
}

function recordSearchText(record) {
  return [
    record.folio,
    record.name,
    record.company,
    record.phone,
    record.email,
    record.city,
    record.propertyType,
    record.serviceNeed,
    record.urgency,
    record.status
  ].join(' ').toLowerCase();
}

function renderRecords() {
  const query = search.value.trim().toLowerCase();
  const filtered = query ? records.filter(record => recordSearchText(record).includes(query)) : records;
  recordsBox.innerHTML = filtered.length
    ? filtered.map(record => {
      const wa = whatsappLink(record);
      const mail = mailLink(record);
      const urgent = /urgente/i.test(record.urgency || '');
      return `
        <article class="record">
          <div class="record-main">
            <div class="record-cell">
              <span class="record-label">${record.folio || 'Sin folio'}</span>
              <strong>${record.name || 'Sin nombre'}</strong>
              <small>${record.company || 'Sin empresa'} · ${record.phone || 'Sin teléfono'}</small>
            </div>
            <div class="record-cell">
              <span class="record-label">Servicio</span>
              <strong>${record.serviceNeed || 'Pendiente'}</strong>
              <small>${record.propertyType || 'Sin tipo'}</small>
            </div>
            <div class="record-cell">
              <span class="record-label">Municipio</span>
              <strong>${record.city || 'Pendiente'}</strong>
              <small>${record.address || 'Sin zona'}</small>
            </div>
            <div class="record-cell">
              <span class="record-label">Total</span>
              <strong>${fmtMoney(record.total)}</strong>
              <small>${record.area ? `${record.area} m²` : 'Área pendiente'}</small>
            </div>
            <div class="record-cell">
              <span class="record-label">Entrada</span>
              <strong>${record.createdAt ? fmtDate(record.createdAt) : '-'}</strong>
              <small>${record.status || 'Nueva'}</small>
            </div>
          </div>
          <div class="record-meta">
            <span class="pill ${urgent ? 'urgent' : ''}">${record.urgency || 'Sin urgencia'}</span>
            <span class="pill">${record.level || 'Sin nivel'}</span>
            <span class="pill">${record.paintSupply || 'Material pendiente'}</span>
            <span class="pill">${record.email || 'Sin correo'}</span>
          </div>
          <div class="actions">
            ${wa ? `<a href="${wa}" target="_blank" rel="noopener">WhatsApp cliente</a>` : ''}
            ${mail ? `<a href="${mail}">Correo</a>` : ''}
            <button type="button" data-copy="${record.folio || ''}">Copiar resumen</button>
          </div>
        </article>
      `;
    }).join('')
    : '<div class="empty">No hay registros con ese filtro.</div>';

  document.querySelectorAll('[data-copy]').forEach(button => {
    button.addEventListener('click', async () => {
      const record = records.find(item => item.folio === button.dataset.copy);
      if (!record) return;
      const text = [
        `Folio: ${record.folio}`,
        `Cliente: ${record.name}`,
        `Empresa: ${record.company || '-'}`,
        `Teléfono: ${record.phone || '-'}`,
        `Correo: ${record.email || '-'}`,
        `Municipio: ${record.city || '-'}`,
        `Tipo: ${record.propertyType || '-'}`,
        `Servicio: ${record.serviceNeed || '-'}`,
        `Urgencia: ${record.urgency || '-'}`,
        `Total: ${fmtMoney(record.total)}`,
        `Comentarios: ${record.observations || '-'}`
      ].join('\n');
      try {
        await navigator.clipboard.writeText(text);
        alert('Resumen copiado.');
      } catch (error) {
        prompt('Copia este resumen:', text);
      }
    });
  });
}

async function loadRecords(clave) {
  const response = await fetch(`/api/records/quotes?clave=${encodeURIComponent(clave)}`, { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo cargar');

  localStorage.setItem(storageKey, clave);
  login.hidden = true;
  dashboard.hidden = false;
  records = data.records || [];

  setText('totalQuotes', data.totals?.total || 0);
  setText('newQuotes', data.totals?.newQuotes || 0);
  setText('urgentQuotes', data.totals?.urgentQuotes || 0);
  setText('todayQuotes', data.totals?.todayQuotes || 0);
  renderRecords();
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await loadRecords(password.value);
  } catch (error) {
    alert(error.message);
  }
});

refresh.addEventListener('click', async () => {
  const clave = localStorage.getItem(storageKey) || password.value;
  if (!clave) return password.focus();
  try {
    await loadRecords(clave);
  } catch (error) {
    alert(error.message);
  }
});

search.addEventListener('input', renderRecords);

const saved = localStorage.getItem(storageKey);
if (saved) {
  password.value = saved;
  loadRecords(saved).catch(() => {
    localStorage.removeItem(storageKey);
    login.hidden = false;
    dashboard.hidden = true;
  });
}
