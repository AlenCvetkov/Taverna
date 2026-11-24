import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { backup } from 'node:sqlite';

export async function migratePerSchema(db,root,dbPath) {
 if(db.prepare('SELECT 1 FROM schema_migrations WHERE version=6').get())return;
 if(dbPath){
  const path=dbPath+'.before-per-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite';
  await backup(db,path);
  console.log('PER backup: '+path);
 }
 db.exec('BEGIN IMMEDIATE');
 try{
  const names=['Lice','Artikl','Masa','Narachka','StavkaNaNarachka','DodatokNaStavka','Naplata','Kujna','Shank','Dodatok'];
  const old=Object.fromEntries(names.map(name=>[name,db.prepare(`SELECT * FROM ${name} ORDER BY id`).all()]));
  const users=new Map(old.Lice.map(u=>[u.id,u]));
  for(const order of old.Narachka){
   if(users.get(order.waiter_id)?.role!=='waiter')throw Error('Historical order '+order.id+' was not authored by a waiter; migration requires explicit attribution.');
   const lines=old.StavkaNaNarachka.filter(i=>i.order_id===order.id);
   const total=lines.reduce((sum,i)=>sum+i.quantity*(i.unit_price_minor+old.DodatokNaStavka.filter(a=>a.order_item_id===i.id).reduce((s,a)=>s+a.quantity_per_unit*a.unit_price_minor,0)),0);
   if(total!==order.total_minor)throw Error('Historical order total mismatch: '+order.id);
  }
  for(const view of ['KujnaPregled','ShankPregled','DodatokPregled'])db.exec(`DROP VIEW IF EXISTS ${view}`);
  for(const name of names)db.exec(`ALTER TABLE ${name} RENAME TO _per_old_${name}`);
  db.exec(readFileSync(join(root,'migrations','006_per_schema.sql'),'utf8'));
  const person=db.prepare('INSERT INTO Lice(LiceID,Ime,KorisnickoIme,Pozicija,Sol,LozinkaHash,Aktiven,KreiranNa,Sifra) VALUES(?,?,?,?,?,?,?,?,?)');
  for(const u of old.Lice)person.run(u.id,u.name,u.username,u.role,u.salt,u.password_hash,u.active,u.created_at,u.staff_code);
  const article=db.prepare('INSERT INTO Article(ArticleID,Sifra,Ime,Kategorija,Cena,Aktiven,Slika,SlikaVerzija) VALUES(?,?,?,?,?,?,?,?)');
  for(const a of old.Artikl)article.run(a.id,a.code,a.name,a.category,a.price_minor,a.active,a.image_data,a.image_version);
  const table=db.prepare('INSERT INTO Masa(MasaID,Tip,Broj,Aktivna) VALUES(?,?,?,?)');
  for(const t of old.Masa)table.run(t.id,t.table_type,t.table_number,t.active);

  const groups=new Map(),usedPayments=new Set();
  for(const o of old.Narachka){
   const key=o.status==='active'?'open:'+o.table_id:o.status==='paid'?'paid:'+o.table_id+':'+o.paid_at:'cancelled:'+o.id;
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(o);
  }
  const billInsert=db.prepare('INSERT INTO Smetka(MasaID,DatumVreme) VALUES(?,?)');
  const lineInsert=db.prepare(`INSERT INTO Narachka(NarachkaID,SmetkaID,MasaID,KelnerID,ArticleID,BrojNaArtikli,Komentar,SifraPriNaracka,ImePriNaracka,CenaPriNaracka,DodadenoNa,Prakanje,RedenBroj) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const addonInsert=db.prepare('INSERT INTO DodatokNaNarachka(DodatokNaNarachkaID,NarachkaID,ArticleID,BrojPoEdinica,SifraPriNaracka,ImePriNaracka,CenaPriNaracka) VALUES(?,?,?,?,?,?,?)');
  const paymentInsert=db.prepare('INSERT INTO Naplata(NaplataID,SmetkaID,PrimilLiceID,Iznos,DatumVreme) VALUES(?,?,?,?,?)');
  for(const orders of [...groups.values()].sort((a,b)=>(Number(a[0].status==='active')-Number(b[0].status==='active'))||a[0].id-b[0].id)){
   const first=orders[0],opened=orders.map(o=>o.created_at).sort()[0];
   const bill=Number(billInsert.run(first.table_id,opened).lastInsertRowid);
   for(const o of orders){
    for(const i of old.StavkaNaNarachka.filter(i=>i.order_id===o.id)){
     lineInsert.run(i.id,bill,o.table_id,o.waiter_id,i.product_id,i.quantity,i.note,i.product_code,i.name_snapshot,i.unit_price_minor,o.created_at,o.idempotency_key,i.line_no);
     for(const a of old.DodatokNaStavka.filter(a=>a.order_item_id===i.id))addonInsert.run(a.id,i.id,a.product_id,a.quantity_per_unit,a.product_code,a.name_snapshot,a.unit_price_minor);
    }
   }
   const expected=orders.reduce((s,o)=>s+o.total_minor,0);
   if(db.prepare('SELECT Vkupno FROM Smetka WHERE SmetkaID=?').get(bill).Vkupno!==expected)throw Error('Migrated bill total mismatch');
   if(first.status==='paid'){
    const matches=old.Naplata.filter(p=>p.table_id===first.table_id&&p.paid_at===first.paid_at);
    if(matches.length>1)throw Error('Ambiguous historical payments for table '+first.table_id+' at '+first.paid_at);
    db.prepare('UPDATE Smetka SET Plateno=1,NaplatenoNa=? WHERE SmetkaID=?').run(first.paid_at,bill);
    for(const p of matches){
     if(p.amount_minor!==expected)throw Error('Historical payment amount mismatch: '+p.id);
     paymentInsert.run(p.id,bill,p.received_by,p.amount_minor,p.paid_at);usedPayments.add(p.id);
    }
   }else if(first.status==='cancelled')db.prepare('UPDATE Smetka SET Otkazana=1 WHERE SmetkaID=?').run(bill);
  }
  // Preserve old payments even when the original release did not retain their item rows.
  for(const p of old.Naplata.filter(p=>!usedPayments.has(p.id))){
   const bill=Number(db.prepare('INSERT INTO Smetka(MasaID,DatumVreme,Vkupno,Plateno,NaplatenoNa) VALUES(?,?,?,1,?)').run(p.table_id,p.paid_at,p.amount_minor,p.paid_at).lastInsertRowid);
   paymentInsert.run(p.id,bill,p.received_by,p.amount_minor,p.paid_at);
  }
  // Original release archives remain available; point their user FK at the new person key.
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='Arhiva_sales_legacy'").get()){
   db.exec(`ALTER TABLE Arhiva_sales_legacy RENAME TO _per_legacy_sales;
    CREATE TABLE Arhiva_sales_legacy(id INTEGER PRIMARY KEY,table_id INTEGER NOT NULL,user_id INTEGER NOT NULL REFERENCES Lice(LiceID),total INTEGER NOT NULL,items_json TEXT NOT NULL,closed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO Arhiva_sales_legacy SELECT * FROM _per_legacy_sales;
    DROP TABLE _per_legacy_sales;`);
  }
  for(const name of ['DodatokNaStavka','StavkaNaNarachka','Narachka','Naplata','Kujna','Shank','Dodatok','Artikl','Masa','Lice'])db.exec(`DROP TABLE _per_old_${name}`);
  if(db.prepare('SELECT COUNT(*) n FROM Narachka').get().n!==old.StavkaNaNarachka.length)throw Error('Item count mismatch');
  if(db.prepare('SELECT COUNT(*) n FROM DodatokNaNarachka').get().n!==old.DodatokNaStavka.length)throw Error('Addon count mismatch');
  if(db.prepare('SELECT COUNT(*) n FROM Naplata').get().n!==old.Naplata.length)throw Error('Payment count mismatch');
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('PER migration foreign key check failed');
  db.prepare('INSERT INTO schema_migrations(version) VALUES(6)').run();
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
}
