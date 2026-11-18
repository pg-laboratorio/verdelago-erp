/* =====================================================================
   VerdeLago ERP – dati dell'azienda simulata
   ---------------------------------------------------------------------
   VerdeLago S.r.l. distribuisce prodotti per la sostenibilità
   ambientale ad aziende del territorio (hotel, ristoranti, negozi...).
   Tutti i nomi, le partite IVA e gli indirizzi sono di fantasia.
   I valori di CO₂ evitata sono indicativi e servono solo a scopo didattico.

   La storia (giugno–ottobre 2026) viene generata usando le stesse
   operazioni dell'interfaccia: ordini, DDT, fatture, riordini...
   Il generatore usa un "seme" fisso, quindi i dati demo sono sempre uguali.
   ===================================================================== */
'use strict';

function creaDatiDemo() {
  let seme = 20261028;
  function caso() { // generatore pseudocasuale (mulberry32)
    seme = (seme + 0x6D2B79F5) | 0;
    let t = Math.imul(seme ^ (seme >>> 15), 1 | seme);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const intero = (a, b) => a + Math.floor(caso() * (b - a + 1));
  const scegli = arr => arr[Math.floor(caso() * arr.length)];
  const piva = () => 'IT' + String(Math.floor(caso() * 1e11)).padStart(11, '0');

  DB = nuovoDatabaseVuoto();
  DB.azienda = {
    ragioneSociale: 'VerdeLago S.r.l.',
    attivita: 'Distribuzione di prodotti per la sostenibilità ambientale',
    piva: 'IT04512870981',
    indirizzo: "Via dell'Ambiente 12",
    citta: '25015 Desenzano del Garda (BS)',
    email: 'info@verdelago.example'
  };

  /* ---------- Fornitori ---------- */
  const fornitori = [
    ['F001', 'EcoPack Italia S.r.l.', 'Bologna', 'BO'],
    ['F002', 'AcquaSaggia S.r.l.', 'Torino', 'TO'],
    ['F003', 'LuceVerde S.r.l.', 'Padova', 'PD'],
    ['F004', 'SolarNord S.r.l.', 'Bergamo', 'BG'],
    ['F005', 'Ricicla & Co. S.n.c.', 'Verona', 'VR']
  ];
  const idFornitore = {};
  for (const [codice, ragioneSociale, citta, provincia] of fornitori) {
    const id = nuovoId();
    idFornitore[codice] = id;
    DB.fornitori.push({
      id, codice, ragioneSociale, piva: piva(), citta, provincia,
      email: 'ordini@' + ragioneSociale.toLowerCase().replace(/[^a-z]/g, '').slice(0, 14) + '.example'
    });
  }

  /* ---------- Prodotti ---------- */
  // codice, descrizione, categoria, UM, costo, prezzo, IVA, scorta minima, fornitore, kg CO₂ evitata per unità
  const prodotti = [
    ['P001', 'Piatti compostabili (conf. 100)', 'Imballaggi compostabili', 'conf', 7.80, 15.50, 22, 60, 'F001', 1.2],
    ['P002', 'Bicchieri compostabili 250 ml (conf. 250)', 'Imballaggi compostabili', 'conf', 9.20, 18.90, 22, 50, 'F001', 1.5],
    ['P003', 'Sacchetti compostabili per umido (conf. 50)', 'Imballaggi compostabili', 'conf', 2.10, 4.50, 22, 120, 'F001', 0.3],
    ['P004', 'Shopper in cotone organico', 'Riuso e riciclo', 'pz', 1.20, 3.50, 22, 200, 'F001', 1.0],
    ['P005', 'Riduttore di flusso per rubinetto', 'Risparmio idrico', 'pz', 1.90, 5.90, 22, 100, 'F002', 2.5],
    ['P006', 'Soffione doccia a basso flusso', 'Risparmio idrico', 'pz', 9.50, 24.90, 22, 30, 'F002', 15],
    ['P007', 'Serbatoio raccolta acqua piovana 300 l', 'Risparmio idrico', 'pz', 58.00, 129.00, 22, 5, 'F002', 10],
    ['P008', 'Lampadina LED E27 9 W', 'Illuminazione LED', 'pz', 1.60, 4.90, 22, 150, 'F003', 12],
    ['P009', 'Pannello LED 60×60 36 W', 'Illuminazione LED', 'pz', 18.00, 42.00, 22, 20, 'F003', 40],
    ['P010', 'Presa smart con misura dei consumi', 'Energia', 'pz', 8.50, 19.90, 22, 25, 'F003', 8],
    ['P011', 'Pannello solare portatile 100 W', 'Energia', 'pz', 85.00, 189.00, 22, 8, 'F004', 60],
    ['P012', 'Power bank solare 20.000 mAh', 'Energia', 'pz', 14.00, 32.00, 22, 20, 'F004', 3],
    ['P013', 'Kit luci LED ricaricabili per bici', 'Mobilità sostenibile', 'set', 7.00, 16.90, 22, 25, 'F004', 2],
    ['P014', 'Borraccia termica in acciaio 500 ml', 'Riuso e riciclo', 'pz', 6.50, 14.90, 22, 40, 'F005', 8],
    ['P015', 'Compostiera da giardino 300 l', 'Riuso e riciclo', 'pz', 32.00, 74.90, 22, 6, 'F005', 50],
    ['P016', 'Set 3 contenitori per raccolta differenziata', 'Riuso e riciclo', 'set', 12.00, 27.90, 22, 15, 'F005', 5]
  ];
  for (const [codice, descrizione, categoria, um, costoAcquisto, prezzoVendita, iva, scortaMinima, forn, co2] of prodotti) {
    DB.prodotti.push({
      id: nuovoId(), codice, descrizione, categoria, um, costoAcquisto, prezzoVendita, iva,
      scortaMinima, fornitoreId: idFornitore[forn], co2
    });
  }

  /* ---------- Clienti ---------- */
  const clienti = [
    ['C001', 'Ristorante Il Glicine S.r.l.', 'Desenzano del Garda', 'BS'],
    ['C002', 'Hotel Riva Azzurra S.p.A.', 'Sirmione', 'BS'],
    ['C003', 'Ferramenta Bonfadini S.n.c.', 'Brescia', 'BS'],
    ['C004', 'Agriturismo Le Colline S.r.l.', 'Lonato del Garda', 'BS'],
    ['C005', 'Catering Sapori Verdi S.r.l.', 'Verona', 'VR'],
    ['C006', 'Camping Punta Sole S.r.l.', 'Manerba del Garda', 'BS'],
    ['C007', 'Studio Tecnico Ferrari & Rossi', 'Brescia', 'BS'],
    ['C008', 'Bike Shop Garda Ride S.r.l.', 'Salò', 'BS'],
    ['C009', 'Supermercato Fresco Mio S.r.l.', 'Peschiera del Garda', 'VR'],
    ['C010', 'Centro Sportivo Energia S.r.l.', 'Mantova', 'MN'],
    ['C011', 'GreenOffice Coworking S.r.l.', 'Milano', 'MI'],
    ['C012', 'Circolo Nautico Brezza S.r.l.', 'Padenghe sul Garda', 'BS']
  ];
  for (const [codice, ragioneSociale, citta, provincia] of clienti) {
    DB.clienti.push({
      id: nuovoId(), codice, ragioneSociale, piva: piva(), citta, provincia,
      email: 'amministrazione@' + ragioneSociale.toLowerCase().replace(/[^a-z]/g, '').slice(0, 14) + '.example'
    });
  }

  /* ---------- Giacenze iniziali ---------- */
  for (const p of DB.prodotti) {
    aggiungiMovimento('2026-06-01', p.id, p.scortaMinima * 3, 'Giacenza iniziale', 'Inventario di apertura', 'Inventario');
  }

  /* ---------- Simulazione giorno per giorno ---------- */
  const INIZIO = '2026-06-03', FINE = '2026-10-23';
  const consegne = []; // ordini clienti da evadere: { ordineId, data }
  const arrivi = [];   // ordini fornitori in arrivo: { ordineId, data }

  for (let g = INIZIO; g <= FINE; g = addGiorni(g, 1)) {
    const giornoSett = new Date(g + 'T12:00:00Z').getUTCDay();
    if (giornoSett === 0 || giornoSett === 6) continue;   // sabato e domenica
    if (g >= '2026-08-10' && g <= '2026-08-21') continue;  // chiusura estiva

    // 1. arriva la merce ordinata ai fornitori
    for (const a of arrivi) {
      if (a.fatto || a.data > g) continue;
      const r = registraRicevimento(a.ordineId, g, 'DDT fornitore n. ' + intero(100, 999));
      a.fatto = true;
      if (r.ok && g <= addGiorni(FINE, -4)) registraFatturaAcquisto(r.doc.id, g, 'FT ' + intero(100, 999) + '/2026');
    }

    // 2. si evadono gli ordini clienti in scadenza (DDT) e si fattura
    for (const c of consegne) {
      if (c.fatto || c.data > g) continue;
      const r = creaDdtDaOrdine(c.ordineId, g);
      if (r.ok) {   // se manca merce, l'ordine resta aperto e si riprova il giorno dopo
        c.fatto = true;
        if (g <= addGiorni(FINE, -5)) creaFatturaDaDdt(r.doc.id, g);
      }
    }

    // 3. arrivano nuovi ordini dai clienti (d'estate di più)
    const estate = g < '2026-09-01';
    let n = caso() < (estate ? 0.75 : 0.55) ? 1 : 0;
    if (n && caso() < 0.4) n += 1;
    for (let k = 0; k < n; k++) {
      const cliente = scegli(DB.clienti);
      const usati = new Set();
      const righe = [];
      const nRighe = intero(1, 3);
      for (let j = 0; j < nRighe; j++) {
        const p = scegli(DB.prodotti);
        if (usati.has(p.id)) continue;
        usati.add(p.id);
        const disp = disponibile(p.id);
        if (disp <= 0) continue;
        const qta = Math.min(disp, Math.max(1, Math.round(p.scortaMinima * (0.15 + caso() * 0.35))));
        righe.push({ prodottoId: p.id, qta, prezzo: p.prezzoVendita, sconto: scegli([0, 0, 0, 5, 10]) });
      }
      if (!righe.length) continue;
      const r = creaOrdineVendita({ data: g, clienteId: cliente.id, righe });
      if (r.ok) consegne.push({ ordineId: r.doc.id, data: addGiorni(g, intero(1, 3)) });
    }

    // 4. riordino automatico ai fornitori; si ferma a fine periodo,
    //    così alcuni prodotti restano da riordinare per gli esercizi
    if (g <= addGiorni(FINE, -12)) {
      const proposte = proposteRiordino();
      if (proposte.length) {
        for (const oa of generaOrdiniRiordino(g, proposte)) arrivi.push({ ordineId: oa.id, data: addGiorni(g, intero(3, 6)) });
      }
    }
  }

  /* ---------- Ultimo giorno: tre ordini importanti ancora da evadere ----------
     La merce in magazzino basta per consegnarli, ma impegnano così tanto
     che alcuni prodotti scendono sotto la scorta minima (da riordinare). */
  const ordiniFinali = [
    ['C002', [['P008', 0.9], ['P006', 0.85]]],
    ['C006', [['P014', 0.9], ['P013', 0.5]]],
    ['C009', [['P003', 0.9], ['P001', 0.4]]]
  ];
  for (const [codCliente, righeDef] of ordiniFinali) {
    const cliente = DB.clienti.find(c => c.codice === codCliente);
    const righe = [];
    for (const [codProdotto, quota] of righeDef) {
      const p = DB.prodotti.find(x => x.codice === codProdotto);
      const qta = Math.floor(disponibile(p.id) * quota);
      if (qta > 0) righe.push({ prodottoId: p.id, qta, prezzo: p.prezzoVendita, sconto: 10 });
    }
    if (righe.length) creaOrdineVendita({ data: FINE, clienteId: cliente.id, righe, note: 'Fornitura per la nuova stagione' });
  }

  /* ---------- Incassi e pagamenti ---------- */
  for (const f of DB.fattureVendita) {
    if (f.scadenza <= FINE && caso() < 0.85) {
      let dp = addGiorni(f.scadenza, intero(-10, 5));
      if (dp > FINE) dp = FINE;
      if (dp < f.data) dp = f.data;
      f.pagata = true; f.dataPagamento = dp;
    }
  }
  for (const f of DB.fattureAcquisto) {
    if (f.scadenza <= FINE) { f.pagata = true; f.dataPagamento = f.scadenza; }
  }

  return DB;
}
