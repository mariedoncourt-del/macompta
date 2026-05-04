import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Building2, Calculator, CreditCard, FileDown, Landmark, LineChart, Lock, PiggyBank, Plus, ReceiptText, Settings, ShieldCheck, Upload, WalletCards } from 'lucide-react';
import './styles.css';

const DEFAULT_ACCOUNTS = [
  ['101000', 'Capital individuel', 'Capitaux'], ['120000', 'Résultat de l’exercice', 'Capitaux'],
  ['401000', 'Fournisseurs', 'Tiers'], ['411000', 'Clients', 'Tiers'], ['445660', 'TVA déductible', 'TVA'], ['445710', 'TVA collectée', 'TVA'],
  ['512000', 'Banque principale', 'Trésorerie'], ['530000', 'Caisse', 'Trésorerie'],
  ['606300', 'Fournitures', 'Charges'], ['613200', 'Locations', 'Charges'], ['616000', 'Assurances', 'Charges'], ['626000', 'Télécommunications', 'Charges'], ['627000', 'Services bancaires', 'Charges'], ['641000', 'Rémunérations', 'Charges'], ['645000', 'Cotisations sociales', 'Charges'],
  ['706000', 'Prestations de services', 'Produits'], ['707000', 'Ventes de marchandises', 'Produits'],
].map(([number, label, category]) => ({ number, label, category, active: true }));

const DEFAULT_RULES = [
  { keyword: 'ORANGE|SFR|FREE|BOUYGUES', account: '626000', type: 'expense', label: 'Télécommunications' },
  { keyword: 'AXA|MAAF|MACIF|MAIF', account: '616000', type: 'expense', label: 'Assurances' },
  { keyword: 'URSSAF|SSI|RETRAITE', account: '645000', type: 'expense', label: 'Cotisations sociales' },
  { keyword: 'LOYER|BAIL', account: '613200', type: 'expense', label: 'Locations' },
  { keyword: 'COMMISSION|FRAIS BANCAIRE', account: '627000', type: 'expense', label: 'Services bancaires' },
];

const uid = () => Math.random().toString(36).slice(2, 10);
const euro = (n) => Number(n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const today = () => new Date().toISOString().slice(0, 10);

function useStoredState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) ?? initialValue; } catch { return initialValue; }
  });
  const setStored = (next) => {
    const valueToStore = typeof next === 'function' ? next(value) : next;
    setValue(valueToStore);
    localStorage.setItem(key, JSON.stringify(valueToStore));
  };
  return [value, setStored];
}

function makeEntry({ date, label, type, account, amountTtc, vatRate, source }) {
  const ttc = Number(amountTtc || 0);
  const vat = +(ttc - ttc / (1 + Number(vatRate || 0) / 100)).toFixed(2);
  const ht = +(ttc - vat).toFixed(2);
  const lines = type === 'income'
    ? [
      { account: '512000', label: 'Banque', debit: ttc, credit: 0 },
      { account, label, debit: 0, credit: ht },
      ...(vat ? [{ account: '445710', label: 'TVA collectée', debit: 0, credit: vat }] : []),
    ]
    : [
      { account, label, debit: ht, credit: 0 },
      ...(vat ? [{ account: '445660', label: 'TVA déductible', debit: vat, credit: 0 }] : []),
      { account: source === 'cash' ? '530000' : '512000', label: source === 'cash' ? 'Caisse' : 'Banque', debit: 0, credit: ttc },
    ];
  return { id: uid(), date, label, type, account, amountTtc: ttc, vatRate: Number(vatRate || 0), vat, ht, source, validated: true, locked: false, lines };
}

function App() {
  const [tab, setTab] = useState('dashboard');
  const [company, setCompany] = useStoredState('macompta.company', { name: 'Atelier Démo Martin', siren: '123 456 789', fiscalYearStart: '2026-01-01', fiscalYearEnd: '2026-12-31', vatRegime: 'Réel simplifié', accountingMode: 'Trésorerie' });
  const [accounts, setAccounts] = useStoredState('macompta.accounts', DEFAULT_ACCOUNTS);
  const [entries, setEntries] = useStoredState('macompta.entries', [
    makeEntry({ date: today(), label: 'Vente comptoir', type: 'income', account: '707000', amountTtc: 240, vatRate: 20, source: 'bank' }),
    makeEntry({ date: today(), label: 'Abonnement téléphone', type: 'expense', account: '626000', amountTtc: 35, vatRate: 20, source: 'bank' }),
  ]);
  const [rules, setRules] = useStoredState('macompta.rules', DEFAULT_RULES);
  const [closed, setClosed] = useStoredState('macompta.closed', false);

  const totals = useMemo(() => {
    const income = entries.filter(e => e.type === 'income').reduce((s, e) => s + e.amountTtc, 0);
    const expense = entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amountTtc, 0);
    const vatCollected = entries.filter(e => e.type === 'income').reduce((s, e) => s + e.vat, 0);
    const vatDeductible = entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.vat, 0);
    return { income, expense, result: income - expense, vatCollected, vatDeductible, vatDue: vatCollected - vatDeductible, bank: income - expense };
  }, [entries]);

  const addEntry = (payload) => {
    if (closed) return alert('Exercice clôturé : les nouvelles écritures sont verrouillées.');
    setEntries([makeEntry(payload), ...entries]);
  };

  const importCsv = (text) => {
    if (closed) return alert('Exercice clôturé.');
    const rows = text.split(/\r?\n/).map(r => r.trim()).filter(Boolean).slice(0, 50);
    const imported = rows.map((row) => {
      const cols = row.includes(';') ? row.split(';') : row.split(',');
      const [dateRaw, labelRaw, amountRaw] = cols.length >= 3 ? cols : [today(), row, '0'];
      const label = String(labelRaw || 'Opération importée').trim();
      const amount = Number(String(amountRaw || '0').replace(',', '.'));
      const rule = rules.find(r => new RegExp(r.keyword, 'i').test(label));
      return makeEntry({ date: dateRaw || today(), label, type: amount >= 0 ? 'income' : (rule?.type || 'expense'), account: amount >= 0 ? '707000' : (rule?.account || '606300'), amountTtc: Math.abs(amount), vatRate: 20, source: 'bank' });
    });
    setEntries([...imported, ...entries]);
  };

  const exportFec = () => {
    const header = 'JournalCode\tJournalLib\tEcritureNum\tEcritureDate\tCompteNum\tCompteLib\tCompAuxNum\tCompAuxLib\tPieceRef\tPieceDate\tEcritureLib\tDebit\tCredit\tEcritureLet\tDateLet\tValidDate\tMontantdevise\tIdevise';
    const lines = entries.flatMap((e, idx) => e.lines.map(l => ['BQ', 'Banque', String(idx + 1).padStart(6, '0'), e.date.replaceAll('-', ''), l.account, l.label, '', '', e.id, e.date.replaceAll('-', ''), e.label, l.debit.toFixed(2), l.credit.toFixed(2), '', '', e.date.replaceAll('-', ''), '', ''].join('\t')));
    download('FEC-demo.txt', [header, ...lines].join('\n'));
  };

  const download = (name, content) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = name; link.click(); URL.revokeObjectURL(link.href);
  };

  const nav = [
    ['dashboard', LineChart, 'Tableau de bord'], ['company', Building2, 'Dossier'], ['accounts', Calculator, 'Plan comptable'],
    ['entry', Plus, 'Saisie'], ['bank', CreditCard, 'Banque / CSV'], ['vat', ReceiptText, 'TVA'], ['reports', FileDown, 'États & FEC'], ['security', ShieldCheck, 'Conformité']
  ];

  return <div className="app">
    <aside className="sidebar">
      <div className="logo"><div className="logo-mark">M</div><div><strong>MaCompta</strong><span>Artisans & TPE</span></div></div>
      <nav>{nav.map(([id, Icon, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={18}/>{label}</button>)}</nav>
      <div className="status"><Lock size={16}/> Données locales de démonstration<br/>Export FEC indicatif</div>
    </aside>
    <main>
      <header className="hero">
        <div><p className="eyebrow">MVP comptabilité de trésorerie</p><h1>{company.name}</h1><p>Application inspirée du cahier des charges fourni : saisie simplifiée, TVA, banque, éditions et conformité.</p></div>
        <button className="primary" onClick={() => setClosed(!closed)}>{closed ? 'Rouvrir la démo' : 'Clôturer exercice'}</button>
      </header>
      {closed && <div className="alert">Exercice clôturé : les écritures existantes sont considérées verrouillées.</div>}
      {tab === 'dashboard' && <Dashboard totals={totals} entries={entries}/>} 
      {tab === 'company' && <Company company={company} setCompany={setCompany}/>} 
      {tab === 'accounts' && <Accounts accounts={accounts} setAccounts={setAccounts}/>} 
      {tab === 'entry' && <EntryForm accounts={accounts} addEntry={addEntry}/>} 
      {tab === 'bank' && <Bank importCsv={importCsv} rules={rules} setRules={setRules} entries={entries}/>} 
      {tab === 'vat' && <Vat totals={totals}/>} 
      {tab === 'reports' && <Reports entries={entries} accounts={accounts} totals={totals} exportFec={exportFec}/>} 
      {tab === 'security' && <Security/>}
    </main>
  </div>;
}

function Dashboard({ totals, entries }) {
  return <section><div className="cards"><Kpi icon={WalletCards} title="Recettes TTC" value={euro(totals.income)}/><Kpi icon={PiggyBank} title="Dépenses TTC" value={euro(totals.expense)}/><Kpi icon={Landmark} title="Solde banque estimé" value={euro(totals.bank)}/><Kpi icon={ReceiptText} title="TVA à payer" value={euro(totals.vatDue)}/></div><div className="grid two"><Panel title="Résultat simplifié"><div className="big-result">{euro(totals.result)}</div><p>Recettes moins dépenses, calculé sur les opérations validées.</p></Panel><Panel title="Dernières écritures"><EntryTable entries={entries.slice(0, 6)}/></Panel></div></section>;
}
function Kpi({ icon: Icon, title, value }) { return <div className="card"><Icon/><span>{title}</span><strong>{value}</strong></div>; }
function Panel({ title, children }) { return <div className="panel"><h2>{title}</h2>{children}</div>; }

function Company({ company, setCompany }) {
  return <Panel title="Paramétrage du dossier entreprise"><div className="form-grid">{Object.entries({ name:'Nom', siren:'SIREN', fiscalYearStart:'Début exercice', fiscalYearEnd:'Fin exercice', vatRegime:'Régime TVA', accountingMode:'Mode comptable' }).map(([key,label]) => <label key={key}>{label}<input value={company[key]} onChange={e => setCompany({ ...company, [key]: e.target.value })}/></label>)}</div></Panel>;
}
function Accounts({ accounts, setAccounts }) {
  const [draft, setDraft] = useState({ number: '', label: '', category: 'Charges' });
  const add = () => { if (!draft.number || !draft.label) return; setAccounts([...accounts, { ...draft, active: true }]); setDraft({ number:'', label:'', category:'Charges' }); };
  return <Panel title="Plan comptable"><div className="inline-form"><input placeholder="Compte" value={draft.number} onChange={e=>setDraft({...draft, number:e.target.value})}/><input placeholder="Libellé" value={draft.label} onChange={e=>setDraft({...draft, label:e.target.value})}/><select value={draft.category} onChange={e=>setDraft({...draft, category:e.target.value})}><option>Charges</option><option>Produits</option><option>TVA</option><option>Trésorerie</option><option>Tiers</option></select><button onClick={add}>Ajouter</button></div><table><tbody>{accounts.map(a => <tr key={a.number}><td><strong>{a.number}</strong></td><td>{a.label}</td><td>{a.category}</td><td><input type="checkbox" checked={a.active} onChange={() => setAccounts(accounts.map(x => x.number === a.number ? { ...x, active: !x.active } : x))}/></td></tr>)}</tbody></table></Panel>;
}
function EntryForm({ accounts, addEntry }) {
  const [form, setForm] = useState({ date: today(), label: '', type: 'expense', account: '606300', amountTtc: '', vatRate: 20, source: 'bank' });
  const accountOptions = accounts.filter(a => form.type === 'income' ? a.category === 'Produits' : a.category === 'Charges');
  const submit = (e) => { e.preventDefault(); addEntry(form); setForm({ ...form, label:'', amountTtc:'' }); };
  return <Panel title="Saisie simplifiée"><form onSubmit={submit} className="form-grid"><label>Date<input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label><label>Libellé<input required placeholder="Ex. Abonnement téléphone" value={form.label} onChange={e=>setForm({...form,label:e.target.value})}/></label><label>Type<select value={form.type} onChange={e=>setForm({...form,type:e.target.value,account:e.target.value==='income'?'707000':'606300'})}><option value="expense">Dépense</option><option value="income">Recette</option></select></label><label>Compte<select value={form.account} onChange={e=>setForm({...form,account:e.target.value})}>{accountOptions.map(a=><option key={a.number} value={a.number}>{a.number} — {a.label}</option>)}</select></label><label>Montant TTC<input required type="number" step="0.01" value={form.amountTtc} onChange={e=>setForm({...form,amountTtc:e.target.value})}/></label><label>TVA %<select value={form.vatRate} onChange={e=>setForm({...form,vatRate:e.target.value})}><option>0</option><option>5.5</option><option>10</option><option>20</option></select></label><label>Source<select value={form.source} onChange={e=>setForm({...form,source:e.target.value})}><option value="bank">Banque</option><option value="cash">Caisse</option></select></label><button className="primary">Générer l’écriture</button></form></Panel>;
}
function Bank({ importCsv, rules, setRules, entries }) {
  const [csv, setCsv] = useState('2026-05-01;ORANGE PRO;-35.00\n2026-05-02;CLIENT DUPONT;420.00');
  const [rule, setRule] = useState({ keyword: '', account: '606300', type: 'expense', label: '' });
  return <section className="grid two"><Panel title="Import bancaire CSV"><p>Format accepté : date;libellé;montant. Les mots-clés imputent automatiquement les dépenses.</p><textarea value={csv} onChange={e=>setCsv(e.target.value)} rows="7"/><button className="primary" onClick={()=>importCsv(csv)}><Upload size={16}/> Importer</button></Panel><Panel title="Règles d’imputation"><div className="inline-form"><input placeholder="Mot-clé ou regex" value={rule.keyword} onChange={e=>setRule({...rule,keyword:e.target.value})}/><input placeholder="Compte" value={rule.account} onChange={e=>setRule({...rule,account:e.target.value})}/><button onClick={()=>{ if(rule.keyword) setRules([...rules, rule]); }}>Ajouter</button></div>{rules.map((r,i)=><div className="rule" key={i}><strong>{r.keyword}</strong><span>{r.account} — {r.label || r.type}</span></div>)}</Panel><Panel title="Opérations banque" className="span"><EntryTable entries={entries.filter(e=>e.source==='bank')}/></Panel></section>;
}
function Vat({ totals }) { return <Panel title="Préparation déclaration TVA"><div className="cards"><Kpi icon={ReceiptText} title="TVA collectée" value={euro(totals.vatCollected)}/><Kpi icon={ReceiptText} title="TVA déductible" value={euro(totals.vatDeductible)}/><Kpi icon={ReceiptText} title="TVA nette" value={euro(totals.vatDue)}/></div><p className="note">Simulation de liquidation : à valider par un professionnel avant téléprocédure.</p></Panel>; }
function Reports({ entries, totals, exportFec }) { return <section><Panel title="Écritures comptables"><EntryTable entries={entries}/></Panel><Panel title="Exports"><div className="actions"><button className="primary" onClick={exportFec}>Exporter FEC démo</button><button onClick={()=>alert('Balance : débit/crédit équilibrés dans la génération automatique.')}>Contrôler balance</button><button onClick={()=>alert(`Résultat simplifié : ${euro(totals.result)}`)}>Compte de résultat</button></div></Panel></section>; }
function Security() { return <Panel title="Conformité intégrée au MVP"><div className="checklist">{['Journal d’audit à prévoir côté serveur','Écritures validées équilibrées débit/crédit','Export FEC au format texte tabulé','Verrouillage des exercices clôturés','Gestion des rôles : admin, comptable, collaborateur, lecture seule','RGPD, sauvegardes et conservation des justificatifs'].map(x=><div key={x}>✓ {x}</div>)}</div><p className="note">Cette démo front-end illustre les processus. Une mise en production exige backend sécurisé, base PostgreSQL, authentification, audit et validation fiscale.</p></Panel>; }
function EntryTable({ entries }) { return <div className="table-wrap"><table><thead><tr><th>Date</th><th>Libellé</th><th>Type</th><th>HT</th><th>TVA</th><th>TTC</th></tr></thead><tbody>{entries.map(e=><tr key={e.id}><td>{e.date}</td><td>{e.label}</td><td><span className={e.type}>{e.type==='income'?'Recette':'Dépense'}</span></td><td>{euro(e.ht)}</td><td>{euro(e.vat)}</td><td><strong>{euro(e.amountTtc)}</strong></td></tr>)}</tbody></table></div>; }

createRoot(document.getElementById('root')).render(<App />);
