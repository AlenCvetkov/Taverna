const error=(message,status=400)=>Object.assign(new Error(message),{status});
export function transaction(db,fn){db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}}
export function tableData(db,waiterId){
 return db.prepare(`SELECT m.MasaID AS id,m.Tip AS type,m.Broj AS number,m.Aktivna AS active,m.Oznaka AS label,
 CASE WHEN m.SlobodnaZafatena='Zafatena' THEN 'occupied' ELSE 'free' END AS status,m.TekovnaCena AS totalMinor,
 EXISTS(SELECT 1 FROM Narachka n JOIN Smetka s USING(SmetkaID) WHERE n.MasaID=m.MasaID AND n.KelnerID=? AND s.Plateno=0 AND s.Otkazana=0) AS isMine
 FROM MasaPregled m WHERE m.Aktivna=1 ORDER BY m.Tip,m.Broj`).all(waiterId).map(t=>({...t,isMine:Boolean(t.isMine)}));
}
export function selectTable(db,id,user){
 if(!db.prepare('SELECT 1 FROM Masa WHERE MasaID=? AND Aktivna=1').get(id))throw error('Масата не е пронајдена.',404);
 if(user.role==='waiter')db.prepare('INSERT OR IGNORE INTO Izbira(KelnerID,MasaID) VALUES(?,?)').run(user.id,id);
}
export function tableOrders(db,id,user){
 const rows=db.prepare(`SELECT n.*,a.Slika IS NOT NULL AS HasPhoto,a.SlikaVerzija FROM NarachkaPregled n JOIN Smetka s USING(SmetkaID)
 JOIN Article a ON a.ArticleID=n.ArticleID WHERE n.MasaID=? AND s.Plateno=0 AND s.Otkazana=0 ORDER BY n.NarachkaID`).all(id);
 const batches=new Map();
 for(const n of rows){
  if(!batches.has(n.Prakanje))batches.set(n.Prakanje,{id:n.NarachkaID,billId:n.SmetkaID,waiterId:n.KelnerID,waiter:n.KelnerIme,totalMinor:0,items:[],...(user.role==='waiter'?{}:{createdAt:n.DodadenoNa})});
  const order=batches.get(n.Prakanje);
  order.totalMinor+=n.Vkupno;
  const addons=db.prepare(`SELECT DodatokNaNarachkaID AS id,SifraPriNaracka AS code,ImePriNaracka AS name,CenaPriNaracka AS unitMinor,BrojPoEdinica AS quantity
   FROM DodatokNaNarachka WHERE NarachkaID=? ORDER BY DodatokNaNarachkaID`).all(n.NarachkaID);
  order.items.push({id:n.NarachkaID,lineNo:n.RedenBroj,code:n.SifraPriNaracka,name:n.ImePriNaracka,unitMinor:n.CenaPriNaracka,quantity:n.BrojNaArtikli,note:n.Komentar,
   waiterId:n.KelnerID,waiter:n.KelnerIme,imageUrl:n.HasPhoto?`/api/products/${n.ArticleID}/image?v=${n.SlikaVerzija}`:'',addons});
 }
 return [...batches.values()];
}
export function createOrder(db,user,b){
 if(user.role!=='waiter')throw error('Само келнер може да додаде нарачка.',403);
 const tableId=Number(b.tableId),lines=Array.isArray(b.items)?b.items:[],key=String(b.idempotencyKey||'');
 if(!key||key.length>200||lines.length<1||lines.length>100)throw error('Додајте барем еден артикл.');
 return transaction(db,()=>{
  const prior=db.prepare('SELECT NarachkaID,MasaID,KelnerID FROM Narachka WHERE Prakanje=? ORDER BY RedenBroj LIMIT 1').get(key);
  if(prior){if(prior.MasaID!==tableId||prior.KelnerID!==user.id)throw error('Барањето веќе е искористено.',409);return {orderId:prior.NarachkaID,duplicate:true};}
  if(!db.prepare('SELECT 1 FROM Masa WHERE MasaID=? AND Aktivna=1').get(tableId))throw error('Масата не е пронајдена.',404);
  let addedTotal=0;
  const normalized=lines.map(line=>{
   const a=db.prepare("SELECT * FROM Article WHERE ArticleID=? AND Aktiven=1 AND Kategorija IN('kitchen','bar')").get(Number(line.productId));
   const qty=Number(line.quantity);
   if(!a||!Number.isInteger(qty)||qty<1||qty>999)throw error('Артикл или количина не се валидни.');
   const input=Array.isArray(line.addons)?line.addons:[];
   if(input.length>50)throw error('Премногу додатоци за една ставка.');
   const addons=input.map(add=>{
    const product=db.prepare("SELECT * FROM Article WHERE ArticleID=? AND Aktiven=1 AND Kategorija='addon'").get(Number(add.productId));
    const quantity=Number(add.quantity);if(!product||!Number.isInteger(quantity)||quantity<1||quantity>999)throw error('Додаток или количина не се валидни.');
    return {product,quantity};
   });
   addedTotal+=qty*(a.Cena+addons.reduce((s,x)=>s+x.product.Cena*x.quantity,0));
   if(!Number.isSafeInteger(addedTotal))throw error('Износот е преголем.');
   return {product:a,quantity:qty,note:String(line.note||'').slice(0,160),addons};
  });
  let bill=db.prepare('SELECT SmetkaID,Vkupno FROM Smetka WHERE MasaID=? AND Plateno=0 AND Otkazana=0').get(tableId);
  if(!bill)bill={SmetkaID:Number(db.prepare('INSERT INTO Smetka(MasaID) VALUES(?)').run(tableId).lastInsertRowid),Vkupno:0};
  if(!Number.isSafeInteger(bill.Vkupno+addedTotal))throw error('Износот е преголем.');
  let firstId;
  normalized.forEach((line,index)=>{
   const a=line.product;
   const id=Number(db.prepare(`INSERT INTO Narachka(SmetkaID,MasaID,KelnerID,ArticleID,BrojNaArtikli,Komentar,SifraPriNaracka,ImePriNaracka,CenaPriNaracka,Prakanje,RedenBroj)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(bill.SmetkaID,tableId,user.id,a.ArticleID,line.quantity,line.note,a.Sifra,a.Ime,a.Cena,key,index+1).lastInsertRowid);
   firstId??=id;
   for(const add of line.addons){const p=add.product;db.prepare(`INSERT INTO DodatokNaNarachka(NarachkaID,ArticleID,BrojPoEdinica,SifraPriNaracka,ImePriNaracka,CenaPriNaracka)
    VALUES(?,?,?,?,?,?)`).run(id,p.ArticleID,add.quantity,p.Sifra,p.Ime,p.Cena);}
  });
  return {orderId:firstId,billId:bill.SmetkaID,duplicate:false};
 });
}
export function payTable(db,tableId,user){return transaction(db,()=>{
 const bill=db.prepare('SELECT SmetkaID,Vkupno FROM Smetka WHERE MasaID=? AND Plateno=0 AND Otkazana=0').get(tableId);
 if(!bill||bill.Vkupno<=0)throw error('Нема активна сметка за наплата.');
 const total=db.prepare('SELECT COALESCE(SUM(Vkupno),0) n FROM NarachkaPregled WHERE SmetkaID=?').get(bill.SmetkaID).n;
 if(total!==bill.Vkupno)throw error('Сумата на сметката не се совпаѓа со ставките.',409);
 db.prepare('UPDATE Smetka SET Plateno=1,NaplatenoNa=CURRENT_TIMESTAMP WHERE SmetkaID=?').run(bill.SmetkaID);
 db.prepare('INSERT INTO Naplata(SmetkaID,PrimilLiceID,Iznos) VALUES(?,?,?)').run(bill.SmetkaID,user.id,total);
 return {paidMinor:total,billId:bill.SmetkaID};
});}
export function billHistory(db){return db.prepare(`SELECT s.SmetkaID AS id,s.MasaID AS tableId,s.Oznaka AS tableLabel,s.Plateno AS paid,s.Otkazana AS cancelled,
 s.Vkupno AS totalMinor,s.DatumVreme AS openedAt,s.NaplatenoNa AS paidAt,s.TraenjeSekundi AS durationSeconds
 FROM SmetkaPregled s ORDER BY s.SmetkaID DESC LIMIT 100`).all();}
export function overview(db){return {
 salesToday:db.prepare("SELECT COUNT(*) count,COALESCE(SUM(Iznos),0) total FROM Naplata WHERE date(DatumVreme,'localtime')=date('now','localtime')").get(),
 open:{count:db.prepare('SELECT COUNT(*) n FROM Narachka n JOIN Smetka s USING(SmetkaID) WHERE s.Plateno=0 AND s.Otkazana=0').get().n,total:db.prepare('SELECT COALESCE(SUM(Vkupno),0) n FROM Smetka WHERE Plateno=0 AND Otkazana=0').get().n},
 totalStaff:db.prepare('SELECT COUNT(*) n FROM Lice WHERE Aktiven=1').get().n
};}
export function recentPayments(db){return db.prepare(`SELECT p.Iznos AS amountMinor,p.DatumVreme AS paidAt,l.Ime AS name,m.Tip||m.Broj AS tableLabel,p.SmetkaID AS billId
 FROM Naplata p JOIN Lice l ON l.LiceID=p.PrimilLiceID JOIN Smetka s ON s.SmetkaID=p.SmetkaID JOIN Masa m ON m.MasaID=s.MasaID ORDER BY p.NaplataID DESC LIMIT 30`).all();}
