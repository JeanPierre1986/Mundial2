# Quiniela Mundial 2026 — Campeón 🏆

Dashboard familiar. El que atine al campeón gana $50. Las barras avanzan solas
según va clasificando cada selección, jalando datos en vivo de API-Football.

## Archivos
- `index.html` — el dashboard (se sirve en la raíz).
- `netlify/functions/mundial.js` — la función que consulta API-Football y esconde la key.
- `netlify.toml` — configuración de Netlify.

---

## 1) Conseguir la API key (gratis)
1. Crea una cuenta en **dashboard.api-football.com** (plan Free).
2. Copia tu **API key** (un texto largo). El plan gratis da ~100 requests/día;
   el dashboard usa 2 requests cada 2 minutos como máximo, así que alcanza de sobra.

## 2) Subir a Netlify (con la Function)
El drag-and-drop **no** sirve cuando hay funciones. Usa la CLI o Git.

**Opción CLI (más rápida):**
```bash
npm install -g netlify-cli
cd carpeta-del-proyecto
netlify deploy --prod
```
Cuando pregunte, elige crear un sitio nuevo. Carpeta a publicar: `.`

**Opción Git:** sube esta carpeta a un repo de GitHub y en Netlify
→ *Add new site → Import from Git*. Se republica solo en cada push.

## 3) Poner la key en Netlify
En el panel de Netlify de tu sitio:
**Site configuration → Environment variables → Add a variable**
- Key: `APISPORTS_KEY`
- Value: *(tu API key)*

O por CLI:
```bash
netlify env:set APISPORTS_KEY tu_api_key_aqui
netlify deploy --prod   # vuelve a desplegar para que tome la variable
```

## 4) Listo
Abre tu URL de Netlify. Si todo está bien, verás el indicador **● en vivo**
junto a "Actualizado" y las barras se moverán solas cada vez que jueguen.

---

## Notas
- **Mientras no esté la key / la función**, el dashboard muestra los datos por
  defecto (resultados al 22 jun 2026) y el botón "Actualizar resultados" te deja
  editar a mano en tu dispositivo. Cuando la API responde, manda ella.
- Los nombres de los rivales salen en inglés (Algeria, Austria…), tal como los
  entrega API-Football. Si quieres traducirlos, se hace en `mundial.js`.
- `league=1` es la Copa del Mundo en API-Football. Si algún día no devuelve datos,
  verifica en su panel que la cobertura de `league=1, season=2026` esté activa.
