# EMC-PINTURA

Sistema de cotizacion de servicios de pintura para clientes EMC.

## Portal público

El cliente obtiene una cotización preliminar en tres pasos:

1. Medidas y condiciones.
2. Precio y paquete.
3. Contacto y envío por WhatsApp.

La versión activa está en `public/cliente/`. No hay copias antiguas de la app en la raíz ni dentro del servidor.

## Ejecutar local

```bash
npm install
npm run start:public
```

Abrir:

```text
http://localhost:8080/cliente/
```

## Produccion

Configurar variables:

```env
PUBLIC_CLIENT_ONLY=true
OPENAI_API_KEY=tu_clave_openai
OPENAI_VISION_MODEL=gpt-4.1-mini
SUPABASE_URL=tu_url_supabase
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
PUBLIC_BASE_URL=https://tu-url-publica
```

## Supabase

Ejecutar:

```text
supabase/schema.sql
```

## Privacidad

Las fotos no se guardan en la solicitud final. Se usan para analisis visual durante la captura.
