/* =====================================================================
   VerdeLago ERP – logica di gestione dei dati
   ---------------------------------------------------------------------
   Qui ci sono tutte le operazioni aziendali: ordini, DDT, fatture,
   ricevimenti e movimenti di magazzino. L'interfaccia (app.js) le
   richiama e i dati demo (demo-data.js) le usano per costruire la
   "storia" dell'azienda simulata.
   I dati vengono salvati nel browser (localStorage): ogni studente
   lavora sulla propria copia.
   ===================================================================== */
'use strict';

const STORAGE_KEY = 'verdelago-erp-v1';
let DB = null;

const CATEGORIE = ['Imballaggi compostabili', 'Risparmio idrico', 'Illuminazione LED', 'Energia', 'Riuso e riciclo', 'Mobilità sostenibile'];
const UNITA_MISURA = ['pz', 'conf', 'set'];
const ALIQUOTE_IVA = [22, 10, 4];
const LISTE = ['clienti', 'fornitori', 'prodotti', 'ordiniVendita', 'ddtVendita', 'fattureVendita',
  'ordiniAcquisto', 'ricevimenti', 'fattureAcquisto', 'movimenti'];

function nuovoDatabaseVuoto() {
  const db = {
    versione: 1,
    azienda: { ragioneSociale: 'La mia azienda S.r.l.', attivita: '', piva: '', indirizzo: '', citta: '', email: '' },
    ultimoId: 0,
    numeratori: {}
  };
  for (const l of LISTE) db[l] = [];
  return db;
}

/* ---------- Salvataggio nel browser ---------- */
function caricaDati() {
  let testo = null;
  try { testo = localStorage.getItem(STORAGE_KEY); } catch (e) { /* storage non disponibile */ }
  if (testo) {
    try {
      const d = JSON.parse(testo);
      if (databaseValido(d)) { DB = d; return; }
    } catch (e) { /* dati corrotti: si riparte dai dati demo */ }
  }
  creaDatiDemo();
  salvaDati();
}

function salvaDati() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(DB)); return true; } catch (e) { return false; }
}

function databaseValido(d) {
  return !!d && d.versione === 1 && typeof d.azienda === 'object' && LISTE.every(k => Array.isArray(d[k]));
}

/* ---------- Utilità ---------- */
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

function oggi() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function addGiorni(data, n) {
  const [y, m, g] = data.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, g + n)).toISOString().slice(0, 10);
}
function fmtData(s) {
  if (!s) return '';
  const [y, m, g] = s.split('-');
  return `${g}/${m}/${y}`;
}
const _euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const fmtEuro = n => _euro.format(Number(n) || 0);
const fmtNum = (n, dec = 0) => (Number(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec });

function nuovoId() { DB.ultimoId += 1; return DB.ultimoId; }

/* Numerazione progressiva per tipo di documento e anno, es. "OV 2026/0012" */
function nuovoNumero(tipo, data) {
  const anno = data.slice(0, 4);
  const k = tipo + '-' + anno;
  DB.numeratori[k] = (DB.numeratori[k] || 0) + 1;
  return `${tipo} ${anno}/${String(DB.numeratori[k]).padStart(4, '0')}`;
}

function trova(lista, id) {
  const n = Number(id);
  return DB[lista].find(x => x.id === n) || null;
}

function esito(errore) { return { ok: false, errore }; }

/* ---------- Calcoli su righe e totali ---------- */
function importoRiga(r) { return r2(r.qta * r.prezzo * (1 - (r.sconto || 0) / 100)); }

function calcolaTotali(righe) {
  const perAliquota = {};
  for (const r of righe) {
    const p = trova('prodotti', r.prodottoId);
    const al = r.iva != null ? r.iva : (p ? p.iva : 22);
    perAliquota[al] = r2((perAliquota[al] || 0) + importoRiga(r));
  }
  const aliquote = Object.keys(perAliquota).map(Number).sort((a, b) => b - a)
    .map(a => ({ aliquota: a, imponibile: perAliquota[a], imposta: r2(perAliquota[a] * a / 100) }));
  const imponibile = r2(aliquote.reduce((s, x) => s + x.imponibile, 0));
  const iva = r2(aliquote.reduce((s, x) => s + x.imposta, 0));
  return { aliquote, imponibile, iva, totale: r2(imponibile + iva) };
}

function normalizzaRighe(righe) {
  const out = [];
  for (const r of righe || []) {
    const p = trova('prodotti', r.prodottoId);
    const qta = Number(r.qta);
    if (!p || !(qta > 0)) continue;
    out.push({
      prodottoId: p.id,
      qta,
      prezzo: r2(Math.max(0, Number(r.prezzo) || 0)),
      sconto: Math.min(100, Math.max(0, Number(r.sconto) || 0)),
      iva: p.iva
    });
  }
  return out;
}

function qtaPerProdotto(righe) {
  const m = new Map();
  for (const r of righe) m.set(r.prodottoId, (m.get(r.prodottoId) || 0) + r.qta);
  return m;
}

/* ---------- Magazzino ---------- */
/* Giacenza: merce fisicamente presente (somma dei movimenti) */
function giacenza(prodottoId) {
  let g = 0;
  for (const m of DB.movimenti) if (m.prodottoId === prodottoId) g += m.qta;
  return g;
}
/* Impegnato: merce ordinata dai clienti ma non ancora consegnata */
function impegnato(prodottoId) {
  let q = 0;
  for (const o of DB.ordiniVendita) if (o.stato === 'aperto')
    for (const r of o.righe) if (r.prodottoId === prodottoId) q += r.qta;
  return q;
}
/* In arrivo: merce ordinata ai fornitori e non ancora ricevuta */
function inArrivo(prodottoId) {
  let q = 0;
  for (const o of DB.ordiniAcquisto) if (o.stato === 'aperto')
    for (const r of o.righe) if (r.prodottoId === prodottoId) q += r.qta;
  return q;
}
function disponibile(prodottoId) { return giacenza(prodottoId) - impegnato(prodottoId); }

function aggiungiMovimento(data, prodottoId, qta, tipo, causale, documento) {
  DB.movimenti.push({ id: nuovoId(), data, prodottoId, qta, tipo, causale, documento });
}

function rettificaInventario(prodottoId, nuovaGiacenza, data, nota) {
  const p = trova('prodotti', prodottoId);
  if (!p) return esito('Prodotto non trovato.');
  const nuova = Number(nuovaGiacenza);
  if (!(nuova >= 0) || !Number.isInteger(nuova)) return esito('Inserisci una quantità intera maggiore o uguale a zero.');
  const diff = nuova - giacenza(p.id);
  if (diff === 0) return esito('La giacenza contata coincide con quella registrata: nessuna rettifica necessaria.');
  aggiungiMovimento(data || oggi(), p.id, diff, 'Rettifica', nota || 'Rettifica inventariale', 'Inventario');
  return { ok: true, diff };
}

/* Proposte di riordino: prodotti per cui (disponibile + in arrivo) ≤ scorta minima */
function proposteRiordino() {
  const out = [];
  for (const p of DB.prodotti) {
    const g = giacenza(p.id), ia = inArrivo(p.id), imp = impegnato(p.id);
    const proiezione = g - imp + ia;
    if (proiezione <= p.scortaMinima) {
      out.push({ p, giacenza: g, impegnato: imp, inArrivo: ia, proiezione, qtaProposta: Math.max(1, p.scortaMinima * 3 - proiezione) });
    }
  }
  return out;
}

function generaOrdiniRiordino(data, proposte) {
  const perFornitore = new Map();
  for (const x of proposte) {
    if (!x.p.fornitoreId) continue;
    if (!perFornitore.has(x.p.fornitoreId)) perFornitore.set(x.p.fornitoreId, []);
    perFornitore.get(x.p.fornitoreId).push({ prodottoId: x.p.id, qta: x.qtaProposta, prezzo: x.p.costoAcquisto });
  }
  const creati = [];
  for (const [fornitoreId, righe] of perFornitore) {
    const r = creaOrdineAcquisto({ data, fornitoreId, righe, note: 'Generato da proposta di riordino' });
    if (r.ok) creati.push(r.doc);
  }
  return creati;
}

/* ---------- Ciclo attivo (vendite) ---------- */
function creaOrdineVendita(dati) {
  const cliente = trova('clienti', dati.clienteId);
  if (!cliente) return esito('Seleziona un cliente.');
  const righe = normalizzaRighe(dati.righe);
  if (!righe.length) return esito('Inserisci almeno una riga con prodotto e quantità.');
  const data = dati.data || oggi();
  const doc = {
    id: nuovoId(), numero: nuovoNumero('OV', data), data, clienteId: cliente.id,
    righe, note: dati.note || '', stato: 'aperto', ddtId: null, fatturaId: null
  };
  DB.ordiniVendita.push(doc);
  return { ok: true, doc };
}

function modificaOrdineVendita(id, dati) {
  const o = trova('ordiniVendita', id);
  if (!o || o.stato !== 'aperto') return esito('Si possono modificare solo gli ordini ancora aperti.');
  const cliente = trova('clienti', dati.clienteId);
  if (!cliente) return esito('Seleziona un cliente.');
  const righe = normalizzaRighe(dati.righe);
  if (!righe.length) return esito('Inserisci almeno una riga con prodotto e quantità.');
  Object.assign(o, { data: dati.data || o.data, clienteId: cliente.id, righe, note: dati.note || '' });
  return { ok: true, doc: o };
}

function eliminaOrdineVendita(id) {
  const i = DB.ordiniVendita.findIndex(x => x.id === Number(id));
  if (i < 0) return esito('Ordine non trovato.');
  if (DB.ordiniVendita[i].stato !== 'aperto') return esito('Un ordine già evaso non si può eliminare: esistono documenti collegati.');
  DB.ordiniVendita.splice(i, 1);
  return { ok: true };
}

/* Il DDT scarica la merce dal magazzino */
function creaDdtDaOrdine(ordineId, data) {
  const o = trova('ordiniVendita', ordineId);
  if (!o) return esito('Ordine non trovato.');
  if (o.stato !== 'aperto') return esito('Questo ordine è già stato evaso.');
  data = data || oggi();
  if (data < o.data) return esito("La data del DDT non può essere precedente alla data dell'ordine.");
  const mancanti = [];
  for (const [pid, q] of qtaPerProdotto(o.righe)) {
    const g = giacenza(pid);
    if (g < q) {
      const p = trova('prodotti', pid);
      mancanti.push(`• ${p.codice} – ${p.descrizione}: servono ${q}, in magazzino ${g}`);
    }
  }
  if (mancanti.length) return esito('Merce insufficiente in magazzino:\n' + mancanti.join('\n') + '\nRiordina dal fornitore e registra il ricevimento prima di evadere.');
  const righe = o.righe.map(r => ({ ...r, costo: trova('prodotti', r.prodottoId).costoAcquisto }));
  const ddt = {
    id: nuovoId(), numero: nuovoNumero('DDT', data), data, ordineId: o.id, clienteId: o.clienteId,
    righe, stato: 'da fatturare', fatturaId: null
  };
  DB.ddtVendita.push(ddt);
  for (const r of righe) aggiungiMovimento(data, r.prodottoId, -r.qta, 'Scarico', 'Vendita a cliente', ddt.numero);
  o.stato = 'evaso';
  o.ddtId = ddt.id;
  return { ok: true, doc: ddt };
}

/* La fattura genera il credito verso il cliente */
function creaFatturaDaDdt(ddtId, data) {
  const ddt = trova('ddtVendita', ddtId);
  if (!ddt) return esito('DDT non trovato.');
  if (ddt.stato !== 'da fatturare') return esito('Questo DDT è già stato fatturato.');
  data = data || oggi();
  if (data < ddt.data) return esito('La data della fattura non può essere precedente alla data del DDT.');
  const t = calcolaTotali(ddt.righe);
  const f = {
    id: nuovoId(), numero: nuovoNumero('FV', data), data, clienteId: ddt.clienteId,
    ordineId: ddt.ordineId, ddtId: ddt.id, righe: ddt.righe.map(r => ({ ...r })),
    imponibile: t.imponibile, iva: t.iva, totale: t.totale,
    scadenza: addGiorni(data, 30), pagata: false, dataPagamento: null
  };
  DB.fattureVendita.push(f);
  ddt.stato = 'fatturato';
  ddt.fatturaId = f.id;
  const o = trova('ordiniVendita', ddt.ordineId);
  if (o) { o.stato = 'fatturato'; o.fatturaId = f.id; }
  return { ok: true, doc: f };
}

/* ---------- Ciclo passivo (acquisti) ---------- */
function creaOrdineAcquisto(dati) {
  const forn = trova('fornitori', dati.fornitoreId);
  if (!forn) return esito('Seleziona un fornitore.');
  const righe = normalizzaRighe(dati.righe).map(r => ({ ...r, sconto: 0 }));
  if (!righe.length) return esito('Inserisci almeno una riga con prodotto e quantità.');
  const data = dati.data || oggi();
  const doc = {
    id: nuovoId(), numero: nuovoNumero('OA', data), data, fornitoreId: forn.id,
    righe, note: dati.note || '', stato: 'aperto', ricevimentoId: null, fatturaId: null
  };
  DB.ordiniAcquisto.push(doc);
  return { ok: true, doc };
}

function modificaOrdineAcquisto(id, dati) {
  const o = trova('ordiniAcquisto', id);
  if (!o || o.stato !== 'aperto') return esito('Si possono modificare solo gli ordini ancora aperti.');
  const forn = trova('fornitori', dati.fornitoreId);
  if (!forn) return esito('Seleziona un fornitore.');
  const righe = normalizzaRighe(dati.righe).map(r => ({ ...r, sconto: 0 }));
  if (!righe.length) return esito('Inserisci almeno una riga con prodotto e quantità.');
  Object.assign(o, { data: dati.data || o.data, fornitoreId: forn.id, righe, note: dati.note || '' });
  return { ok: true, doc: o };
}

function eliminaOrdineAcquisto(id) {
  const i = DB.ordiniAcquisto.findIndex(x => x.id === Number(id));
  if (i < 0) return esito('Ordine non trovato.');
  if (DB.ordiniAcquisto[i].stato !== 'aperto') return esito('Un ordine già ricevuto non si può eliminare: esistono documenti collegati.');
  DB.ordiniAcquisto.splice(i, 1);
  return { ok: true };
}

/* Il ricevimento carica la merce in magazzino */
function registraRicevimento(ordineId, data, rifFornitore) {
  const o = trova('ordiniAcquisto', ordineId);
  if (!o) return esito('Ordine non trovato.');
  if (o.stato !== 'aperto') return esito('La merce di questo ordine è già stata ricevuta.');
  data = data || oggi();
  if (data < o.data) return esito("La data del ricevimento non può essere precedente alla data dell'ordine.");
  const ric = {
    id: nuovoId(), numero: nuovoNumero('RM', data), data, ordineId: o.id, fornitoreId: o.fornitoreId,
    rifFornitore: rifFornitore || '', righe: o.righe.map(r => ({ ...r })), stato: 'da registrare', fatturaId: null
  };
  DB.ricevimenti.push(ric);
  for (const r of ric.righe) aggiungiMovimento(data, r.prodottoId, r.qta, 'Carico', 'Acquisto da fornitore', ric.numero);
  o.stato = 'ricevuto';
  o.ricevimentoId = ric.id;
  return { ok: true, doc: ric };
}

/* La fattura del fornitore genera il debito */
function registraFatturaAcquisto(ricevimentoId, data, numeroFornitore) {
  const ric = trova('ricevimenti', ricevimentoId);
  if (!ric) return esito('Ricevimento non trovato.');
  if (ric.stato !== 'da registrare') return esito('La fattura di questo ricevimento è già stata registrata.');
  data = data || oggi();
  if (data < ric.data) return esito('La data della fattura non può essere precedente alla data del ricevimento.');
  const t = calcolaTotali(ric.righe);
  const f = {
    id: nuovoId(), numero: nuovoNumero('FA', data), numeroFornitore: numeroFornitore || '', data,
    fornitoreId: ric.fornitoreId, ordineId: ric.ordineId, ricevimentoId: ric.id,
    righe: ric.righe.map(r => ({ ...r })), imponibile: t.imponibile, iva: t.iva, totale: t.totale,
    scadenza: addGiorni(data, 60), pagata: false, dataPagamento: null
  };
  DB.fattureAcquisto.push(f);
  ric.stato = 'registrato';
  ric.fatturaId = f.id;
  const o = trova('ordiniAcquisto', ric.ordineId);
  if (o) { o.stato = 'fatturato'; o.fatturaId = f.id; }
  return { ok: true, doc: f };
}

/* ---------- Incassi e pagamenti ---------- */
function registraPagamento(lista, id, pagata, data) {
  const f = trova(lista, id);
  if (!f) return esito('Fattura non trovata.');
  if (pagata) {
    data = data || oggi();
    if (data < f.data) return esito('La data di pagamento non può essere precedente alla data della fattura.');
    f.pagata = true; f.dataPagamento = data;
  } else {
    f.pagata = false; f.dataPagamento = null;
  }
  return { ok: true, doc: f };
}
