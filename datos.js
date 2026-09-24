/* ═══════════════════════════════════════════════════════════════════
   Cargador de datos compartido para farmatodo / aruma / rappi.

   Google Apps Script es lento (5–70 s) y a veces responde 404, así que la
   página NO depende de él para abrir:
     1. Muestra al instante la última copia guardada en este navegador.
     2. Busca /data/<nombre>.json (copia estática que un GitHub Action
        refresca cada hora en este mismo sitio) → rápido y confiable.
     3. Solo si eso falla, va al Apps Script, con tiempo límite y reintento.
   Si todo falla pero hay copia guardada, se queda mostrándola con un aviso.
   ═══════════════════════════════════════════════════════════════════ */
function cargarDatos(opts) {
  var KEY = "letos_datos_" + opts.nombre;
  var mostrado = false;

  // 1) Copia local (instantánea)
  try {
    var c = localStorage.getItem(KEY);
    if (c) {
      var guardado = JSON.parse(c);
      if (guardado && guardado.dias) { opts.alListo(guardado, "cache"); mostrado = true; }
    }
  } catch (e) {}

  function conTiempoLimite(url, ms) {
    return new Promise(function (resolve, reject) {
      var ctl = window.AbortController ? new AbortController() : null;
      var t = setTimeout(function () { if (ctl) ctl.abort(); reject(new Error("tiempo agotado")); }, ms);
      fetch(url, ctl ? { signal: ctl.signal, cache: "no-cache" } : { cache: "no-cache" })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (j) {
          clearTimeout(t);
          if (!j || !j.dias || !j.dias.length) throw new Error("respuesta sin datos");
          resolve(j);
        })
        .catch(function (e) { clearTimeout(t); reject(e); });
    });
  }

  // 2) Estático  3) Apps Script (dos intentos)
  var bust = Math.floor(Date.now() / 300000); // cambia cada 5 min
  var fuentes = [
    { tipo: "estatico", url: "/data/" + opts.nombre + ".json?v=" + bust, ms: 15000 },
    { tipo: "apps_script", url: opts.api, ms: 60000 },
    { tipo: "apps_script", url: opts.api, ms: 60000 }
  ];

  function intentar(i) {
    if (i >= fuentes.length) {
      if (mostrado) { if (opts.alEstado) opts.alEstado("⚠ sin conexión con la fuente, mostrando la última copia guardada"); }
      else opts.alError("No se pudieron cargar los datos. Espera un momento y vuelve a intentar.");
      return;
    }
    var f = fuentes[i];
    conTiempoLimite(f.url, f.ms)
      .then(function (j) {
        try { localStorage.setItem(KEY, JSON.stringify(j)); } catch (e) {}
        opts.alListo(j, f.tipo);
        mostrado = true;
        if (f.tipo === "estatico") buscarMasReciente(j);
      })
      .catch(function () { intentar(i + 1); });
  }

  // La copia estática se refresca cada hora; para ver un sync recién hecho
  // sin esperar, preguntamos al Apps Script en segundo plano. Si trae un
  // 'updated' más nuevo, se re-dibuja solo. Si falla, no pasa nada.
  function buscarMasReciente(estatico) {
    var tEst = Date.parse(estatico.updated || "") || 0;
    conTiempoLimite(opts.api, 60000)
      .then(function (j) {
        var tNuevo = Date.parse(j.updated || "") || 0;
        if (tNuevo > tEst) {
          try { localStorage.setItem(KEY, JSON.stringify(j)); } catch (e) {}
          opts.alListo(j, "apps_script");
        }
      })
      .catch(function () {});
  }

  intentar(0);
}

/* Texto "Última actualización: …" consistente en las tres páginas. */
function textoActualizacion(j, fuente) {
  var base = j && j.updated ? "Última actualización: " + new Date(j.updated).toLocaleString("es-CO") : "Sin datos";
  if (fuente === "cache") base += " · copia guardada, buscando datos más recientes…";
  return base;
}
