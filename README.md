# Gastos Casa 💸

App personal para cargar los gastos diarios de la casa (por voz o texto), clasificarlos solos y saber al cierre de cada mes **quién le tiene que transferir cuánto a quién** para quedar 50/50.

- **Frontend**: PWA en GitHub Pages (carpeta `docs/`), se instala en el celular como app.
- **Backend**: Google Apps Script ligado a un Google Sheet (carpeta `backend/`).
- **Sin IA**: la clasificación es por reglas (hoja `Reglas`) y aprende cuando corregís una categoría.

---

## 1. Backend (Google Sheet + Apps Script) — 10 minutos

1. Creá un Google Sheet nuevo, por ejemplo **"Gastos Casa"**.
2. Menú **Extensiones → Apps Script**.
3. En el editor, creá 3 archivos de script y pegá el contenido de cada uno:
   - `Codigo.gs` ← `backend/Codigo.gs` (reemplazá el `Código.gs` que viene por defecto)
   - `Logica.gs` ← `backend/Logica.gs`
   - `Reglas.gs` ← `backend/Reglas.gs`
4. ⚙️ **Configuración del proyecto** → tildá *"Mostrar el archivo de manifiesto appsscript.json"* y reemplazá su contenido por `backend/appsscript.json`.
5. Arriba elegí la función **`setup`** y tocá **Ejecutar**. Aceptá los permisos (Sheets + acceso a internet para la cotización del dólar).
6. Volvé al Sheet: se crearon las hojas `Movimientos`, `Imputaciones`, `Reglas`, `Cotizaciones`, `Cierres` y `Config`.
7. En la hoja **Config** completá:
   | Clave | Qué poner |
   |---|---|
   | `usuario1_nombre` / `usuario2_nombre` | Los nombres de ustedes dos |
   | `usuario1_pin` / `usuario2_pin` | Un PIN de **4 dígitos** para cada uno, en claro. Se cifra solo en el primer ingreso. |
   | `tipo_dolar` | `oficial`, `blue`, `bolsa` (MEP), `tarjeta` o `cripto` |
   | `cuota_primer_mes` | `mismo` = la cuota 1 cuenta en el mes de compra · `siguiente` = cuenta el mes siguiente (como llega el resumen) |
   | `porcentaje_usuario1` | `50` (mitad y mitad) |
8. En Apps Script: **Implementar → Nueva implementación → Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
   - Copiá la URL que termina en **`/exec`**.

> Cada vez que cambies el código del backend: **Implementar → Gestionar implementaciones → ✏️ → Versión: nueva**. Así la URL no cambia.

## 2. Frontend (GitHub Pages)

1. Creá un repo en GitHub, por ejemplo `dhon1979/gastos-casa` (puede ser **privado** si tenés Pages habilitado para privados; si no, público: no hay datos ni claves en el código).
2. Subí todo el contenido de esta carpeta.
3. Editá **`docs/config.js`** y pegá la URL `/exec`:
   ```js
   window.GASTOS_CONFIG = { API_URL: 'https://script.google.com/macros/s/XXXX/exec' };
   ```
4. Repo → **Settings → Pages** → *Deploy from a branch* → `main` / carpeta **`/docs`**.
5. En un minuto queda en `https://dhon1979.github.io/gastos-casa/`.

## 3. Instalar en los celulares

- **Android (Chrome)**: abrir el link → menú ⋮ → *Agregar a la pantalla principal*.
- **iPhone (Safari)**: abrir el link → Compartir → *Agregar a inicio*.
- La primera vez que toquen el micrófono, aceptar el permiso.

---

## Cómo se usa

**Cargar**: tocar el micrófono y decir el gasto. Ejemplos que entiende:

| Dicho | Resultado |
|---|---|
| "verdulería 8 mil efectivo" | $8.000 · Supermercado › Verdulería · Efectivo |
| "zapatillas 90 mil en 3 cuotas con la Visa" | $90.000 en 3 cuotas · Ropa › Calzado |
| "carnicería 23.450 con mercado pago" | Supermercado › Carnicería · Transferencia/MP |
| "alimento del perro 42 lucas débito" | Mascotas › Alimento mascotas |
| "120 dólares el hotel con la master" | US$ 120 a la cotización del día · Ocio › Viajes |
| "ayer cenamos afuera 65 mil" | fecha de ayer · Comida › Restaurante |
| "peluquería 18 mil es personal" | marcado **Personal** (no entra en la compensación) |

Siempre aparece una tarjeta para confirmar o corregir antes de guardar. Fecha y hora se ponen solas; quién pagó es quien está logueado (se puede cambiar).

**Montos que entiende**: 15000 · 15.000 · 15 mil · 15 lucas · quince mil quinientos · 1,5 palos · US$ / dólares.

**Aprendizaje**: si una categoría sale mal (o queda en *Varios*), la corregís en la tarjeta y la app guarda una regla nueva en la hoja `Reglas`. La próxima vez la clasifica sola. También podés editar `Reglas` a mano en el Sheet.

**Sin conexión**: si no hay señal, el gasto queda guardado en el teléfono y se envía solo cuando vuelve internet (arriba aparece "N pendientes").

**Panel**: compensación del mes (quién transfiere cuánto), totales en pesos y dólares nominales, por persona, por rubro y detalle, evolución de 6 meses y cuotas que vienen. Con **Registrar compensación** queda asentado en la hoja `Cierres`; si después se edita algo del mes, avisa.

## Cómo se calcula la compensación

1. Se toman los gastos **Compartidos** del mes (los Personales quedan afuera).
2. Las compras en cuotas aportan solo la cuota de ese mes.
3. Los gastos en USD se convierten a pesos con la cotización del día del gasto (queda guardada en el movimiento).
4. A cada uno le toca la mitad del total. El que puso menos le transfiere la diferencia al otro.

## Las hojas del Sheet

- **Movimientos**: una fila por gasto (la fuente de verdad). Anular no borra: cambia `Estado`.
- **Imputaciones**: base plana con una fila por mes/cuota, lista para tablas dinámicas o para el análisis posterior.
- **Reglas**: palabra clave → rubro / detalle. Origen `semilla` o `aprendida`.
- **Cotizaciones**: caché de cotizaciones usadas (dolarapi.com / argentinadatos.com).
- **Cierres**: compensaciones registradas.
- **Config**: usuarios, PINs y parámetros.

## Seguridad

- PIN de 4 dígitos por persona, guardado cifrado (SHA-256 con secreto del script).
- Sesión firmada (HMAC) que dura 60 días; cerrás sesión tocando tu nombre arriba.
- 6 PINs incorrectos seguidos bloquean el ingreso 15 minutos.

## Desarrollo

```bash
node build.js               # regenera backend/Reglas.gs desde las reglas de docs/parser.js
node test/parser.test.js    # pruebas del reconocimiento de mensajes
node test/backend.test.js   # pruebas del backend con un Sheet simulado
node test/dev-server.js     # app local en http://localhost:8080 con datos demo (PIN 1234 / 5678)
```
