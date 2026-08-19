const form = document.querySelector('[data-lead-form]');
const whatsappNumber = '529932869691';

function campaignAttribution() {
  const params = new URLSearchParams(window.location.search);
  return ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid']
    .reduce((result, key) => {
      const value = params.get(key);
      if (value) result[key] = value.slice(0, 180);
      return result;
    }, {});
}

function track(type, detail = '') {
  const attribution = campaignAttribution();
  const payload = {
    type,
    detail,
    path: window.location.pathname,
    title: document.title,
    referrer: document.referrer,
    sessionId: sessionStorage.getItem('emc_service_session') || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    utmSource: attribution.utm_source || '',
    utmMedium: attribution.utm_medium || '',
    utmCampaign: attribution.utm_campaign || '',
    utmContent: attribution.utm_content || ''
  };
  sessionStorage.setItem('emc_service_session', payload.sessionId);
  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
  else fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
}

function whatsappUrl(values) {
  const text = [
    `Hola, soy ${values.name}. Quiero cotizar ${values.service} con EMC.`,
    `Zona o colonia: ${values.zone}`,
    `Tipo de trabajo: ${values.detail}`,
    `Superficie aproximada: ${values.squareMeters || 'No la sé'} m²`,
    `Comentarios: ${values.notes || 'Sin comentarios'}`
  ].join('\n');
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`;
}

if (form) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const status = form.querySelector('[data-form-status]');
    const data = new FormData(form);
    const values = Object.fromEntries(data.entries());
    button.disabled = true;
    status.textContent = 'Guardando tu solicitud…';
    try {
      const response = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client: {
            name: values.name,
            phone: values.phone,
            address: values.zone,
            city: 'Villahermosa / Centro',
            serviceNeed: values.service,
            urgency: values.urgency,
            consent: true
          },
          project: {
            squareMeters: Number(values.squareMeters || 0),
            applicationType: values.detail
          },
          attribution: campaignAttribution(),
          observations: values.notes || '',
          source: 'landing_servicio_rapida'
        })
      });
      if (!response.ok) throw new Error('No se pudo guardar');
      track('lead_submit', values.service);
      status.textContent = 'Solicitud guardada. Abriendo WhatsApp para continuar…';
      window.location.href = whatsappUrl(values);
    } catch (error) {
      track('lead_fallback_whatsapp', values.service);
      status.textContent = 'Continuaremos por WhatsApp para no hacerte esperar.';
      window.location.href = whatsappUrl(values);
    } finally {
      button.disabled = false;
    }
  });
}

document.querySelectorAll('a[href*="wa.me"]').forEach(link => {
  link.addEventListener('click', () => track('whatsapp_click', link.dataset.service || document.body.dataset.service || 'servicio'));
});

track('pageview', document.body.dataset.service || 'servicio');
