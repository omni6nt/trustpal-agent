const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* cursor glow */
addEventListener('pointermove',e=>{document.documentElement.style.setProperty('--mx',e.clientX/innerWidth*100+'%');document.documentElement.style.setProperty('--my',e.clientY/innerHeight*100+'%')},{passive:true});

/* ---- journey: replays real behaviour of the four checks ---- */
const steps=$$('#steps li'),tok=$('#token'),txt=$('#tokenTxt'),say=$('#say'),head=$('#sayHead'),body=$('#sayBody'),box=$('#journey');
const K=['in','ai','guard','own','con','out'];
const SC=[
 {tok:'INV-2001 · 0.5 NEAR → alex',cls:'good',ev:[
  ['in','A real invoice arrives','Alex sent invoice INV-2001 for 0.5 NEAR.'],
  ['ai','The AI reads it','It proposes: pay INV-2001, 0.5 NEAR, to alex.testnet.'],
  ['guard','The guard checks the payee','Known account, not blocked, not a look-alike.','ok'],
  ['own','Matches the owner\'s approval','Same invoice number, payee, amount, and still in date.','ok'],
  ['con','The contract checks every rule','Limits, one-time use, not paused. All pass.','ok'],
  ['out','Paid: 0.5 NEAR to alex','Exactly what the owner approved, once.','ok','good']]},
 {tok:'INV-2001 · 0.5 NEAR → attacker',cls:'bad',ev:[
  ['in','A poisoned invoice arrives','It reuses INV-2001 but hides a new payee address.'],
  ['ai','The AI is fooled','It proposes paying the attacker. It can be tricked. That is the point.','warn'],
  ['guard','The guard stops it','This payee was never approved, so the payment is refused.','stop','bad']]},
 {tok:'INV-2001 · 0.5 NEAR → attacker',cls:'bad',ev:[
  ['in','Poisoned, and the guard is switched off','Worst case: the AI is fooled and the guard misses it.'],
  ['ai','The AI sends the payment','It asks the contract to pay the attacker.','warn'],
  ['guard','The guard misses it','Nothing flags the address.','warn'],
  ['own','The owner\'s approval does not match','The owner approved alex, not this address. Refused.','stop','bad']]}
];
let cur=0,run=0;
function place(k,instant){
  const li=steps[K.indexOf(k)],b=box.getBoundingClientRect(),r=li.getBoundingClientRect(),w=tok.offsetWidth,h=tok.offsetHeight;
  const vertical=getComputedStyle($('#steps')).gridTemplateColumns.split(' ').length===1;
  const x=vertical?r.left-b.left+14:r.left-b.left+r.width/2-w/2, y=vertical?r.top-b.top+r.height/2-h/2:r.top-b.top+12;
  tok.style.transition=instant?'none':'';tok.style.transform=`translate(${x}px,${y}px)`;
}
async function play(i){
  const my=++run;cur=i;
  $$('#scenes button').forEach(b=>b.classList.toggle('on',+b.dataset.s===i));
  steps.forEach(s=>s.className='');say.className='say';
  txt.textContent=SC[i].tok;tok.className='token';place('in',true);head.textContent='';body.textContent='';
  await sleep(reduce?0:450);
  for(const [k,h,b,st,end] of SC[i].ev){
    if(my!==run)return;
    const li=steps[K.indexOf(k)];li.classList.add('lit');place(k);
    head.textContent=h;body.textContent=b;
    await sleep(reduce?0:1000);
    if(my!==run)return;
    li.classList.remove('lit');
    if(st==='ok')li.classList.add('ok');else if(st==='stop'){li.classList.add('stop');tok.classList.add('bad')}else if(st==='warn'){li.classList.add('warn');tok.classList.add(SC[i].cls==='bad'?'bad':'')}
    if(end){say.classList.add(end)}
    if(SC[i].cls==='good')tok.classList.add('good');
    await sleep(reduce?0:650);
  }
  if(my!==run)return;
  await sleep(reduce?4000:2600);
  if(my===run)play((i+1)%SC.length);
}
$$('#scenes button').forEach(b=>b.onclick=()=>play(+b.dataset.s));
let started=false;
new IntersectionObserver(es=>{if(es[0].isIntersecting&&!started){started=true;play(0)}},{threshold:.25}).observe(box);
addEventListener('resize',()=>{const e=SC[cur].ev;/* keep token on last shown step */});

/* ---- reveal on scroll ---- */
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);if(e.target.querySelector('.split'))$('#split').classList.add('go');$$('.n',e.target).forEach(countTo)}}),{threshold:.2});
$$('.rv').forEach((el,i)=>{el.style.transitionDelay=(i%4)*90+'ms';io.observe(el)});
function countTo(el){if(el.dataset.done)return;el.dataset.done=1;const to=+el.dataset.to;if(reduce){el.textContent=to;return}const t0=performance.now();(function f(t){const p=Math.min(1,(t-t0)/1100);el.textContent=Math.round(to*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(f)})(t0)}

/* ---- peek ---- */
const caps=[['overview','Where the money stands, the four checks, and what the AI can and cannot do.'],['invoices','Paste an invoice. The AI reads it and you watch it travel through the checks.'],['revenue split','Set who gets what when a client pays. The treasury keeps the rest.'],['security lab','Run the attacks yourself. Each one stops at the check that caught it.'],['activity','Every payment, approval and refusal, labelled practice or live.']];
const imgs=$$('#frame .shots img'),tabs=$$('#peekTabs button');
function peek(i){imgs.forEach((m,j)=>m.classList.toggle('on',i===j));tabs.forEach((t,j)=>t.classList.toggle('on',i===j));$('#frameName').textContent=caps[i][0];$('#frameCap').textContent=caps[i][1]}
tabs.forEach(t=>t.onclick=()=>{clearInterval(auto);peek(+t.dataset.i)});peek(0);
let pi=0;const auto=setInterval(()=>{pi=(pi+1)%5;peek(pi)},5200);
const fr=$('#frame');
if(!reduce&&matchMedia('(hover:hover)').matches){fr.addEventListener('pointermove',e=>{const r=fr.getBoundingClientRect();fr.style.setProperty('--ry',((e.clientX-r.left)/r.width-.5)*5+'deg');fr.style.setProperty('--rx',(.5-(e.clientY-r.top)/r.height)*4+'deg')});fr.addEventListener('pointerleave',()=>{fr.style.setProperty('--rx','0deg');fr.style.setProperty('--ry','0deg')})}
