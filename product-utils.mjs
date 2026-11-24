// Shared by the browser and server so both searches use the same alphabet rules.
const letters = {
 а:'a',б:'b',в:'v',г:'g',д:'d',ѓ:'gj',е:'e',ж:'zh',з:'z',ѕ:'dz',и:'i',ј:'j',
 к:'k',л:'l',љ:'lj',м:'m',н:'n',њ:'nj',о:'o',п:'p',р:'r',с:'s',т:'t',ќ:'kj',
 у:'u',ф:'f',х:'h',ц:'c',ч:'ch',џ:'dzh',ш:'sh',ё:'e',й:'j',š:'sh',č:'ch',ž:'zh',ć:'kj',đ:'gj'
};
export function searchKey(value) {
 return [...String(value ?? '').toLocaleLowerCase('mk')].map(c=>letters[c] ?? c).join('')
  .normalize('NFKD').replace(/\p{M}/gu,'').replace(/dzh/g,'dz')
  .replace(/zh/g,'z').replace(/sh/g,'s').replace(/ch/g,'c')
  .replace(/([a-z])\1+/g,'$1').replace(/[^a-z0-9]+/g,' ').trim();
}
export function matchesProduct(product, query) {
 return searchKey(`${product.code} ${product.name}`).includes(searchKey(query));
}
export function defaultImage(product) {
 const name=searchKey(product.name);
 const rules=[
  [/espres|kafe|coffee/,'espresso'],[/burger|hamburger/,'burger'],[/salat/,'salad'],
  [/piles|chicken/,'chicken'],[/pomfrit|fries/,'fries'],[/limon|lemon/,'lemonade'],
  [/voda|water/,'water'],[/sok|juice/,'juice'],[/kaskaval|siren|cheese/,'cheese'],
  [/slanina|bacon/,'bacon'],[/sos|sauce/,'sauce']
 ];
 const match=rules.find(([pattern])=>pattern.test(name));
 const category=product.category || (product.code>=800?'kitchen':product.code>=500?'bar':'addon');
 return '/assets/products/'+(match?.[1] || ({kitchen:'meal',bar:'drink',addon:'addon'}[category] || 'meal'))+'.svg';
}
