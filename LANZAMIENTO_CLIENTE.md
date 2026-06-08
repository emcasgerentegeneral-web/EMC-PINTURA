# Lanzamiento Cliente EMC Pintura

## Objetivo

Publicar el portal del cliente como web publica. El cliente no descarga nada. Entra, captura datos, sube fotos, recibe recomendacion, ve cotizacion y envia solicitud.

## Modo local completo

Usa esto mientras desarrollas el cliente publico:

```bash
npm start
```

Abre:

- Cliente: http://localhost:8080/cliente/

## Modo publico cliente

Usa esto para publicar solo cliente y APIs publicas:

```bash
npm run start:public
```

En este modo:

- `/cliente/` funciona.
- `/api/config` funciona.
- `/api/ai-status` funciona.
- `/api/analyze-photos` funciona.
- `/api/quotes` funciona.
- `/api/collaborators` funciona.
- `/admin/` queda bloqueado.
- `/api/admin/*` queda bloqueado.

## Variables necesarias

```env
OPENAI_API_KEY=tu_clave_openai
OPENAI_VISION_MODEL=gpt-4.1-mini
PUBLIC_BASE_URL=https://tu-liga-publica.com
ADMIN_PANEL_URL=
PUBLIC_CLIENT_ONLY=true
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
```

Opcional para alertas por correo:

```env
RESEND_API_KEY=tu_clave_resend
ALERT_EMAIL_FROM=EMC Pintura <alertas@tu-dominio.com>
ALERT_EMAIL_TO=tu_correo@tu-dominio.com
```

## Regla de IA

La IA analiza fotos para recomendar nivel:

- Basico: superficie sana.
- Medio: desgaste normal o preparacion ligera.
- Plus: humedad, moho, salitre, desprendimiento fuerte o deterioro.

Altura, exterior, escalera o andamio no suben el nivel por si solos. Esos conceptos se tratan como acceso/costo separado.

## Privacidad

El sistema no guarda fotos en la solicitud final. Las fotos solo se usan para analisis durante la captura.

## Base de datos Supabase

El servidor ya esta preparado para guardar solicitudes y colaboradores en Supabase si encuentra estas variables:

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
```

Si esas variables no existen, el sistema usa archivos locales:

- `data/quotes.json`
- `data/collaborators.json`

Esto sirve para pruebas locales, pero no es ideal en hosting gratis.

## Crear tablas Supabase

1. Entra a Supabase.
2. Crea un proyecto.
3. Abre SQL Editor.
4. Copia y ejecuta el archivo:

```text
supabase/schema.sql
```

Ese SQL crea:

- `emc_quotes`
- `emc_collaborators`

Las tablas tienen RLS activo y no dan acceso publico directo. El servidor usa `SUPABASE_SERVICE_ROLE_KEY`, por eso esa clave nunca debe ir en el navegador.

## Orden recomendado para publicar

1. Crear proyecto Supabase.
2. Ejecutar `supabase/schema.sql`.
3. Configurar variables de entorno en el hosting.
4. Publicar con `PUBLIC_CLIENT_ONLY=true`.
5. Probar que `/cliente/` abre.
6. Probar que `/admin/` responde 404.
7. Hacer una solicitud de prueba.
8. Confirmar que aparece en Supabase.

## Paso a paso Supabase

1. Entra a https://supabase.com.
2. Crea un proyecto nuevo.
3. Ve a `SQL Editor`.
4. Abre este archivo local:

```text
supabase/schema.sql
```

5. Copia todo el contenido.
6. Pegalo en Supabase SQL Editor.
7. Ejecuta el script.
8. Ve a `Project Settings > API`.
9. Copia:
   - `Project URL`
   - `service_role key`

Importante: usa `service_role key` solo en el servidor/Render. Nunca debe ir dentro del navegador.

## Paso a paso Render

1. Sube este proyecto a GitHub.
2. Entra a https://render.com.
3. Crea `New > Web Service`.
4. Conecta el repositorio.
5. Render detectara `render.yaml`.
6. Captura las variables secretas:

```env
OPENAI_API_KEY=tu_clave_openai
SUPABASE_URL=tu_project_url_de_supabase
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
PUBLIC_BASE_URL=https://tu-servicio.onrender.com
ADMIN_PANEL_URL=
```

Opcionales:

```env
RESEND_API_KEY=tu_clave_resend
ALERT_EMAIL_FROM=EMC Pintura <alertas@tu-dominio.com>
ALERT_EMAIL_TO=tu_correo@tu-dominio.com
```

7. Publica.
8. Abre:

```text
https://tu-servicio.onrender.com/cliente/
```

9. Confirma:

```text
https://tu-servicio.onrender.com/api/ai-status
```

Debe decir:

```json
{
  "configured": true,
  "storage": "supabase"
}
```

10. Prueba que el admin web no sea publico:

```text
https://tu-servicio.onrender.com/admin/
```

Debe responder `404`.
