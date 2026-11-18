/* =====================================================================
   VerdeLago ERP – interfaccia utente
   ---------------------------------------------------------------------
   Ogni "vista" è una funzione che restituisce l'HTML di una pagina.
   I pulsanti hanno un attributo data-action, gestito in un unico punto
   (vedi "Gestione degli eventi" in fondo al file).
   ===================================================================== */
(function () {
  'use strict';

  const $ = (sel, radice = document) => radice.querySelector(sel);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const somma = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const perDataDesc = (a, b) => b.data.localeCompare(a.data) || b.id - a.id;
  const nomeMese = ym => MESI[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(2, 4);
  const euroBreve = v => v >= 1000 ? fmtNum(v / 1000, v >= 10000 ? 0 : 1) + 'k €' : fmtNum(v) + ' €';

  /* ---------------- Navigazione ---------------- */
  const NAV = [
    { g: 'Direzione', v: [{ h: 'cruscotto', t: 'Cruscotto', i: '📊' }] },
    { g: 'Anagrafiche', v: [{ h: 'clienti', t: 'Clienti', i: '👥' }, { h: 'fornitori', t: 'Fornitori', i: '🏭' }, { h: 'prodotti', t: 'Prodotti', i: '📦' }] },
    { g: 'Vendite', v: [{ h: 'vendite/ordini', t: 'Ordini clienti', i: '📝' }, { h: 'vendite/ddt', t: 'DDT di vendita', i: '🚚' }, { h: 'vendite/fatture', t: 'Fatture di vendita', i: '🧾' }] },
    { g: 'Acquisti', v: [{ h: 'acquisti/ordini', t: 'Ordini fornitori', i: '🛒' }, { h: 'acquisti/ricevimenti', t: 'Ricevimenti merce', i: '📥' }, { h: 'acquisti/fatture', t: 'Fatture fornitori', i: '📄' }] },
    { g: 'Magazzino', v: [{ h: 'magazzino/giacenze', t: 'Giacenze', i: '🏬' }, { h: 'magazzino/movimenti', t: 'Movimenti', i: '🔁' }] },
    { g: 'Altro', v: [{ h: 'guida', t: 'Guida ed esercizi', i: '🎓' }, { h: 'impostazioni', t: 'Impostazioni e dati', i: '⚙️' }] }
  ];

  /* ---------------- Stati dei documenti ---------------- */
  const STATI = {
    'aperto': ['Aperto', 'giallo'],
    'evaso': ['Evaso, da fatturare', 'blu'],
    'ricevuto': ['Ricevuto, fattura da registrare', 'blu'],
    'fatturato': ['Fatturato', 'verde'],
    'da fatturare': ['Da fatturare', 'giallo'],
    'da registrare': ['Fattura da registrare', 'giallo'],
    'registrato': ['Fattura registrata', 'verde']
  };
  const badge = stato => { const [t, c] = STATI[stato] || [stato, 'grigio']; return `<span class="badge ${c}">${esc(t)}</span>`; };

  function badgePagamento(f, passiva) {
    if (f.pagata) return `<span class="badge verde">${passiva ? 'Pagata' : 'Incassata'} ${fmtData(f.dataPagamento)}</span>`;
    if (f.scadenza < oggi()) return '<span class="badge rosso">Scaduta</span>';
    return `<span class="badge giallo">${passiva ? 'Da pagare' : 'Da incassare'}</span>`;
  }

  const TIPI_DOC = {
    ov: { lista: 'ordiniVendita', titolo: 'Ordine cliente', prezzi: true, vendita: true },
    ddt: { lista: 'ddtVendita', titolo: 'Documento di trasporto (DDT)', prezzi: false, vendita: true },
    fv: { lista: 'fattureVendita', titolo: 'Fattura di vendita', prezzi: true, vendita: true },
    oa: { lista: 'ordiniAcquisto', titolo: 'Ordine a fornitore', prezzi: true, vendita: false },
    rm: { lista: 'ricevimenti', titolo: 'Ricevimento merce', prezzi: false, vendita: false },
    fa: { lista: 'fattureAcquisto', titolo: 'Fattura fornitore (passiva)', prezzi: true, vendita: false }
  };

  /* ---------------- Helper HTML ---------------- */
  function btn(testo, azione, dati = {}, cls = '') {
    const d = Object.entries(dati).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
    return `<button type="button" class="btn ${cls}" data-action="${azione}"${d}>${testo}</button>`;
  }
  function linkDoc(tipo, id, testo) {
    return `<a href="#" class="link-doc" data-action="doc" data-tipo="${tipo}" data-id="${id}">${esc(testo)}</a>`;
  }
  function nomeCliente(id) { const c = trova('clienti', id); return c ? c.ragioneSociale : '—'; }
  function nomeFornitore(id) { const f = trova('fornitori', id); return f ? f.ragioneSociale : '—'; }

  function pagina({ titolo, livello, descrizione, azioni = '', corpo }) {
    const lv = livello === 'operativo'
      ? '<span class="livello operativo" title="Qui si registrano le singole operazioni quotidiane">Livello operativo</span>'
      : livello === 'direzionale'
        ? '<span class="livello direzionale" title="Qui si leggono dati sintetici per prendere decisioni">Livello direzionale</span>' : '';
    return `<div class="page-head"><div><h1>${esc(titolo)} ${lv}</h1>${descrizione ? `<p class="descr">${descrizione}</p>` : ''}</div>
      <div class="page-actions">${azioni}</div></div>${corpo}`;
  }

  let contatoreTabelle = 0;
  function tabella(colonne, righe, { cerca = true, vuoto = 'Nessun elemento.', extra = '' } = {}) {
    const id = 'tab' + (++contatoreTabelle);
    const head = colonne.map(c => `<th class="${c.c || ''}">${esc(c.t)}</th>`).join('');
    const body = righe.length
      ? righe.map(r => `<tr>${r.map((v, i) => `<td class="${colonne[i].c || ''}">${v}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${colonne.length}" class="vuoto">${vuoto}</td></tr>`;
    const barra = (cerca || extra) ? `<div class="toolbar">${cerca ? `<input type="search" class="cerca" data-tabella="${id}" placeholder="Cerca…" aria-label="Cerca nella tabella">` : ''}${extra}</div>` : '';
    return `${barra}<div class="table-wrap"><table id="${id}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function kpi(titolo, valore, sotto, formula, cls = '') {
    return `<div class="kpi ${cls}"><div class="kpi-tit">${esc(titolo)}${formula ? ` <span class="info" tabindex="0" title="${esc(formula)}">?</span>` : ''}</div>
      <div class="kpi-val">${valore}</div>${sotto ? `<div class="kpi-sotto">${sotto}</div>` : ''}</div>`;
  }

  function scalaBella(max) {
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    const n = max / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  function graficoColonne(dati) {
    if (!dati.length) return '<p class="muted">Nessun dato nel periodo.</p>';
    const W = 600, H = 240, ml = 52, mb = 26, mt = 12, mr = 8;
    const scala = scalaBella(Math.max(...dati.map(d => d.v), 1));
    const bw = (W - ml - mr) / dati.length;
    let svg = '';
    for (let i = 0; i <= 4; i++) {
      const v = scala * i / 4, y = H - mb - (H - mb - mt) * v / scala;
      svg += `<line x1="${ml}" x2="${W - mr}" y1="${y}" y2="${y}" class="griglia"/><text x="${ml - 6}" y="${y + 4}" text-anchor="end" class="asse">${euroBreve(v)}</text>`;
    }
    dati.forEach((d, i) => {
      const h = (H - mb - mt) * d.v / scala, x = ml + i * bw + bw * 0.2, w = bw * 0.6;
      svg += `<rect x="${x}" y="${H - mb - h}" width="${w}" height="${h}" rx="3" class="barra"><title>${esc(d.l)}: ${fmtEuro(d.v)}</title></rect>
        <text x="${x + w / 2}" y="${H - 8}" text-anchor="middle" class="asse">${esc(d.l)}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" class="grafico" role="img" aria-label="Grafico a colonne">${svg}</svg>`;
  }

  function barreOrizzontali(dati, formato = fmtEuro) {
    if (!dati.length) return '<p class="muted">Nessun dato nel periodo.</p>';
    const max = Math.max(...dati.map(d => d.v), 1);
    return `<div class="barre">${dati.map(d => `<div class="barra-riga"><div class="barra-et" title="${esc(d.l)}">${esc(d.l)}</div>
      <div class="barra-traccia"><div class="barra-pieno" style="width:${(d.v / max * 100).toFixed(1)}%"></div></div>
      <div class="barra-val">${formato(d.v)}</div></div>`).join('')}</div>`;
  }

  /* =================================================================
     CRUSCOTTO (livello direzionale)
     ================================================================= */
  let periodo = 'tutto';

  function vistaCruscotto() {
    const mesi = [...new Set(DB.fattureVendita.map(f => f.data.slice(0, 7)))].sort();
    if (periodo !== 'tutto' && !mesi.includes(periodo)) periodo = 'tutto';
    const inPeriodo = d => periodo === 'tutto' || d.slice(0, 7) === periodo;
    const fv = DB.fattureVendita.filter(f => inPeriodo(f.data));

    const fatturato = somma(fv, f => f.imponibile);
    let costoVenduto = 0, co2 = 0;
    const perCat = {}, perCli = {};
    for (const f of fv) {
      perCli[f.clienteId] = (perCli[f.clienteId] || 0) + f.imponibile;
      for (const r of f.righe) {
        const p = trova('prodotti', r.prodottoId);
        costoVenduto += r.qta * (r.costo != null ? r.costo : (p ? p.costoAcquisto : 0));
        co2 += r.qta * (p ? p.co2 || 0 : 0);
        const cat = p ? p.categoria : 'Altro';
        perCat[cat] = (perCat[cat] || 0) + importoRiga(r);
      }
    }
    const margine = fatturato - costoVenduto;
    const margPerc = fatturato ? margine / fatturato * 100 : 0;

    const oggiStr = oggi();
    const crediti = DB.fattureVendita.filter(f => !f.pagata);
    const scaduti = crediti.filter(f => f.scadenza < oggiStr);
    const debiti = DB.fattureAcquisto.filter(f => !f.pagata);
    const valoreMag = somma(DB.prodotti, p => Math.max(0, giacenza(p.id)) * p.costoAcquisto);
    const rotazione = valoreMag ? costoVenduto / valoreMag : 0;
    const ordiniAperti = DB.ordiniVendita.filter(o => o.stato === 'aperto');
    const ddtDaFatt = DB.ddtVendita.filter(d => d.stato === 'da fatturare');
    const ricDaReg = DB.ricevimenti.filter(r => r.stato === 'da registrare');
    const daRiordinare = proposteRiordino();

    const selPeriodo = `<label class="filtro-lab">Periodo <select data-change="periodo" class="filtro">
      <option value="tutto">Tutto il periodo</option>${mesi.map(m => `<option value="${m}"${m === periodo ? ' selected' : ''}>${nomeMese(m)}</option>`).join('')}
      </select></label>`;

    const kpis = `<div class="kpi-grid">
      ${kpi('Fatturato', fmtEuro(fatturato), `${fv.length} fatture emesse`, 'Somma degli imponibili (IVA esclusa) delle fatture di vendita del periodo.')}
      ${kpi('Margine lordo', fmtEuro(margine), `${fmtNum(margPerc, 1)}% del fatturato`, 'Fatturato − costo d\'acquisto della merce venduta.', margine >= 0 ? 'pos' : 'neg')}
      ${kpi('Crediti verso clienti', fmtEuro(somma(crediti, f => f.totale)), scaduti.length ? `<span class="rosso-t">di cui scaduti ${fmtEuro(somma(scaduti, f => f.totale))}</span>` : 'nessuna fattura scaduta', 'Totale (IVA inclusa) delle fatture di vendita non ancora incassate. Non dipende dal periodo scelto.')}
      ${kpi('Debiti verso fornitori', fmtEuro(somma(debiti, f => f.totale)), `${debiti.length} fatture da pagare`, 'Totale (IVA inclusa) delle fatture dei fornitori non ancora pagate. Non dipende dal periodo scelto.')}
      ${kpi('Valore del magazzino', fmtEuro(valoreMag), 'valorizzato al costo d\'acquisto', 'Somma di giacenza × costo d\'acquisto per ogni prodotto, alla data di oggi.')}
      ${kpi('Indice di rotazione', fmtNum(rotazione, 2), 'volte nel periodo (stima)', 'Costo del venduto del periodo ÷ valore attuale del magazzino. Indica quante volte il magazzino si è "rinnovato". È una stima: si dovrebbe usare la giacenza media.')}
      ${kpi('Ordini da evadere', String(ordiniAperti.length), fmtEuro(somma(ordiniAperti, o => calcolaTotali(o.righe).imponibile)) + ' di imponibile', 'Ordini clienti aperti: merce impegnata ma non ancora consegnata.')}
      ${kpi('CO₂ evitata (stima)', fmtNum(co2) + ' kg', 'grazie ai prodotti venduti', 'Quantità vendute × kg di CO₂ evitata per unità indicati nell\'anagrafica prodotti. Valori indicativi, solo a scopo didattico.', 'eco')}
    </div>`;

    const mensile = mesi.map(m => ({ l: nomeMese(m), v: somma(DB.fattureVendita.filter(f => f.data.startsWith(m)), f => f.imponibile) }));
    const categorie = Object.entries(perCat).map(([l, v]) => ({ l, v })).sort((a, b) => b.v - a.v);
    const topClienti = Object.entries(perCli).map(([id, v]) => ({ l: nomeCliente(id), v })).sort((a, b) => b.v - a.v).slice(0, 5);

    const attivita = [
      [ordiniAperti.length, 'ordini clienti da evadere', 'vendite/ordini'],
      [ddtDaFatt.length, 'DDT da fatturare', 'vendite/ddt'],
      [daRiordinare.length, 'prodotti da riordinare', 'magazzino/giacenze'],
      [ricDaReg.length, 'fatture fornitori da registrare', 'acquisti/ricevimenti'],
      [scaduti.length, 'fatture clienti scadute non incassate', 'vendite/fatture']
    ];
    const daFare = `<ul class="da-fare">${attivita.map(([n, t, h]) => `<li class="${n ? 'attenzione' : 'ok'}"><a href="#/${h}"><span class="num">${n}</span>${esc(t)}</a></li>`).join('')}</ul>`;

    const corpo = `${kpis}
      <div class="grid-2">
        <section class="card"><h2>Fatturato per mese</h2>${graficoColonne(mensile)}<p class="nota">Il grafico mostra sempre tutti i mesi.</p></section>
        <section class="card"><h2>Fatturato per categoria</h2>${barreOrizzontali(categorie)}</section>
      </div>
      <div class="grid-2">
        <section class="card"><h2>I 5 clienti principali</h2>${barreOrizzontali(topClienti)}</section>
        <section class="card"><h2>Cose da fare</h2>${daFare}</section>
      </div>`;

    return pagina({
      titolo: 'Cruscotto direzionale', livello: 'direzionale',
      descrizione: `${esc(DB.azienda.attivita || '')}. I dati arrivano da ordini, DDT, fatture e movimenti registrati negli altri moduli: nessuno li inserisce qui a mano.`,
      azioni: selPeriodo, corpo
    });
  }

  /* =================================================================
     ANAGRAFICHE
     ================================================================= */
  const opzFornitori = () => DB.fornitori.map(f => ({ v: f.id, t: `${f.codice} – ${f.ragioneSociale}` }));
  const CAMPI_SOGGETTO = [
    { k: 'codice', t: 'Codice', req: 1 },
    { k: 'ragioneSociale', t: 'Ragione sociale', req: 1, largo: 1 },
    { k: 'piva', t: 'Partita IVA' },
    { k: 'citta', t: 'Città' },
    { k: 'provincia', t: 'Provincia', max: 2 },
    { k: 'email', t: 'Email', type: 'email', largo: 1 }
  ];
  const SCHEMI = {
    clienti: { singolare: 'cliente', prefisso: 'C', campi: CAMPI_SOGGETTO },
    fornitori: { singolare: 'fornitore', prefisso: 'F', campi: CAMPI_SOGGETTO },
    prodotti: {
      singolare: 'prodotto', prefisso: 'P', campi: [
        { k: 'codice', t: 'Codice', req: 1 },
        { k: 'descrizione', t: 'Descrizione', req: 1, largo: 1 },
        { k: 'categoria', t: 'Categoria', req: 1, opzioni: () => CATEGORIE.map(c => ({ v: c, t: c })) },
        { k: 'um', t: 'Unità di misura', req: 1, opzioni: () => UNITA_MISURA.map(u => ({ v: u, t: u })) },
        { k: 'costoAcquisto', t: 'Costo d\'acquisto €', type: 'number', step: '0.01', min: 0, num: 1, req: 1 },
        { k: 'prezzoVendita', t: 'Prezzo di vendita €', type: 'number', step: '0.01', min: 0, num: 1, req: 1 },
        { k: 'iva', t: 'Aliquota IVA %', req: 1, num: 1, opzioni: () => ALIQUOTE_IVA.map(a => ({ v: a, t: a + '%' })) },
        { k: 'scortaMinima', t: 'Scorta minima', type: 'number', step: '1', min: 0, num: 1, req: 1, aiuto: 'Sotto questa quantità il prodotto va riordinato' },
        { k: 'fornitoreId', t: 'Fornitore abituale', num: 1, vuota: 1, opzioni: opzFornitori },
        { k: 'co2', t: 'CO₂ evitata per unità (kg)', type: 'number', step: '0.1', min: 0, num: 1, aiuto: 'Valore stimato, a scopo didattico' }
      ]
    }
  };

  function vistaAnagrafica(tipo) {
    const ordinati = DB[tipo].slice().sort((a, b) => a.codice.localeCompare(b.codice));
    const azioniRiga = x => `<div class="azioni-riga">${btn('Modifica', 'modifica-anagrafica', { tipo, id: x.id }, 'piccolo sec')}${btn('Elimina', 'elimina-anagrafica', { tipo, id: x.id }, 'piccolo peric')}</div>`;
    let colonne, righe, descrizione;
    if (tipo === 'clienti') {
      descrizione = 'I dati di un cliente si inseriscono una sola volta e vengono riutilizzati da ordini, DDT e fatture: è uno dei vantaggi di un sistema integrato.';
      colonne = [{ t: 'Codice' }, { t: 'Ragione sociale' }, { t: 'Città' }, { t: 'Partita IVA' }, { t: 'Fatturato', c: 'num' }, { t: 'Da incassare', c: 'num' }, { t: '', c: 'azioni' }];
      righe = ordinati.map(c => {
        const ff = DB.fattureVendita.filter(f => f.clienteId === c.id);
        const aperto = somma(ff.filter(f => !f.pagata), f => f.totale);
        return [esc(c.codice), `<strong>${esc(c.ragioneSociale)}</strong>`, esc(c.citta) + (c.provincia ? ` (${esc(c.provincia)})` : ''), esc(c.piva),
          fmtEuro(somma(ff, f => f.imponibile)), aperto ? fmtEuro(aperto) : '—', azioniRiga(c)];
      });
    } else if (tipo === 'fornitori') {
      descrizione = 'Anagrafica dei fornitori. Ogni prodotto ha un fornitore abituale, usato dalle proposte di riordino.';
      colonne = [{ t: 'Codice' }, { t: 'Ragione sociale' }, { t: 'Città' }, { t: 'Partita IVA' }, { t: 'Prodotti', c: 'num' }, { t: 'Acquistato', c: 'num' }, { t: 'Da pagare', c: 'num' }, { t: '', c: 'azioni' }];
      righe = ordinati.map(f => {
        const ff = DB.fattureAcquisto.filter(x => x.fornitoreId === f.id);
        const aperto = somma(ff.filter(x => !x.pagata), x => x.totale);
        return [esc(f.codice), `<strong>${esc(f.ragioneSociale)}</strong>`, esc(f.citta) + (f.provincia ? ` (${esc(f.provincia)})` : ''), esc(f.piva),
          String(DB.prodotti.filter(p => p.fornitoreId === f.id).length), fmtEuro(somma(ff, x => x.imponibile)), aperto ? fmtEuro(aperto) : '—', azioniRiga(f)];
      });
    } else {
      descrizione = 'Ogni prodotto ha costo, prezzo, aliquota IVA, scorta minima e fornitore abituale. La colonna CO₂ indica i kg di CO₂ evitati stimati per unità venduta (valori indicativi).';
      colonne = [{ t: 'Codice' }, { t: 'Descrizione' }, { t: 'Categoria' }, { t: 'Fornitore' }, { t: 'Costo', c: 'num' }, { t: 'Prezzo', c: 'num' }, { t: 'Margine', c: 'num' }, { t: 'Giacenza', c: 'num' }, { t: 'CO₂/u', c: 'num' }, { t: '', c: 'azioni' }];
      righe = ordinati.map(p => {
        const marg = p.prezzoVendita ? (p.prezzoVendita - p.costoAcquisto) / p.prezzoVendita * 100 : 0;
        return [esc(p.codice), `<strong class="nome-prod">${esc(p.descrizione)}</strong>`, esc(p.categoria), esc(nomeFornitore(p.fornitoreId)),
          fmtEuro(p.costoAcquisto), fmtEuro(p.prezzoVendita), fmtNum(marg, 1) + '%', `${fmtNum(giacenza(p.id))} ${esc(p.um)}`, fmtNum(p.co2 || 0, 1) + ' kg', azioniRiga(p)];
      });
    }
    const titoli = { clienti: 'Clienti', fornitori: 'Fornitori', prodotti: 'Prodotti' };
    return pagina({
      titolo: titoli[tipo], livello: 'operativo', descrizione,
      azioni: btn('+ Nuovo ' + SCHEMI[tipo].singolare, 'nuova-anagrafica', { tipo }, 'prim'),
      corpo: tabella(colonne, righe)
    });
  }

  function campoHtml(c, v) {
    const req = c.req ? ' required' : '';
    let input;
    if (c.opzioni) {
      const opz = typeof c.opzioni === 'function' ? c.opzioni() : c.opzioni;
      input = `<select name="${c.k}"${req}>${c.vuota ? '<option value="">—</option>' : ''}${opz.map(o => `<option value="${esc(o.v)}"${String(o.v) === String(v ?? '') ? ' selected' : ''}>${esc(o.t)}</option>`).join('')}</select>`;
    } else {
      input = `<input name="${c.k}" type="${c.type || 'text'}"${c.step ? ` step="${c.step}"` : ''}${c.min != null ? ` min="${c.min}"` : ''}${c.max ? ` maxlength="${c.max}"` : ''} value="${esc(v ?? '')}"${req}>`;
    }
    return `<label class="${c.largo ? 'largo' : ''}"><span>${esc(c.t)}${c.req ? ' *' : ''}</span>${input}${c.aiuto ? `<small>${esc(c.aiuto)}</small>` : ''}</label>`;
  }

  function prossimoCodice(tipo) {
    const pre = SCHEMI[tipo].prefisso;
    const max = DB[tipo].reduce((m, x) => { const n = parseInt(String(x.codice).replace(/\D/g, ''), 10); return isNaN(n) ? m : Math.max(m, n); }, 0);
    return pre + String(max + 1).padStart(3, '0');
  }

  function apriFormAnagrafica(tipo, id) {
    const s = SCHEMI[tipo];
    const rec = id ? trova(tipo, id) : null;
    const valori = rec ? { ...rec } : { codice: prossimoCodice(tipo), iva: 22, um: 'pz', scortaMinima: 10, co2: 0 };
    apriModal(rec ? `Modifica ${s.singolare}` : `Nuovo ${s.singolare}`,
      `<form id="formAna" class="form-grid">${s.campi.map(c => campoHtml(c, valori[c.k])).join('')}</form><div id="erroreAna" class="errore hidden"></div>`,
      btn('Annulla', 'close-modal', {}, 'sec') + btn('Salva', 'salva-anagrafica', { tipo, id: id || '' }, 'prim'));
  }

  function salvaAnagrafica(tipo, id) {
    const s = SCHEMI[tipo];
    const fd = new FormData($('#formAna'));
    const dati = {};
    for (const c of s.campi) {
      let v = String(fd.get(c.k) ?? '').trim();
      if (c.req && v === '') return mostraErrore('#erroreAna', `Il campo "${c.t}" è obbligatorio.`);
      if (c.num) {
        if (v === '') v = null;
        else {
          v = Number(v.replace(',', '.'));
          if (isNaN(v) || v < 0) return mostraErrore('#erroreAna', `Il campo "${c.t}" deve essere un numero maggiore o uguale a zero.`);
        }
      }
      if (c.k === 'provincia') v = v.toUpperCase();
      dati[c.k] = v;
    }
    const doppio = DB[tipo].find(x => x.codice.toLowerCase() === dati.codice.toLowerCase() && x.id !== Number(id));
    if (doppio) return mostraErrore('#erroreAna', `Il codice ${dati.codice} è già usato.`);
    if (tipo === 'prodotti' && dati.prezzoVendita < dati.costoAcquisto) toast('Attenzione: il prezzo di vendita è inferiore al costo d\'acquisto.', 'avviso');
    if (id) Object.assign(trova(tipo, id), dati);
    else DB[tipo].push({ id: nuovoId(), ...dati });
    aggiorna();
    chiudiModal();
    toast(id ? 'Modifiche salvate.' : `${s.singolare[0].toUpperCase() + s.singolare.slice(1)} ${dati.codice} creato.`);
  }

  function motivoNonEliminabile(tipo, id) {
    id = Number(id);
    if (tipo === 'clienti' && DB.ordiniVendita.some(o => o.clienteId === id)) return 'Il cliente compare in alcuni ordini: non si può eliminare senza perdere la storia dei documenti.';
    if (tipo === 'fornitori') {
      if (DB.ordiniAcquisto.some(o => o.fornitoreId === id)) return 'Il fornitore compare in alcuni ordini: non si può eliminare.';
      if (DB.prodotti.some(p => p.fornitoreId === id)) return 'Il fornitore è il fornitore abituale di alcuni prodotti: cambialo prima nell\'anagrafica prodotti.';
    }
    if (tipo === 'prodotti') {
      const usato = DB.movimenti.some(m => m.prodottoId === id) || [...DB.ordiniVendita, ...DB.ordiniAcquisto].some(o => o.righe.some(r => r.prodottoId === id));
      if (usato) return 'Il prodotto ha movimenti di magazzino o compare in documenti: non si può eliminare.';
    }
    return null;
  }

  /* =================================================================
     ELENCHI DEI DOCUMENTI
     ================================================================= */
  function vistaOrdiniVendita() {
    const righe = DB.ordiniVendita.slice().sort(perDataDesc).map(o => [
      linkDoc('ov', o.id, o.numero), fmtData(o.data), esc(nomeCliente(o.clienteId)),
      fmtEuro(calcolaTotali(o.righe).imponibile), badge(o.stato),
      `<div class="azioni-riga">${o.stato === 'aperto' ? btn('Crea DDT', 'crea-ddt', { id: o.id }, 'piccolo prim') + btn('Elimina', 'elimina-ordine', { tipo: 'vendita', id: o.id }, 'piccolo peric') : ''}</div>`
    ]);
    return pagina({
      titolo: 'Ordini clienti', livello: 'operativo',
      descrizione: 'Il ciclo attivo comincia qui. L\'ordine <strong>impegna</strong> la merce ma non la toglie dal magazzino: lo scarico avviene con il DDT.',
      azioni: btn('+ Nuovo ordine', 'nuovo-ordine', { tipo: 'vendita' }, 'prim'),
      corpo: tabella([{ t: 'Numero' }, { t: 'Data' }, { t: 'Cliente' }, { t: 'Imponibile', c: 'num' }, { t: 'Stato' }, { t: '', c: 'azioni' }], righe)
    });
  }

  function vistaDdtVendita() {
    const righe = DB.ddtVendita.slice().sort(perDataDesc).map(d => [
      linkDoc('ddt', d.id, d.numero), fmtData(d.data), esc(nomeCliente(d.clienteId)),
      linkDoc('ov', d.ordineId, (trova('ordiniVendita', d.ordineId) || {}).numero || '—'),
      fmtNum(somma(d.righe, r => r.qta)), badge(d.stato),
      `<div class="azioni-riga">${d.stato === 'da fatturare' ? btn('Crea fattura', 'crea-fattura', { id: d.id }, 'piccolo prim') : ''}</div>`
    ]);
    return pagina({
      titolo: 'DDT di vendita', livello: 'operativo',
      descrizione: 'Il documento di trasporto accompagna la merce consegnata al cliente. Quando viene creato, il magazzino registra lo <strong>scarico</strong>.',
      corpo: tabella([{ t: 'Numero' }, { t: 'Data' }, { t: 'Cliente' }, { t: 'Rif. ordine' }, { t: 'Q.tà totale', c: 'num' }, { t: 'Stato' }, { t: '', c: 'azioni' }], righe)
    });
  }

  function vistaFatture(passiva) {
    const lista = passiva ? DB.fattureAcquisto : DB.fattureVendita;
    const tipo = passiva ? 'fa' : 'fv';
    const righe = lista.slice().sort(perDataDesc).map(f => {
      const base = [linkDoc(tipo, f.id, f.numero)];
      if (passiva) base.push(esc(f.numeroFornitore));
      return base.concat([fmtData(f.data), esc(passiva ? nomeFornitore(f.fornitoreId) : nomeCliente(f.clienteId)),
        fmtEuro(f.imponibile), fmtEuro(f.iva), `<strong>${fmtEuro(f.totale)}</strong>`, fmtData(f.scadenza), badgePagamento(f, passiva),
        `<div class="azioni-riga">${btn(f.pagata ? 'Annulla' : (passiva ? 'Paga' : 'Incassa'), 'pagamento', { tipo, id: f.id }, 'piccolo ' + (f.pagata ? 'sec' : 'prim'))}</div>`]);
    });
    const colonne = [{ t: passiva ? 'Protocollo' : 'Numero' }];
    if (passiva) colonne.push({ t: 'N. fornitore' });
    colonne.push({ t: 'Data' }, { t: passiva ? 'Fornitore' : 'Cliente' }, { t: 'Imponibile', c: 'num' }, { t: 'IVA', c: 'num' }, { t: 'Totale', c: 'num' }, { t: 'Scadenza' }, { t: 'Pagamento' }, { t: '', c: 'azioni' });
    const aperte = lista.filter(f => !f.pagata);
    const riepilogo = `<div class="riepilogo"><div><small>Totale fatture</small><strong>${fmtEuro(somma(lista, f => f.totale))}</strong></div>
      <div><small>${passiva ? 'Ancora da pagare' : 'Ancora da incassare'}</small><strong>${fmtEuro(somma(aperte, f => f.totale))}</strong></div>
      <div><small>Di cui scadute</small><strong class="rosso-t">${fmtEuro(somma(aperte.filter(f => f.scadenza < oggi()), f => f.totale))}</strong></div></div>`;
    return pagina({
      titolo: passiva ? 'Fatture fornitori' : 'Fatture di vendita', livello: 'operativo',
      descrizione: passiva
        ? 'Le fatture ricevute dai fornitori generano un <strong>debito</strong> da pagare entro la scadenza (qui 60 giorni).'
        : 'La fattura nasce dal DDT e genera un <strong>credito</strong> verso il cliente, da incassare entro la scadenza (qui 30 giorni).',
      corpo: riepilogo + tabella(colonne, righe)
    });
  }

  function vistaOrdiniAcquisto() {
    const righe = DB.ordiniAcquisto.slice().sort(perDataDesc).map(o => [
      linkDoc('oa', o.id, o.numero), fmtData(o.data), esc(nomeFornitore(o.fornitoreId)),
      fmtEuro(calcolaTotali(o.righe).imponibile), badge(o.stato),
      `<div class="azioni-riga">${o.stato === 'aperto' ? btn('Registra ricevimento', 'ricevimento', { id: o.id }, 'piccolo prim') + btn('Elimina', 'elimina-ordine', { tipo: 'acquisto', id: o.id }, 'piccolo peric') : ''}</div>`
    ]);
    return pagina({
      titolo: 'Ordini fornitori', livello: 'operativo',
      descrizione: 'Il ciclo passivo comincia qui. La merce ordinata risulta <strong>in arrivo</strong> finché non si registra il ricevimento.',
      azioni: btn('+ Nuovo ordine', 'nuovo-ordine', { tipo: 'acquisto' }, 'prim'),
      corpo: tabella([{ t: 'Numero' }, { t: 'Data' }, { t: 'Fornitore' }, { t: 'Imponibile', c: 'num' }, { t: 'Stato' }, { t: '', c: 'azioni' }], righe)
    });
  }

  function vistaRicevimenti() {
    const righe = DB.ricevimenti.slice().sort(perDataDesc).map(r => [
      linkDoc('rm', r.id, r.numero), fmtData(r.data), esc(nomeFornitore(r.fornitoreId)),
      linkDoc('oa', r.ordineId, (trova('ordiniAcquisto', r.ordineId) || {}).numero || '—'), esc(r.rifFornitore),
      fmtNum(somma(r.righe, x => x.qta)), badge(r.stato),
      `<div class="azioni-riga">${r.stato === 'da registrare' ? btn('Registra fattura', 'fattura-acquisto', { id: r.id }, 'piccolo prim') : ''}</div>`
    ]);
    return pagina({
      titolo: 'Ricevimenti merce', livello: 'operativo',
      descrizione: 'Quando la merce arriva si controlla il DDT del fornitore e si registra il ricevimento: il magazzino registra il <strong>carico</strong>.',
      corpo: tabella([{ t: 'Numero' }, { t: 'Data' }, { t: 'Fornitore' }, { t: 'Rif. ordine' }, { t: 'DDT fornitore' }, { t: 'Q.tà totale', c: 'num' }, { t: 'Stato' }, { t: '', c: 'azioni' }], righe)
    });
  }

  /* =================================================================
     MAGAZZINO
     ================================================================= */
  function statoScorta(p) {
    const g = giacenza(p.id), imp = impegnato(p.id), ia = inArrivo(p.id);
    if (g - imp + ia <= p.scortaMinima) return '<span class="badge rosso">Da riordinare</span>';
    if (g - imp <= p.scortaMinima) return '<span class="badge giallo">Sotto scorta, in arrivo</span>';
    return '<span class="badge verde">OK</span>';
  }

  function vistaGiacenze() {
    const prodotti = DB.prodotti.slice().sort((a, b) => a.codice.localeCompare(b.codice));
    const daRiordinare = new Set(proposteRiordino().map(x => x.p.id));
    const righe = prodotti.map(p => {
      const g = giacenza(p.id), imp = impegnato(p.id), ia = inArrivo(p.id);
      return [esc(p.codice), `<a href="#" class="link-doc nome-prod" data-action="scheda" data-id="${p.id}" title="Apri la scheda di magazzino">${esc(p.descrizione)}</a>`, fmtNum(g), imp ? fmtNum(imp) : '—',
        `<strong class="${g - imp <= p.scortaMinima ? 'rosso-t' : ''}">${fmtNum(g - imp)}</strong>`, ia ? fmtNum(ia) : '—',
        fmtNum(p.scortaMinima), `<div class="stato-cella">${statoScorta(p)}${daRiordinare.has(p.id) ? btn('Riordina', 'riordina', { id: p.id }, 'piccolo prim') : ''}</div>`, fmtEuro(Math.max(0, g) * p.costoAcquisto),
        btn('Rettifica', 'rettifica', { id: p.id }, 'piccolo sec')];
    });
    const valore = somma(prodotti, p => Math.max(0, giacenza(p.id)) * p.costoAcquisto);
    const legenda = `<div class="legenda card">
      <div><strong>Giacenza</strong> merce fisicamente presente in magazzino</div>
      <div><strong>Impegnata</strong> ordinata dai clienti, non ancora consegnata</div>
      <div><strong>Disponibile</strong> giacenza − impegnata</div>
      <div><strong>Da riordinare</strong> quando disponibile + in arrivo ≤ scorta minima</div></div>`;
    return pagina({
      titolo: 'Giacenze di magazzino', livello: 'operativo',
      descrizione: `Le giacenze si aggiornano da sole con DDT (scarichi) e ricevimenti (carichi). Valore complessivo al costo: <strong>${fmtEuro(valore)}</strong>. Clicca sul nome di un prodotto per vederne la scheda di magazzino.`,
      azioni: btn('Genera ordini di riordino', 'riordina-tutto', {}, daRiordinare.size ? 'prim' : 'sec'),
      corpo: legenda + tabella([{ t: 'Codice' }, { t: 'Prodotto' }, { t: 'Giacenza', c: 'num' }, { t: 'Impegnata', c: 'num' }, { t: 'Disponibile', c: 'num' }, { t: 'In arrivo', c: 'num' }, { t: 'Scorta min.', c: 'num' }, { t: 'Stato' }, { t: 'Valore', c: 'num' }, { t: '', c: 'azioni' }], righe)
    });
  }

  let filtroProdotto = '';

  function vistaMovimenti() {
    if (filtroProdotto && !trova('prodotti', filtroProdotto)) filtroProdotto = '';
    const prodotti = DB.prodotti.slice().sort((a, b) => a.codice.localeCompare(b.codice));
    const sel = `<select data-change="filtro-movimenti" class="filtro" aria-label="Filtra per prodotto"><option value="">Tutti i prodotti</option>
      ${prodotti.map(p => `<option value="${p.id}"${String(p.id) === filtroProdotto ? ' selected' : ''}>${esc(p.codice + ' – ' + p.descrizione)}</option>`).join('')}</select>`;
    const tipoBadge = m => `<span class="badge ${m.qta > 0 ? 'verde' : m.qta < 0 ? 'rosso' : 'grigio'}">${esc(m.tipo)}</span>`;
    let corpo, descrizione;
    if (filtroProdotto) {
      const p = trova('prodotti', filtroProdotto);
      const movs = DB.movimenti.filter(m => m.prodottoId === p.id).sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id);
      let saldo = 0;
      const righe = movs.map(m => {
        saldo += m.qta;
        return [fmtData(m.data), tipoBadge(m), esc(m.causale), esc(m.documento), m.qta > 0 ? fmtNum(m.qta) : '', m.qta < 0 ? fmtNum(-m.qta) : '', `<strong>${fmtNum(saldo)}</strong>`];
      });
      descrizione = `Scheda di magazzino di <strong>${esc(p.descrizione)}</strong>, in ordine cronologico: il saldo finale è la giacenza attuale.`;
      corpo = tabella([{ t: 'Data' }, { t: 'Tipo' }, { t: 'Causale' }, { t: 'Documento' }, { t: 'Carichi', c: 'num' }, { t: 'Scarichi', c: 'num' }, { t: 'Saldo', c: 'num' }], righe, { extra: sel });
    } else {
      const righe = DB.movimenti.slice().sort(perDataDesc).map(m => {
        const p = trova('prodotti', m.prodottoId);
        return [fmtData(m.data), esc(p ? `${p.codice} – ${p.descrizione}` : '—'), tipoBadge(m), esc(m.causale), esc(m.documento),
          `<strong class="${m.qta < 0 ? 'rosso-t' : 'verde-t'}">${m.qta > 0 ? '+' : ''}${fmtNum(m.qta)}</strong>`];
      });
      descrizione = 'Ogni carico e scarico è registrato come movimento. Scegli un prodotto per vederne la scheda di magazzino con il saldo progressivo.';
      corpo = tabella([{ t: 'Data' }, { t: 'Prodotto' }, { t: 'Tipo' }, { t: 'Causale' }, { t: 'Documento' }, { t: 'Quantità', c: 'num' }], righe, { extra: sel });
    }
    return pagina({ titolo: 'Movimenti di magazzino', livello: 'operativo', descrizione, corpo });
  }

  /* =================================================================
     GUIDA ED ESERCIZI
     ================================================================= */
  function vistaGuida() {
    const flusso = passi => `<div class="flusso">${passi.map(([t, s]) => `<div class="flusso-passo"><strong>${t}</strong><small>${s}</small></div>`).join('<span class="freccia">→</span>')}</div>`;
    const corpo = `
      <section class="card prosa">
        <h2>Che cos'è questo programma</h2>
        <p>VerdeLago ERP è un piccolo <strong>gestionale integrato</strong> (ERP, <em>Enterprise Resource Planning</em>) costruito per la didattica. Simula l'azienda <strong>${esc(DB.azienda.ragioneSociale)}</strong>, che distribuisce prodotti per la sostenibilità ambientale a hotel, ristoranti, negozi e uffici. Tutti i dati sono di fantasia.</p>
        <p>"Integrato" significa che i moduli condividono gli <strong>stessi dati</strong>: quando emetti un DDT, il magazzino si aggiorna; quando emetti una fattura, il cruscotto mostra subito il nuovo fatturato e il credito verso il cliente. Nessuno deve ricopiare le informazioni da un ufficio all'altro.</p>
        <h3>Livello operativo e livello direzionale</h3>
        <p>Le pagine con l'etichetta <span class="livello operativo">Livello operativo</span> servono a registrare le operazioni di tutti i giorni (un ordine, una consegna, una fattura). Il <span class="livello direzionale">Livello direzionale</span>, cioè il cruscotto, mostra invece dati <strong>sintetici</strong> utili a chi deve prendere decisioni. È la piramide di Anthony vista dentro un software.</p>
      </section>
      <div class="grid-2">
        <section class="card"><h2>Ciclo attivo (vendite)</h2>
          ${flusso([['Ordine cliente', 'impegna la merce'], ['DDT', 'scarica il magazzino'], ['Fattura', 'crea il credito'], ['Incasso', 'chiude il credito']])}
        </section>
        <section class="card"><h2>Ciclo passivo (acquisti)</h2>
          ${flusso([['Ordine fornitore', 'merce in arrivo'], ['Ricevimento', 'carica il magazzino'], ['Fattura fornitore', 'crea il debito'], ['Pagamento', 'chiude il debito']])}
        </section>
      </div>
      <section class="card prosa">
        <h2>Esercizi guidati</h2>
        <ol class="esercizi">
          <li><strong>Un nuovo cliente.</strong> Inserisci un nuovo cliente in <em>Anagrafiche → Clienti</em>, poi crea per lui un ordine di 10 pannelli LED 60×60 e 20 riduttori di flusso. Prova ad aggiungere anche 20 borracce: che cosa ti segnala il programma sotto la riga? Perché la giacenza è alta ma la disponibilità è bassa?</li>
          <li><strong>Dall'ordine alla fattura.</strong> Evadi l'ordine creando il DDT, poi la fattura. Clicca sul nome del pannello LED in <em>Magazzino → Giacenze</em> per aprirne la scheda: trovi lo scarico? Nel cruscotto, come sono cambiati fatturato e crediti?</li>
          <li><strong>Merce insufficiente.</strong> Crea un ordine per 50 compostiere e prova a evaderlo. Che cosa succede, e perché il programma blocca l'operazione?</li>
          <li><strong>Riordino.</strong> In <em>Magazzino → Giacenze</em> alcuni prodotti sono "Da riordinare". Genera gli ordini di riordino, registra il ricevimento della merce e la fattura del fornitore. Lo stato dei prodotti cambia?</li>
          <li><strong>Inventario.</strong> Durante il conteggio fisico trovi 2 soffioni doccia in meno del previsto. Registra una rettifica e verifica il movimento nella scheda di magazzino.</li>
          <li><strong>Analisi direzionale.</strong> Nel cruscotto: in quale mese si è fatturato di più, e perché secondo te? Quale categoria rende di più? Ci sono fatture scadute? Che cosa consiglieresti alla direzione?</li>
          <li><strong>Margini.</strong> In <em>Prodotti</em>, quale prodotto ha il margine percentuale più alto? Prova ad aumentare del 10% il costo d'acquisto delle lampadine LED e crea un nuovo ordine: come cambia il margine stimato?</li>
        </ol>
        <p class="nota">Per ripartire dai dati iniziali usa <em>Impostazioni e dati → Ripristina dati demo</em>. Per consegnare il lavoro al docente usa <em>Esporta dati</em>.</p>
      </section>`;
    return pagina({ titolo: 'Guida ed esercizi', descrizione: 'Come funziona il programma e alcune attività da svolgere in laboratorio.', corpo });
  }

  /* =================================================================
     IMPOSTAZIONI
     ================================================================= */
  const CAMPI_AZIENDA = [
    { k: 'ragioneSociale', t: 'Ragione sociale', req: 1, largo: 1 },
    { k: 'attivita', t: 'Attività', largo: 1 },
    { k: 'piva', t: 'Partita IVA' },
    { k: 'email', t: 'Email', type: 'email' },
    { k: 'indirizzo', t: 'Indirizzo', largo: 1 },
    { k: 'citta', t: 'CAP e città', largo: 1 }
  ];

  function vistaImpostazioni() {
    const conteggi = [['Clienti', DB.clienti], ['Fornitori', DB.fornitori], ['Prodotti', DB.prodotti], ['Ordini clienti', DB.ordiniVendita], ['Fatture di vendita', DB.fattureVendita], ['Movimenti di magazzino', DB.movimenti]];
    const corpo = `<div class="grid-2">
      <section class="card"><h2>Dati dell'azienda</h2>
        <form id="formAzienda" class="form-grid">${CAMPI_AZIENDA.map(c => campoHtml(c, DB.azienda[c.k])).join('')}</form>
        <div id="erroreAzienda" class="errore hidden"></div>
        <div class="card-azioni">${btn('Salva dati azienda', 'salva-azienda', {}, 'prim')}</div>
      </section>
      <section class="card"><h2>Gestione dei dati</h2>
        <p>I dati sono salvati <strong>solo in questo browser</strong>, su questo computer. Se cambi PC, usi un altro browser o cancelli la cronologia, non li ritrovi.</p>
        <ul class="conteggi">${conteggi.map(([t, l]) => `<li><span>${t}</span><strong>${fmtNum(l.length)}</strong></li>`).join('')}</ul>
        <div class="pila">
          <div>${btn('⬇ Esporta dati (file JSON)', 'esporta', {}, 'prim')}<small>Salva una copia del lavoro, per esempio per consegnarla al docente.</small></div>
          <div>${btn('⬆ Importa dati', 'importa', {}, 'sec')}<input type="file" id="fileImport" accept=".json,application/json" hidden><small>Carica un file esportato in precedenza. Sostituisce i dati attuali.</small></div>
          <div>${btn('↺ Ripristina dati demo', 'reset-demo', {}, 'sec')}<small>Torna all'azienda VerdeLago con i dati iniziali.</small></div>
          <div>${btn('Svuota tutto', 'svuota', {}, 'peric')}<small>Cancella tutti i dati per costruire un'azienda da zero.</small></div>
        </div>
      </section></div>`;
    return pagina({ titolo: 'Impostazioni e dati', corpo });
  }

  function salvaAzienda() {
    const fd = new FormData($('#formAzienda'));
    const dati = {};
    for (const c of CAMPI_AZIENDA) dati[c.k] = String(fd.get(c.k) ?? '').trim();
    if (!dati.ragioneSociale) return mostraErrore('#erroreAzienda', 'La ragione sociale è obbligatoria.');
    Object.assign(DB.azienda, dati);
    aggiorna();
    toast('Dati dell\'azienda salvati.');
  }

  function esportaDati() {
    const blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `verdelago-erp-${oggi()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('File esportato.');
  }

  function importaFile(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const lettore = new FileReader();
    lettore.onload = () => {
      try {
        const dati = JSON.parse(lettore.result);
        if (!databaseValido(dati)) throw new Error('formato');
        DB = dati;
        aggiorna();
        toast('Dati importati correttamente.');
      } catch (e) {
        toast('Il file non è un\'esportazione valida di VerdeLago ERP.', 'errore');
      }
      input.value = '';
    };
    lettore.readAsText(file);
  }

  /* =================================================================
     FORM ORDINI (vendita e acquisto)
     ================================================================= */
  let F = null; // stato del form ordine aperto

  function apriFormOrdine(tipo, id) {
    const lista = tipo === 'vendita' ? 'ordiniVendita' : 'ordiniAcquisto';
    const esist = id ? trova(lista, id) : null;
    F = { tipo, id: esist ? esist.id : null, righe: esist ? esist.righe.map(r => ({ ...r })) : [{ prodottoId: '', qta: 1, prezzo: 0, sconto: 0 }] };
    const vend = tipo === 'vendita';
    const contro = (vend ? DB.clienti : DB.fornitori).slice().sort((a, b) => a.ragioneSociale.localeCompare(b.ragioneSociale));
    const ctrId = esist ? (vend ? esist.clienteId : esist.fornitoreId) : '';
    const corpo = `<form id="formOrdine" class="form-grid">
        <label><span>Data *</span><input type="date" name="data" value="${esist ? esist.data : oggi()}" required></label>
        <label class="largo"><span>${vend ? 'Cliente' : 'Fornitore'} *</span><select name="controparte" required><option value="">— seleziona —</option>
          ${contro.map(c => `<option value="${c.id}"${c.id === ctrId ? ' selected' : ''}>${esc(c.ragioneSociale)}</option>`).join('')}</select></label>
        <label class="pieno"><span>Note</span><input name="note" value="${esc(esist ? esist.note : '')}"></label>
      </form>
      <h3 class="sub">Righe dell'ordine</h3>
      <div id="righeOrdine"></div>
      ${btn('+ Aggiungi riga', 'aggiungi-riga', {}, 'sec piccolo')}
      <div id="totaliOrdine" class="totali-form"></div>
      <div id="erroreOrdine" class="errore hidden"></div>`;
    apriModal((esist ? 'Modifica ' : 'Nuovo ') + (vend ? 'ordine cliente' : 'ordine fornitore') + (esist ? ' ' + esist.numero : ''), corpo,
      btn('Annulla', 'close-modal', {}, 'sec') + btn('Salva ordine', 'salva-ordine', {}, 'prim'), 'largo');
    disegnaRighe();
  }

  function disegnaRighe() {
    const vend = F.tipo === 'vendita';
    const prodotti = DB.prodotti.slice().sort((a, b) => a.codice.localeCompare(b.codice));
    const righe = F.righe.map((r, i) => `<tr>
        <td><select data-riga="${i}" data-campo="prodottoId" aria-label="Prodotto"><option value="">— prodotto —</option>
          ${prodotti.map(p => `<option value="${p.id}"${String(p.id) === String(r.prodottoId) ? ' selected' : ''}>${esc(p.codice + ' – ' + p.descrizione)}</option>`).join('')}</select>
          <div class="info-riga" id="info-${i}"></div></td>
        <td><input type="number" min="1" step="1" data-riga="${i}" data-campo="qta" value="${esc(r.qta)}" aria-label="Quantità"></td>
        <td><input type="number" min="0" step="0.01" data-riga="${i}" data-campo="prezzo" value="${esc(r.prezzo)}" aria-label="Prezzo unitario"></td>
        ${vend ? `<td><input type="number" min="0" max="100" step="1" data-riga="${i}" data-campo="sconto" value="${esc(r.sconto || 0)}" aria-label="Sconto percentuale"></td>` : ''}
        <td class="num" id="imp-${i}"></td>
        <td>${F.righe.length > 1 ? `<button type="button" class="icon-btn" data-action="rimuovi-riga" data-i="${i}" aria-label="Rimuovi riga">✕</button>` : ''}</td>
      </tr>`).join('');
    $('#righeOrdine').innerHTML = `<div class="table-wrap"><table class="tab-righe"><thead><tr><th>Prodotto</th><th>Q.tà</th><th>Prezzo €</th>${vend ? '<th>Sconto %</th>' : ''}<th class="num">Importo</th><th></th></tr></thead><tbody>${righe}</tbody></table></div>`;
    aggiornaTotaliForm();
  }

  function righeFormValide() {
    return F.righe.filter(r => r.prodottoId && Number(r.qta) > 0).map(r => {
      const p = trova('prodotti', r.prodottoId);
      return { prodottoId: p.id, qta: Number(r.qta), prezzo: Number(r.prezzo) || 0, sconto: F.tipo === 'vendita' ? Number(r.sconto) || 0 : 0, iva: p.iva };
    });
  }

  function aggiornaTotaliForm() {
    const vend = F.tipo === 'vendita';
    const ordineEsist = F.id ? trova(vend ? 'ordiniVendita' : 'ordiniAcquisto', F.id) : null;
    F.righe.forEach((r, i) => {
      const imp = $('#imp-' + i), info = $('#info-' + i);
      const p = r.prodottoId ? trova('prodotti', r.prodottoId) : null;
      if (imp) imp.textContent = p ? fmtEuro(importoRiga({ qta: Number(r.qta) || 0, prezzo: Number(r.prezzo) || 0, sconto: vend ? Number(r.sconto) || 0 : 0 })) : '';
      if (!info) return;
      if (!p) { info.innerHTML = ''; return; }
      if (vend) {
        let disp = disponibile(p.id);
        if (ordineEsist && ordineEsist.stato === 'aperto') disp += somma(ordineEsist.righe.filter(x => x.prodottoId === p.id), x => x.qta);
        const richiesto = somma(F.righe.filter(x => String(x.prodottoId) === String(p.id)), x => Number(x.qta) || 0);
        const g = giacenza(p.id);
        let avviso = '';
        if (richiesto > g) avviso = ` – in magazzino ce ne sono solo ${fmtNum(g)}: il DDT sarà bloccato finché non arriva altra merce`;
        else if (richiesto > disp) avviso = ' – supera la disponibilità: userai merce già promessa ad altri clienti';
        info.innerHTML = `<span class="${avviso ? 'rosso-t' : 'muted'}">Disponibili ${fmtNum(disp)} ${esc(p.um)} (giacenza ${fmtNum(g)})${avviso}</span>`;
      } else {
        info.innerHTML = `<span class="muted">Giacenza ${fmtNum(giacenza(p.id))} · scorta minima ${fmtNum(p.scortaMinima)} · fornitore abituale: ${esc(nomeFornitore(p.fornitoreId))}</span>`;
      }
    });
    const righe = righeFormValide();
    const t = calcolaTotali(righe);
    let extra = '';
    if (vend && righe.length) {
      const costo = somma(righe, r => r.qta * trova('prodotti', r.prodottoId).costoAcquisto);
      const marg = t.imponibile - costo;
      extra = `<div><span>Margine stimato</span><strong class="${marg < 0 ? 'rosso-t' : 'verde-t'}">${fmtEuro(marg)}${t.imponibile ? ` (${fmtNum(marg / t.imponibile * 100, 1)}%)` : ''}</strong></div>`;
    }
    $('#totaliOrdine').innerHTML = `<div><span>Imponibile</span><strong>${fmtEuro(t.imponibile)}</strong></div>
      <div><span>IVA</span><strong>${fmtEuro(t.iva)}</strong></div>
      <div class="tot"><span>Totale</span><strong>${fmtEuro(t.totale)}</strong></div>${extra}`;
  }

  function aggiornaCampoRiga(el) {
    if (!F) return;
    const i = Number(el.dataset.riga), campo = el.dataset.campo;
    const r = F.righe[i];
    if (!r) return;
    r[campo] = el.value;
    if (campo === 'prodottoId') {
      const p = trova('prodotti', el.value);
      if (p) r.prezzo = F.tipo === 'vendita' ? p.prezzoVendita : p.costoAcquisto;
      disegnaRighe();
    } else {
      aggiornaTotaliForm();
    }
  }

  function salvaOrdine() {
    const fd = new FormData($('#formOrdine'));
    const data = fd.get('data');
    if (!data) return mostraErrore('#erroreOrdine', 'Inserisci la data.');
    if (F.righe.some(r => r.prodottoId && !(Number(r.qta) > 0))) return mostraErrore('#erroreOrdine', 'Ogni riga con un prodotto deve avere una quantità maggiore di zero.');
    if (F.righe.some(r => r.prodottoId && !Number.isInteger(Number(r.qta)))) return mostraErrore('#erroreOrdine', 'Le quantità devono essere numeri interi.');
    const dati = { data, note: String(fd.get('note') || '').trim(), righe: righeFormValide() };
    const vend = F.tipo === 'vendita';
    let r;
    if (vend) {
      dati.clienteId = fd.get('controparte');
      r = F.id ? modificaOrdineVendita(F.id, dati) : creaOrdineVendita(dati);
    } else {
      dati.fornitoreId = fd.get('controparte');
      r = F.id ? modificaOrdineAcquisto(F.id, dati) : creaOrdineAcquisto(dati);
    }
    if (!r.ok) return mostraErrore('#erroreOrdine', r.errore);
    aggiorna();
    mostraDocumento(vend ? 'ov' : 'oa', r.doc.id);
    toast(`Ordine ${r.doc.numero} salvato.` + (vend ? ' La merce ora risulta impegnata.' : ' La merce ora risulta in arrivo.'));
  }

  /* =================================================================
     VISUALIZZAZIONE DEI DOCUMENTI
     ================================================================= */
  function catenaDocumentale(tipo, d) {
    const T = TIPI_DOC[tipo];
    let o, passi;
    if (T.vendita) {
      o = tipo === 'ov' ? d : trova('ordiniVendita', d.ordineId);
      passi = [['ov', o && o.id, 'Ordine cliente'], ['ddt', o && o.ddtId, 'DDT'], ['fv', o && o.fatturaId, 'Fattura']];
    } else {
      o = tipo === 'oa' ? d : trova('ordiniAcquisto', d.ordineId);
      passi = [['oa', o && o.id, 'Ordine fornitore'], ['rm', o && o.ricevimentoId, 'Ricevimento'], ['fa', o && o.fatturaId, 'Fattura fornitore']];
    }
    const html = passi.map(([t, id, et], i) => {
      const doc = id ? trova(TIPI_DOC[t].lista, id) : null;
      const cls = t === tipo ? 'attivo' : (doc ? 'fatto' : 'mancante');
      const cont = doc ? (t === tipo ? `<strong>${esc(doc.numero)}</strong>` : linkDoc(t, doc.id, doc.numero)) : '<em>non ancora emesso</em>';
      return `${i ? '<span class="freccia">→</span>' : ''}<div class="passo ${cls}"><small>${et}</small>${cont}${doc ? `<span class="muted">${fmtData(doc.data)}</span>` : ''}</div>`;
    }).join('');
    return `<div class="catena"><div class="catena-tit">Catena documentale</div><div class="catena-passi">${html}</div></div>`;
  }

  function mostraDocumento(tipo, id) {
    const T = TIPI_DOC[tipo];
    const d = T && trova(T.lista, id);
    if (!d) { toast('Documento non trovato.', 'errore'); return; }
    F = null;
    const ctr = T.vendita ? trova('clienti', d.clienteId) : trova('fornitori', d.fornitoreId);
    const az = DB.azienda;
    const righe = d.righe.map(r => {
      const p = trova('prodotti', r.prodottoId) || { codice: '?', descrizione: 'Prodotto eliminato', um: '' };
      const base = `<td>${esc(p.codice)}</td><td>${esc(p.descrizione)}</td><td class="num">${fmtNum(r.qta)}</td><td>${esc(p.um)}</td>`;
      return '<tr>' + base + (T.prezzi ? `<td class="num">${fmtEuro(r.prezzo)}</td><td class="num">${r.sconto ? fmtNum(r.sconto) + '%' : ''}</td><td class="num">${fmtEuro(importoRiga(r))}</td><td class="num">${r.iva}%</td>` : '') + '</tr>';
    }).join('');
    const intest = T.prezzi
      ? '<th>Codice</th><th>Descrizione</th><th class="num">Q.tà</th><th>UM</th><th class="num">Prezzo</th><th class="num">Sconto</th><th class="num">Importo</th><th class="num">IVA</th>'
      : '<th>Codice</th><th>Descrizione</th><th class="num">Q.tà</th><th>UM</th>';
    let totali = '';
    if (T.prezzi) {
      const t = calcolaTotali(d.righe);
      totali = `<div class="doc-totali">${t.aliquote.map(a => `<div><span>Imponibile al ${a.aliquota}%</span><span>${fmtEuro(a.imponibile)}</span></div><div><span>IVA ${a.aliquota}%</span><span>${fmtEuro(a.imposta)}</span></div>`).join('')}
        <div class="tot"><span>Totale documento</span><span>${fmtEuro(t.totale)}</span></div></div>`;
    }
    const meta = [];
    if (tipo === 'ov' || tipo === 'oa') meta.push(['Stato', badge(d.stato)]);
    if (tipo === 'ddt' || tipo === 'rm') meta.push(['Stato', badge(d.stato)]);
    if (tipo === 'ddt') meta.push(['Causale del trasporto', 'Vendita'], ['Trasporto a cura di', 'Mittente']);
    if (tipo === 'rm' && d.rifFornitore) meta.push(['Documento del fornitore', esc(d.rifFornitore)]);
    if (tipo === 'fv' || tipo === 'fa') {
      if (tipo === 'fa' && d.numeroFornitore) meta.push(['N. fattura del fornitore', esc(d.numeroFornitore)]);
      meta.push(['Pagamento', tipo === 'fv' ? 'Bonifico a 30 giorni data fattura' : 'Bonifico a 60 giorni data fattura'], ['Scadenza', fmtData(d.scadenza)], ['Stato', badgePagamento(d, tipo === 'fa')]);
    }
    if (d.note) meta.push(['Note', esc(d.note)]);

    const intestatario = T.vendita
      ? `<div class="doc-az"><strong>${esc(az.ragioneSociale)}</strong><br>${esc(az.indirizzo)}<br>${esc(az.citta)}<br>P.IVA ${esc(az.piva)}</div>`
      : `<div class="doc-az"><small>Emesso da</small><strong>${esc(ctr ? ctr.ragioneSociale : '—')}</strong><br>${esc(ctr ? ctr.citta : '')}<br>P.IVA ${esc(ctr ? ctr.piva : '')}</div>`;
    const destinatario = T.vendita
      ? `<div class="doc-dest"><small>Cliente</small><strong>${esc(ctr ? ctr.ragioneSociale : '—')}</strong><br>${esc(ctr ? ctr.citta + (ctr.provincia ? ' (' + ctr.provincia + ')' : '') : '')}<br>P.IVA ${esc(ctr ? ctr.piva : '')}</div>`
      : `<div class="doc-dest"><small>${tipo === 'oa' ? 'Ordinato da' : 'Ricevuto da'}</small><strong>${esc(az.ragioneSociale)}</strong><br>${esc(az.indirizzo)}<br>${esc(az.citta)}</div>`;
    const nota = tipo === 'oa' ? '<p class="nota">L\'ordine è emesso da noi verso il fornitore: in alto ci sono i dati del fornitore che riceve l\'ordine.</p>' : '';

    const corpo = `<div class="doc">
        <div class="doc-head">${intestatario}<div class="doc-tit"><h3>${esc(T.titolo)}</h3><div>N. <strong>${esc(d.numero)}</strong></div><div>Data ${fmtData(d.data)}</div></div></div>
        ${destinatario}
        ${meta.length ? `<dl class="doc-meta">${meta.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}
        <div class="table-wrap"><table class="doc-righe"><thead><tr>${intest}</tr></thead><tbody>${righe}</tbody></table></div>
        ${totali}${nota}
      </div>${catenaDocumentale(tipo, d)}`;

    let azioni = '';
    if (tipo === 'ov' && d.stato === 'aperto') azioni = btn('Modifica', 'nuovo-ordine', { tipo: 'vendita', id: d.id }, 'sec') + btn('Crea DDT', 'crea-ddt', { id: d.id }, 'prim');
    if (tipo === 'ddt' && d.stato === 'da fatturare') azioni = btn('Crea fattura', 'crea-fattura', { id: d.id }, 'prim');
    if (tipo === 'oa' && d.stato === 'aperto') azioni = btn('Modifica', 'nuovo-ordine', { tipo: 'acquisto', id: d.id }, 'sec') + btn('Registra ricevimento', 'ricevimento', { id: d.id }, 'prim');
    if (tipo === 'rm' && d.stato === 'da registrare') azioni = btn('Registra fattura', 'fattura-acquisto', { id: d.id }, 'prim');
    if (tipo === 'fv' || tipo === 'fa') azioni = btn(d.pagata ? 'Annulla pagamento' : (tipo === 'fv' ? 'Registra incasso' : 'Registra pagamento'), 'pagamento', { tipo, id: d.id }, d.pagata ? 'sec' : 'prim');

    apriModal(`${T.titolo} ${d.numero}`, corpo, btn('🖨 Stampa', 'stampa', {}, 'sec') + btn('Chiudi', 'close-modal', {}, 'sec') + azioni, 'largo doc-modal');
  }

  /* =================================================================
     AZIONI CON RICHIESTA DI DATI (date, numeri...)
     ================================================================= */
  let callbackDati = null;

  function chiediDati(titolo, campi, onOk, testoOk = 'Conferma', intro = '', clsOk = 'prim', taglia = 'piccolo') {
    callbackDati = onOk;
    apriModal(titolo, `${intro ? `<div class="intro">${intro}</div>` : ''}${campi.length ? `<form id="formDati" class="form-grid">${campi.map(c => campoHtml(c, c.v)).join('')}</form>` : ''}<div id="erroreDati" class="errore hidden"></div>`,
      btn('Annulla', 'close-modal', {}, 'sec') + btn(testoOk, 'conferma-dati', {}, clsOk), taglia);
  }

  function confermaDati() {
    const form = $('#formDati');
    const vals = {};
    if (form) {
      for (const el of form.elements) {
        if (!el.name) continue;
        if (el.required && !String(el.value).trim()) return mostraErrore('#erroreDati', 'Compila tutti i campi obbligatori.');
        vals[el.name] = String(el.value).trim();
      }
    }
    const errore = callbackDati ? callbackDati(vals) : null;
    if (errore) mostraErrore('#erroreDati', errore);
  }

  const dataMinima = d => (oggi() < d ? d : oggi());

  function azioneCreaDdt(id) {
    const o = trova('ordiniVendita', id);
    chiediDati(`Crea il DDT per l'ordine ${o.numero}`, [{ k: 'data', t: 'Data del DDT', type: 'date', req: 1, v: dataMinima(o.data) }], v => {
      const r = creaDdtDaOrdine(id, v.data);
      if (!r.ok) return r.errore;
      aggiorna();
      mostraDocumento('ddt', r.doc.id);
      toast(`${r.doc.numero} creato: la merce è stata scaricata dal magazzino.`);
    }, 'Crea DDT', `Cliente: <strong>${esc(nomeCliente(o.clienteId))}</strong>. Il DDT scaricherà dal magazzino le quantità dell'ordine.`);
  }

  function azioneCreaFattura(id) {
    const d = trova('ddtVendita', id);
    const t = calcolaTotali(d.righe);
    chiediDati(`Fattura il DDT ${d.numero}`, [{ k: 'data', t: 'Data della fattura', type: 'date', req: 1, v: dataMinima(d.data) }], v => {
      const r = creaFatturaDaDdt(id, v.data);
      if (!r.ok) return r.errore;
      aggiorna();
      mostraDocumento('fv', r.doc.id);
      toast(`Fattura ${r.doc.numero} emessa: il credito verso il cliente compare nel cruscotto.`);
    }, 'Emetti fattura', `Cliente: <strong>${esc(nomeCliente(d.clienteId))}</strong>. Totale da fatturare: <strong>${fmtEuro(t.totale)}</strong> IVA inclusa.`);
  }

  function azioneRicevimento(id) {
    const o = trova('ordiniAcquisto', id);
    chiediDati(`Registra il ricevimento dell'ordine ${o.numero}`, [
      { k: 'data', t: 'Data di arrivo', type: 'date', req: 1, v: dataMinima(o.data) },
      { k: 'rif', t: 'N. DDT del fornitore', v: 'DDT n. ' }
    ], v => {
      const r = registraRicevimento(id, v.data, v.rif);
      if (!r.ok) return r.errore;
      aggiorna();
      mostraDocumento('rm', r.doc.id);
      toast(`Ricevimento ${r.doc.numero} registrato: la merce è stata caricata in magazzino.`);
    }, 'Registra', `Fornitore: <strong>${esc(nomeFornitore(o.fornitoreId))}</strong>. Si presume che la merce arrivata corrisponda all'ordine.`);
  }

  function azioneFatturaAcquisto(id) {
    const ric = trova('ricevimenti', id);
    const t = calcolaTotali(ric.righe);
    chiediDati(`Registra la fattura per il ricevimento ${ric.numero}`, [
      { k: 'data', t: 'Data della fattura', type: 'date', req: 1, v: dataMinima(ric.data) },
      { k: 'numero', t: 'N. fattura del fornitore', req: 1, v: '' }
    ], v => {
      const r = registraFatturaAcquisto(id, v.data, v.numero);
      if (!r.ok) return r.errore;
      aggiorna();
      mostraDocumento('fa', r.doc.id);
      toast(`Fattura registrata con protocollo ${r.doc.numero}: il debito verso il fornitore compare nel cruscotto.`);
    }, 'Registra', `Fornitore: <strong>${esc(nomeFornitore(ric.fornitoreId))}</strong>. Totale atteso: <strong>${fmtEuro(t.totale)}</strong> IVA inclusa.`);
  }

  function azionePagamento(tipo, id) {
    const lista = tipo === 'fv' ? 'fattureVendita' : 'fattureAcquisto';
    const f = trova(lista, id);
    const passiva = tipo === 'fa';
    const daDoc = !$('#modal').classList.contains('hidden') && $('#modal').classList.contains('doc-modal');
    if (f.pagata) {
      chiediDati('Annulla il pagamento', [], () => {
        registraPagamento(lista, id, false);
        aggiorna();
        if (daDoc) mostraDocumento(tipo, id); else chiudiModal();
        toast('Pagamento annullato.');
      }, 'Annulla pagamento', `La fattura <strong>${esc(f.numero)}</strong> tornerà ${passiva ? 'da pagare' : 'da incassare'}.`, 'peric');
    } else {
      chiediDati(passiva ? 'Registra il pagamento' : 'Registra l\'incasso', [{ k: 'data', t: passiva ? 'Data del pagamento' : 'Data dell\'incasso', type: 'date', req: 1, v: dataMinima(f.data) }], v => {
        const r = registraPagamento(lista, id, true, v.data);
        if (!r.ok) return r.errore;
        aggiorna();
        if (daDoc) mostraDocumento(tipo, id); else chiudiModal();
        toast(passiva ? 'Pagamento registrato: il debito è chiuso.' : 'Incasso registrato: il credito è chiuso.');
      }, 'Registra', `Fattura <strong>${esc(f.numero)}</strong> di <strong>${fmtEuro(f.totale)}</strong>.`);
    }
  }

  function tabellaProposte(proposte) {
    return `<div class="table-wrap"><table><thead><tr><th>Prodotto</th><th>Fornitore</th><th class="num">Disp. + in arrivo</th><th class="num">Scorta min.</th><th class="num">Da ordinare</th></tr></thead><tbody>
      ${proposte.map(x => `<tr><td>${esc(x.p.codice + ' – ' + x.p.descrizione)}</td><td>${esc(nomeFornitore(x.p.fornitoreId))}</td><td class="num">${fmtNum(x.proiezione)}</td><td class="num">${fmtNum(x.p.scortaMinima)}</td><td class="num"><strong>${fmtNum(x.qtaProposta)}</strong></td></tr>`).join('')}
      </tbody></table></div><p class="nota">Quantità proposta = 3 × scorta minima − (disponibile + in arrivo). Verrà creato un ordine per ogni fornitore.</p>`;
  }

  function azioneRiordino(proposte) {
    if (!proposte.length) { toast('Nessun prodotto da riordinare: tutte le scorte sono sufficienti.'); return; }
    const senzaForn = proposte.filter(x => !x.p.fornitoreId);
    const valide = proposte.filter(x => x.p.fornitoreId);
    if (!valide.length) { toast('I prodotti da riordinare non hanno un fornitore abituale: impostalo in Anagrafiche → Prodotti.', 'avviso'); return; }
    chiediDati('Proposte di riordino', [{ k: 'data', t: 'Data degli ordini', type: 'date', req: 1, v: oggi() }], v => {
      const creati = generaOrdiniRiordino(v.data, valide);
      aggiorna();
      chiudiModal();
      toast(`${creati.length} ordin${creati.length === 1 ? 'e creato' : 'i creati'}: ${creati.map(o => o.numero).join(', ')}.`);
      location.hash = '#/acquisti/ordini';
    }, 'Crea ordini', tabellaProposte(valide) + (senzaForn.length ? `<p class="rosso-t">${senzaForn.length} prodotti senza fornitore abituale sono esclusi.</p>` : ''), 'prim', 'largo');
  }

  function azioneRettifica(id) {
    const p = trova('prodotti', id);
    chiediDati(`Rettifica inventariale – ${p.descrizione}`, [
      { k: 'qta', t: 'Quantità contata', type: 'number', min: 0, step: '1', req: 1, v: giacenza(p.id) },
      { k: 'data', t: 'Data', type: 'date', req: 1, v: oggi() },
      { k: 'nota', t: 'Motivo', largo: 1, v: 'Differenza da inventario fisico' }
    ], v => {
      const r = rettificaInventario(p.id, v.qta, v.data, v.nota);
      if (!r.ok) return r.errore;
      aggiorna();
      chiudiModal();
      toast(`Rettifica registrata: ${r.diff > 0 ? '+' : ''}${r.diff} ${p.um}.`);
    }, 'Registra rettifica', `Giacenza registrata: <strong>${fmtNum(giacenza(p.id))} ${esc(p.um)}</strong>. Inserisci la quantità effettivamente contata in magazzino.`);
  }

  /* =================================================================
     MODALE, NOTIFICHE, RENDER
     ================================================================= */
  function apriModal(titolo, corpo, piede, taglia = '') {
    $('#modalTitle').textContent = titolo;
    $('#modalBody').innerHTML = corpo;
    $('#modalFoot').innerHTML = piede;
    const m = $('#modal');
    m.className = 'modal ' + taglia;
    $('#modalBody').scrollTop = 0;
    document.body.classList.add('modal-aperta');
    const primo = m.querySelector('.modal-body input:not([type=hidden]):not([type=search]), .modal-body select');
    if (primo && !taglia.includes('doc-modal')) setTimeout(() => primo.focus(), 30);
  }
  function chiudiModal() {
    $('#modal').className = 'modal hidden';
    document.body.classList.remove('modal-aperta');
    F = null;
    callbackDati = null;
  }
  function mostraErrore(sel, testo) {
    const el = $(sel);
    if (!el) { toast(testo, 'errore'); return; }
    el.textContent = testo;
    el.classList.remove('hidden');
  }
  function toast(msg, tipo = 'ok') {
    const el = document.createElement('div');
    el.className = 'toast ' + tipo;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('via'), 4200);
    setTimeout(() => el.remove(), 4700);
  }

  let avvisoMostrato = false;
  function aggiorna() {
    if (!salvaDati() && !avvisoMostrato) {
      avvisoMostrato = true;
      toast('Il browser non permette di salvare i dati: le modifiche andranno perse chiudendo la pagina.', 'avviso');
    }
    render(false);
  }

  const VISTE = {
    'cruscotto': vistaCruscotto,
    'clienti': () => vistaAnagrafica('clienti'),
    'fornitori': () => vistaAnagrafica('fornitori'),
    'prodotti': () => vistaAnagrafica('prodotti'),
    'vendite/ordini': vistaOrdiniVendita,
    'vendite/ddt': vistaDdtVendita,
    'vendite/fatture': () => vistaFatture(false),
    'acquisti/ordini': vistaOrdiniAcquisto,
    'acquisti/ricevimenti': vistaRicevimenti,
    'acquisti/fatture': () => vistaFatture(true),
    'magazzino/giacenze': vistaGiacenze,
    'magazzino/movimenti': vistaMovimenti,
    'guida': vistaGuida,
    'impostazioni': vistaImpostazioni
  };

  function rottaCorrente() {
    const r = location.hash.replace(/^#\/?/, '');
    return VISTE[r] ? r : 'cruscotto';
  }

  function render(scorri = true) {
    const rotta = rottaCorrente();
    contatoreTabelle = 0;
    $('#main').innerHTML = VISTE[rotta]();
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('attivo', a.dataset.rotta === rotta));
    const gruppo = NAV.find(g => g.v.some(v => v.h === rotta));
    const voce = gruppo && gruppo.v.find(v => v.h === rotta);
    $('#crumb').innerHTML = gruppo ? `<span>${esc(gruppo.g)}</span> › <strong>${esc(voce.t)}</strong>` : '';
    $('#aziendaNome').textContent = DB.azienda.ragioneSociale;
    document.title = (voce ? voce.t + ' – ' : '') + 'VerdeLago ERP';
    if (scorri) window.scrollTo(0, 0);
  }

  function costruisciNav() {
    $('#nav').innerHTML = NAV.map(g => `<div class="nav-gruppo">${esc(g.g)}</div>` +
      g.v.map(v => `<a href="#/${v.h}" data-rotta="${v.h}"><span class="ico" aria-hidden="true">${v.i}</span>${esc(v.t)}</a>`).join('')).join('');
  }

  function filtraTabella(input) {
    const q = input.value.trim().toLowerCase();
    const tab = document.getElementById(input.dataset.tabella);
    if (!tab) return;
    tab.querySelectorAll('tbody tr').forEach(tr => {
      if (tr.querySelector('.vuoto')) return;
      tr.hidden = q && !tr.textContent.toLowerCase().includes(q);
    });
  }

  /* =================================================================
     GESTIONE DEGLI EVENTI
     ================================================================= */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) {
      if (e.target.closest('#nav a')) document.body.classList.remove('menu-aperto');
      return;
    }
    e.preventDefault();
    const d = el.dataset, id = d.id;
    switch (d.action) {
      case 'menu': document.body.classList.toggle('menu-aperto'); break;
      case 'close-modal': chiudiModal(); break;
      case 'stampa': window.print(); break;
      case 'doc': mostraDocumento(d.tipo, id); break;

      case 'nuova-anagrafica': apriFormAnagrafica(d.tipo); break;
      case 'modifica-anagrafica': apriFormAnagrafica(d.tipo, id); break;
      case 'salva-anagrafica': salvaAnagrafica(d.tipo, id); break;
      case 'elimina-anagrafica': {
        const motivo = motivoNonEliminabile(d.tipo, id);
        if (motivo) { toast(motivo, 'avviso'); break; }
        const rec = trova(d.tipo, id);
        chiediDati('Conferma eliminazione', [], () => {
          DB[d.tipo] = DB[d.tipo].filter(x => x.id !== rec.id);
          aggiorna(); chiudiModal(); toast('Elemento eliminato.');
        }, 'Elimina', `Vuoi eliminare <strong>${esc(rec.codice)} – ${esc(rec.ragioneSociale || rec.descrizione)}</strong>?`, 'peric');
        break;
      }

      case 'nuovo-ordine': apriFormOrdine(d.tipo, id); break;
      case 'aggiungi-riga': if (F) { F.righe.push({ prodottoId: '', qta: 1, prezzo: 0, sconto: 0 }); disegnaRighe(); } break;
      case 'rimuovi-riga': if (F) { F.righe.splice(Number(d.i), 1); disegnaRighe(); } break;
      case 'salva-ordine': salvaOrdine(); break;
      case 'elimina-ordine': {
        const vend = d.tipo === 'vendita';
        const o = trova(vend ? 'ordiniVendita' : 'ordiniAcquisto', id);
        chiediDati('Conferma eliminazione', [], () => {
          const r = vend ? eliminaOrdineVendita(id) : eliminaOrdineAcquisto(id);
          if (!r.ok) return r.errore;
          aggiorna(); chiudiModal(); toast(`Ordine ${o.numero} eliminato.`);
        }, 'Elimina', `Vuoi eliminare l'ordine <strong>${esc(o.numero)}</strong>?`, 'peric');
        break;
      }

      case 'crea-ddt': azioneCreaDdt(id); break;
      case 'crea-fattura': azioneCreaFattura(id); break;
      case 'ricevimento': azioneRicevimento(id); break;
      case 'fattura-acquisto': azioneFatturaAcquisto(id); break;
      case 'pagamento': azionePagamento(d.tipo, id); break;
      case 'conferma-dati': confermaDati(); break;

      case 'riordina-tutto': azioneRiordino(proposteRiordino()); break;
      case 'riordina': azioneRiordino(proposteRiordino().filter(x => x.p.id === Number(id))); break;
      case 'rettifica': azioneRettifica(id); break;
      case 'scheda': filtroProdotto = String(id); location.hash = '#/magazzino/movimenti'; break;

      case 'salva-azienda': salvaAzienda(); break;
      case 'esporta': esportaDati(); break;
      case 'importa': $('#fileImport').click(); break;
      case 'reset-demo':
        chiediDati('Ripristina i dati demo', [], () => { creaDatiDemo(); aggiorna(); chiudiModal(); toast('Dati demo ripristinati.'); },
          'Ripristina', 'Tutte le modifiche fatte finora verranno perse. Se vuoi conservarle, esporta prima i dati.', 'peric');
        break;
      case 'svuota':
        chiediDati('Svuota tutti i dati', [], () => { DB = nuovoDatabaseVuoto(); aggiorna(); chiudiModal(); toast('Database svuotato: puoi costruire la tua azienda da zero.'); },
          'Svuota', 'Verranno cancellati clienti, fornitori, prodotti e tutti i documenti. Se vuoi conservarli, esporta prima i dati.', 'peric');
        break;
    }
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.matches('.cerca')) filtraTabella(t);
    else if (t.matches('#righeOrdine input[data-campo]')) aggiornaCampoRiga(t);
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('#righeOrdine select[data-campo]')) aggiornaCampoRiga(t);
    else if (t.dataset.change === 'periodo') { periodo = t.value; render(false); }
    else if (t.dataset.change === 'filtro-movimenti') { filtroProdotto = t.value; render(false); }
    else if (t.id === 'fileImport') importaFile(t);
  });

  document.addEventListener('submit', e => e.preventDefault());
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) chiudiModal();
  });
  $('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') chiudiModal(); });
  window.addEventListener('hashchange', () => render(true));

  /* ---------------- Avvio ---------------- */
  caricaDati();
  costruisciNav();
  render();
})();
