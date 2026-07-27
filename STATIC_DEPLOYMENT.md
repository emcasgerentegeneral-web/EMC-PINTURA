# Publicación rápida de EMC Pintura

La carpeta `public/` ya puede publicarse como sitio estático. El navegador muestra el cotizador inmediatamente con `public/cliente/runtime-config.js`; el servidor actual sólo se consulta en segundo plano y al guardar la cotización.

## Render Static Site

1. Crear un nuevo Static Site usando este mismo repositorio.
2. Usar `public` como directorio de publicación.
3. No configurar comando de compilación.
4. Conectar el dominio comercial al sitio estático.
5. Mantener `https://emc-pintura.onrender.com` como API y administrador.

El archivo `render-static.yaml` contiene la misma configuración como Blueprint independiente. Antes de cambiar la URL del backend, actualizar `public/cliente/runtime-config.js`.

## Comprobaciones de salida

- `/cliente/` debe aparecer en menos de tres segundos con el backend dormido.
- El paso 1 no solicita datos personales ni fotografías.
- El precio aparece en el paso 2.
- El envío del paso 3 despierta el backend, guarda el folio y conserva la atribución UTM.
- El administrador continúa leyendo las cotizaciones desde Supabase.
