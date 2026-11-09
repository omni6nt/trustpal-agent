'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let S = null, busy = false, route = 'overview', lastBal = null;
const ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

/* ================= authority stack ================= */
const stackEl = $('stack'), aside = document.querySelector('.aside'), overlay = $('overlay');
const pills = [...stackEl.querySelectorAll('.pill')], gates = [...overlay.querySelectorAll('.gate')];
const dot = $('dot'), lit = $('lit'), spine = $('spine'), caption = $('caption');
const stamp = document.createElement('div'); stamp.className = 'stamp'; stamp.textContent = 'Paid'; pills[3].appendChild(stamp);
let pos = [], vertical = true, cur = 0;
function layoutRail() {
  vertical = matchMedia('(min-width:1181px)').matches; const compact = matchMedia('(max-width:900px)').matches; aside.classList.toggle('h', !vertical); aside.classList.toggle('c', compact);
  pos = pills.map((p) => vertical ? { x: 29, y: p.offsetTop + 27 } : compact ? { x: p.offsetLeft + p.offsetWidth / 2, y: p.offsetTop + 19 } : { x: p.offsetLeft + 21, y: p.offsetTop + p.offsetHeight / 2 });
  gates.forEach((g, i) => (g.style.transform = `translate(${pos[i].x - 12}px,${pos[i].y - 12}px)`));
  const a = pos[0], b = pos[3];
  Object.assign(spine.style, vertical ? { left: a.x - 1.5 + 'px', top: a.y + 'px', width: '3px', height: b.y - a.y + 'px' } : { left: a.x + 'px', top: a.y - 1.5 + 'px', width: b.x - a.x + 'px', height: '3px' });
  moveTo(cur, true);
}
function moveTo(i, instant) {
  cur = i; const a = pos[0], p = pos[i];
  if (instant) { dot.style.transition = lit.style.transition = 'none'; }
  dot.style.transform = `translate(${p.x}px,${p.y}px)`;
  if (vertical) Object.assign(lit.style, { left: a.x - 1.5 + 'px', top: a.y + 'px', width: '3px', height: p.y - a.y + 'px' });
  else Object.assign(lit.style, { left: a.x + 'px', top: a.y - 1.5 + 'px', height: '3px', width: p.x - a.x + 'px' });
  if (instant) requestAnimationFrame(() => { dot.style.transition = lit.style.transition = ''; });
}
function railReset() {
  aside.classList.remove('stopped', 'paid');
  pills.forEach((p) => (p.className = p.className.replace(/\b(pass|halt|skip|dim|wait|fin)\b/g, '').trim()));
  gates.forEach((g) => (g.className = 'gate')); stamp.classList.remove('show'); moveTo(0, true);
}
function burst(i, color) {
  if (reduced) return;
  const { x, y } = pos[i];
  for (let k = 0; k < 16; k++) {
    const s = document.createElement('i'); const ang = (k / 16) * Math.PI * 2, d = 46 + Math.random() * 40;
    Object.assign(s.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: '6px', height: '6px', margin: '-3px', borderRadius: '50%', background: color });
    overlay.appendChild(s);
    s.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(ang) * d}px,${Math.sin(ang) * d}px) scale(.2)`, opacity: 0 }], { duration: 900, easing: 'cubic-bezier(.1,.7,.3,1)' }).onfinish = () => s.remove();
  }
  const r = document.createElement('i');
  Object.assign(r.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: '24px', height: '24px', margin: '-12px', borderRadius: '50%', border: '2px solid ' + color });
  overlay.appendChild(r); r.animate([{ transform: 'scale(1)', opacity: .9 }, { transform: 'scale(5)', opacity: 0 }], { duration: 800, easing: 'ease-out' }).onfinish = () => r.remove();
}
async function railPlay(a) {
  railReset(); await sleep(reduced ? 0 : 160);
  const step = reduced ? 0 : 640, stopAt = a.outcome === 'stopped' ? (a.stoppedAt === 'guard' ? 1 : a.stoppedAt === 'rules' ? 2 : 3) : -1;
  for (let i = 0; i < 4; i++) {
    moveTo(i); await sleep(step);
    if (i === stopAt) {
      pills[i].classList.add('halt'); gates[i].classList.add('halt'); aside.classList.add('stopped'); burst(i, '#F07468');
      for (let j = i + 1; j < 4; j++) pills[j].classList.add('dim');
      break;
    }
    if (i === 1 && a.guardSkipped) { pills[i].classList.add('skip'); gates[i].classList.add('skip'); }
    else if (i === 3 && a.outcome === 'pending') { pills[i].classList.add('wait'); gates[i].classList.add('wait'); aside.classList.add('paid'); }
    else { pills[i].classList.add('pass'); gates[i].classList.add('pass'); }
  }
  if (a.outcome === 'paid') { aside.classList.add('paid'); pills[3].classList.add('fin'); stamp.classList.add('show'); burst(3, '#4CC2A1'); }
  caption.className = 'verdict ' + (a.outcome === 'paid' ? 'good' : a.outcome === 'stopped' ? 'bad' : '');
  caption.textContent = a.headline;
}
async function railIdle() {
  if (reduced) return;
  for (let i = 0; i < 4; i++) { moveTo(i); await sleep(420); pills[i].classList.add('pass'); gates[i].classList.add('pass'); }
  await sleep(700); railReset();
}

/* ================= helpers ================= */
const fmt = (n, d = 4) => { const x = Number(n); return Number.isFinite(x) ? x.toLocaleString(undefined, { maximumFractionDigits: d }) : String(n); };
const when = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const tagFor = (o) => ({ paid: ['paid', 'Paid'], stopped: ['stopped', 'Stopped'], pending: ['pending', 'Waiting'], info: ['info', 'Note'] }[o] || ['info', o]);
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2200); }
const liI = (t, ok) => `<li class="${ok ? 'can' : 'cant'}"><i></i>${esc(t)}</li>`;
async function copy(text) { try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Select the text and copy it'); } }
async function api(path, opts) { const r = await fetch(path, opts); const j = await r.json(); if (!r.ok) throw new Error(j.error || j.headline || 'Request failed'); return j; }
async function refresh() { S = await api('/api/state'); const live = S.network === 'testnet'; $('net').className = 'net' + (live ? ' live' : ''); $('netlabel').textContent = live ? 'NEAR testnet, live' : 'Practice mode'; $('acct').textContent = S.contract || ''; }
function countTo(el, str, dur = 1500) {
  const to = Number(str), dec = Math.min(4, (String(str).split('.')[1] || '').length), from = lastBal ?? 0;
  const show = (v) => (el.textContent = v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }));
  if (reduced || from === to) { show(to); return; }
  const t0 = performance.now();
  const tick = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4); show(from + (to - from) * e); if (k < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
const ownerEnv = () => `POLICY=${S.contract} OWNER=${S.owner}`;
const cmdLine = (args) => `${ownerEnv()} bash scripts/owner.sh ${args}`;
const cmdBox = (id, text) => `<div class="cmd"><code id="${id}">${esc(text)}</code><button class="btn ghost sm" data-copy="${id}">Copy</button></div>`;
const PALETTE = ['#CCD0CF', '#9BA8AB', '#6F8391', '#4A5C6A'];
const segColor = (i) => PALETTE[i % PALETTE.length];
const segText = (c) => (c === '#CCD0CF' || c === '#9BA8AB' ? '#06141B' : '#E6EAE9');
function splitParts() { const p = S.split.map((x, i) => ({ who: x.who, pct: x.pct, c: segColor(i) })); p.push({ who: 'Kept in the treasury', pct: S.treasuryPct, c: '#4CC2A1' }); return p.filter((x) => x.pct > 0); }
const modeTag = (a) => `<span class="tag info" style="margin-left:6px">${a.mode === 'testnet' ? 'Ran on testnet' : 'Practice run'}</span>`;
const txLink = (a) => (a.tx ? ` <a href="https://testnet.nearblocks.io/txns/${esc(a.tx)}" target="_blank" rel="noopener" style="color:var(--c5)">View transaction</a>` : '');
const feedItem = (a, full) => { const [c, l] = tagFor(a.outcome); return `<li class="${c}"><span><b>${esc(a.label)}</b> <span class="tag ${c}" style="margin-left:6px">${l}</span>${modeTag(a)}</span><time>${when(a.at)}</time><span class="why">${esc(a.headline)}${txLink(a)}${full && a.logs.length ? `<details><summary>What happened, step by step</summary><ul>${a.logs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}</span></li>`; };

/* ================= screens ================= */
const EV = { invoice: 1, fraud: 1, lookalike: 1, bypass: 1, approved: 1, replay: 1, legit: 1, overlimit: 0 };
const screens = {
  authority() {
    const roles = [
      ['Owner', 'You', ['Approve exact payments', 'Change limits, payees and the split', 'Pause everything', 'Withdraw from the treasury'], ['Be impersonated by the AI', 'Hand the AI unlimited control']],
      ['AI agent', 'Reads and proposes', ['Read invoices', 'Propose payments', 'Execute a payment you already approved, exactly as approved'], ['Approve anything', 'Change limits or the split', 'Add keys', 'Pay an address you did not approve']],
      ['Guard', 'Checks the payee', ['Flag look-alike addresses', 'Block known bad accounts', 'Warn on first-time payees'], ['Move money', 'Override the contract']],
      ['Contract', 'Final say', ['Enforce approvals, limits and replay protection', 'Split client payments by your rules'], ['Be talked into ignoring a rule', 'Pay anything the owner did not allow']],
    ];
    const li = (t, ok) => `<li class="${ok ? 'can' : 'cant'}"><i></i>${esc(t)}</li>`;
    return `<h1 class="in">Who can do what</h1>
    <p class="lede in">Trustpal works because authority is split. Each part can do a little, and no part can do everything.</p>
    <div class="grid2 roles">${roles.map((r) => `<section class="slab in"><h2>${r[0]}</h2><p class="sub">${r[1]}</p><ul class="cc">${r[2].map((t) => li(t, true)).join('')}${r[3].map((t) => li(t, false)).join('')}</ul></section>`).join('')}</div>
    <section class="slab in"><h2>One account, two keys</h2><p class="sub" style="margin-bottom:18px">The AI acts through a key on your account, but NEAR itself limits what that key may call.</p>
      <div class="keys2"><div class="k"><b>Your account</b><span class="mono">${esc(S.owner || '')}</span></div>
        <div class="k full"><b>Full-access key</b><span>You keep it. Every owner action.</span></div>
        <div class="k lim"><b>Agent key</b><span>Given to the AI. Can call pay on Trustpal and nothing else.</span></div></div>
      <p class="sub" style="margin-top:16px">If the AI's host is hacked, the thief holds only the agent key.</p>
      <p style="margin:18px 0 0"><a class="btn ghost sm" href="#security" style="text-decoration:none">Try to break it</a></p></section>`;
  },
  overview() {
    const rules = [
      [`Up to ${fmt(S.maxPerPayment)} NEAR in one payment`], [`Up to ${fmt(S.dailyCap)} NEAR a day`],
      [`Only people you approved, or exact invoices you approved`], S.paused ? ['Payments are paused', true] : ['You can pause everything instantly'],
      [S.cooldown ? `New payees wait ${fmt(S.cooldown / 60, 2)} min before the AI can pay them` : 'New payees can be paid straight away'],
    ];
    const ai = S.activity.filter((x) => x.label === 'Invoice read by the AI');
    const waiting = ai.filter((x) => /^HELD|^DECLINED/.test(x.headline)).length;
    const executed = S.activity.filter((x) => x.outcome === 'paid').length;
    const open = S.approvals.filter((x) => !x.expired).length;
    const need = open + waiting;
    const stage = (n, label, sub, on) => `<div class="stg ${on ? 'on' : ''}"><b class="num">${n}</b><span>${label}</span><small>${sub}</small></div>`;
    const setup = [
      [S.network !== 'testnet' || !!walletAcct, S.network === 'testnet' ? 'Connect your wallet' : 'Practice mode needs no wallet', S.network === 'testnet' ? '#approvals' : '#overview'],
      [(S.recipients || []).length > 0, 'Check your rules and the people you pay', '#owner'],
      [S.activity.some((x) => x.label === 'Invoice read by the AI'), 'Read your first invoice', '#invoices'],
    ];
    const todo = setup.filter((x) => !x[0]).length;
    const first = todo ? `<section class="slab in setup"><h2>Set up in three steps</h2><ul class="steps">${setup.map((x, i) => `<li class="${x[0] ? 'done' : ''}"><b>${x[0] ? '✓' : i + 1}</b><a href="${x[2]}">${esc(x[1])}</a></li>`).join('')}</ul></section>` : '';
    return `<h1 class="in">An AI runs your payments. It can't rob you.</h1>
    <p class="lede in">The AI reads invoices and proposes payments. It never holds your money or your main key. Whatever it is tricked into, the contract lets no more than your daily limit leave in a day, and the AI cannot approve payments or change your rules.</p>
    ${first}
    <section class="attention-card in"><div class="attention-copy"><span class="eyebrow">${need ? 'Needs you' : 'All clear'}</span><h2>${need ? `${need} payment${need === 1 ? '' : 's'} need${need === 1 ? 's' : ''} your attention` : 'Nothing needs your decision right now'}</h2><p>${need ? 'Nothing moves until you approve it.' : 'People on your list are paid within your limits when an invoice matches. Everything else waits for you.'}</p></div><div class="attention-actions"><a class="btn" href="#invoices">Read an invoice</a><a class="btn ghost" href="#approvals">Approvals</a></div></section>
    <section class="slab in stages" aria-label="Where payments are"><h2>Where your payments are</h2><p class="sub" style="margin:-8px 0 16px">Only the last stage moves money.</p><div class="stgrow">${stage(ai.length, 'Proposed by AI', 'not trusted until checked', ai.length)}<i></i>${stage(waiting, 'Waiting for you', 'nothing moves yet', waiting)}<i></i>${stage(open, 'Approved by you', 'locked on the blockchain', open)}<i></i>${stage(executed, 'Executed', 'confirmed by the contract', executed)}</div></section>
    <section class="slab in story"><h2>A day at a small studio</h2><p>A client pays the studio 10 NEAR. The contract splits it at once: shares go to the collaborators, the rest stays in the treasury. Later a contractor's invoice arrives. The AI reads it and prepares the payment, but a poisoned copy of the invoice swaps in a different wallet. The guard flags it. And even if the AI were fooled, the contract still refuses, because the owner never approved that exact payment.</p></section>
    <section class="slab hero in"><div><div class="label">Contract balance</div><div class="bal num"><span id="bal">0</span><small>NEAR</small></div>
      <p class="sub">${fmt(S.revenue)} NEAR received from clients. ${fmt(S.pending)} NEAR on its way out.</p></div>
      <div class="ring" title="Daily limit"><svg viewBox="0 0 168 168"><circle class="t" cx="84" cy="84" r="72"/><circle class="p" id="ringp" cx="84" cy="84" r="72" style="--len:452.4"/></svg><div class="mid"><b class="num">${fmt(S.remainingToday, 2)}</b><span>left today</span></div></div></section>
    <div class="grid2">
      <section class="slab in"><h2>Your rules</h2><p class="sub">The AI works inside these. Only you can change them.</p>
        <div class="chips">${rules.map((r) => `<span class="chip ${r[1] ? 'warn' : ''}"><i></i>${esc(r[0])}</span>`).join('')}</div>
        <p style="margin:20px 0 0"><a class="btn ghost sm" href="#owner" style="text-decoration:none">Change rules</a></p></section>
      <section class="slab in"><h2>When a client pays</h2><p class="sub">The contract splits the money on the spot.</p>
        <div class="mini">${splitParts().map((p) => `<span style="width:${p.pct}%;background:${p.c}"></span>`).join('')}</div>
        <ul class="legend">${splitParts().map((p) => `<li><span class="sw" style="background:${p.c}"></span><span>${esc(p.who)}</span><b>${p.pct}%</b></li>`).join('')}</ul></section>
    </div>
    <section class="in"><h2 style="margin-bottom:18px">Recent activity</h2>${S.activity.length ? `<ul class="tl">${S.activity.slice(0, 5).map((a) => feedItem(a)).join('')}</ul>` : `<div class="empty">Nothing yet. Open the Security lab and run an attack, or let the AI read an invoice.</div>`}</section>`;
  },
  invoices() {
    return `<h1 class="in">Payments</h1>
    <p class="lede in">Paste an invoice. The AI reads it and each payment travels along four checks. People already on your list are paid within your limits when the amount matches the invoice total. New payees, and any amount that does not match, always wait for you. The sample hides an instruction aimed at the AI.</p>
    <div class="payment-steps in"><span><b>1</b> AI reads</span><i></i><span><b>2</b> Trustpal checks</span><i></i><span><b>3</b> You approve if needed</span><i></i><span><b>4</b> Contract executes</span></div>
    <section class="slab in"><label for="doc">Invoice text<textarea id="doc" spellcheck="false" style="margin-top:7px"></textarea></label>
      <div class="row" style="margin-top:18px"><button class="btn" id="readbtn">Read this invoice</button><button class="btn ghost" id="cleanbtn">Use a clean invoice</button><span class="sub">AI in use: ${esc(S.ai)}</span></div>
      <div id="invres" style="margin-top:14px"></div></section>`;
  },
  approvals() {
    const list = S.approvals.length ? S.approvals.map((a) => `<div class="appr"><div><h3>${esc(a.ref)}</h3><p class="sub" style="word-break:break-all">to ${esc(a.to)}</p><p class="sub">${a.expired ? 'Expired. Cancel it to reuse the reference.' : a.minutesLeft + ' min left. One use, exact amount.'}</p></div><div class="amt num">${fmt(a.amount)} <span class="sub">NEAR</span>${isOwnerAcct() && S.network === 'testnet' ? `<button class="btn ghost sm" data-cancel="${esc(a.ref)}" style="margin-top:8px">Cancel</button>` : ''}</div></div>`).join('') : `<div class="empty">No approved invoices are open. Approve one below and the AI can pay exactly that, once.</div>`;
    return `<h1 class="in">Approvals</h1>
    <p class="lede in">An approval says: pay this person this exact amount for this invoice, once. The contract checks that the payment exactly matches the approved recipient, amount, invoice number and deadline. Any difference and it refuses.</p>
    <section class="slab in" style="padding-top:12px;padding-bottom:12px">${list}</section>
    <section class="slab in"><h2>Approve with your wallet</h2>${walletApproveBlock()}</section>
    <section class="slab in"><h2>Approve a payment</h2>
      <p class="sub" style="margin-bottom:18px">${S.canEdit ? 'Practice mode applies it instantly. The same approval on testnet needs your owner key, so copy the command below.' : 'Prefer the terminal? Fill this in and run the command in your Codespace. The wallet button above does the same thing.'}</p>
      <div class="formgrid"><label>Invoice number<input id="aref" value="INV-2001"></label><label>Pay to<input id="ato" value="${esc(S.recipients[0] || '')}"></label><label>Amount (NEAR)<input id="aamt" value="0.5" inputmode="decimal"></label></div>
      <div class="row" style="margin-top:18px">${S.canEdit ? '<button class="btn" id="aapply">Approve this payment</button>' : ''}</div>
      ${S.canEdit ? cmdBox('acmd', '') : `<details class="advanced-details"><summary>Advanced: use a terminal command instead</summary>${cmdBox('acmd', '')}</details>`}<p class="note" id="aerr"></p></section>`;
  },
  revenue() {
    return `<h1 class="in">Revenue split</h1>
    <p class="lede in">When a client pays the business, the contract divides the money on the spot, by rules only you can change. Nobody, human or AI, decides it per payment.</p>
    <section class="slab in"><div class="bar" role="img" aria-label="Revenue split">${splitParts().map((p, i) => `<div class="seg" style="width:${p.pct}%;background:${p.c};color:${segText(p.c)};animation-delay:${i * 140}ms">${p.pct >= 10 ? p.pct + '%' : ''}</div>`).join('')}</div>
      <ul class="legend">${splitParts().map((p) => `<li><span class="sw" style="background:${p.c}"></span><span>${esc(p.who)}</span><b>${p.pct}%</b></li>`).join('')}</ul>
      <p style="margin:18px 0 0"><a class="btn ghost sm" href="#owner" style="text-decoration:none">Edit the split</a></p></section>
    <section class="slab in"><h2>Simulate a client payment</h2><p class="sub" style="margin-bottom:18px">${S.canEdit ? 'Send a payment as a client and watch the contract split it.' : 'Anyone can pay the business. Run this in your Codespace to send NEAR and watch it split.'}</p>
      <div class="row"><label style="width:180px">Amount (NEAR)<input id="camt" value="1" inputmode="decimal"></label>${S.canEdit ? '<button class="btn" id="capply" style="align-self:end">Pay the business</button>' : ''}</div>
      ${cmdBox('ccmd', '')}<div id="cres"></div><p class="sub" style="margin-top:14px">${fmt(S.revenue)} NEAR received so far.</p></section>`;
  },
  owner() {
    const mode = S.canEdit ? '<b>Practice mode.</b> Changes apply instantly so you can try your own numbers. On testnet your owner key never goes in a browser, so there the page gives you the exact command to run.' : '<b>Testnet mode.</b> This page never holds your owner key. Fill in a value, copy the command, and run it in your Codespace.';
    return `<h1 class="in">Owner settings</h1>
    <p class="lede in">These are the numbers only you decide. The contract enforces them, and the AI cannot touch any of them.</p>
    <div class="modebox in">${mode}</div>
    <div class="settings">
      <section class="slab in"><div class="sechead"><div><h2>Revenue split</h2><p class="sub">Who gets what when a client pays. Whatever you don't hand out stays in the treasury.</p></div></div>
        <div id="splitwrap"></div></section>
      <section class="slab in"><div class="sechead"><div><h2>Spending limits</h2><p class="sub">The most the AI can pay, and how long a brand-new payee has to wait.</p></div></div>
        <div class="formgrid"><label>Most per payment (NEAR)<input id="lmax" value="${esc(S.maxPerPayment)}" inputmode="decimal"></label><label>Most per day (NEAR)<input id="lcap" value="${esc(S.dailyCap)}" inputmode="decimal"></label><label>New payee waits (minutes)<input id="lcool" value="${esc(String(S.cooldown / 60))}" inputmode="decimal"></label></div>
        <div class="row" style="margin-top:18px">${S.canEdit ? '<button class="btn" id="lapply">Save limits</button>' : ''}</div>${cmdBox('lcmd', '')}<p class="note" id="lerr"></p></section>
      <section class="slab in"><div class="sechead"><div><h2>People the AI may pay</h2><p class="sub">Anyone not on this list needs an approved invoice first.</p></div></div>
        <div id="payees"></div>
        <div class="row" style="margin-top:14px"><div style="flex:1;min-width:220px"><input id="pnew" placeholder="name.testnet" aria-label="New payee account"></div><button class="btn" id="padd">Add payee</button></div><p class="note" id="perr"></p></section>
      <section class="slab in"><div class="sechead"><div><h2>Pause all payments</h2><p class="sub">The kill switch. While it is on, nothing leaves, whatever the AI asks.</p></div>
        <button class="switch" id="pause" role="switch" aria-checked="${S.paused}" aria-label="Pause all payments"><i></i></button></div>${cmdBox('pcmd', '')}</section>
    </div>`;
  },
  getpaid() {
    const to = S.walletContract || S.contract;
    const link = `${location.origin}/pay.html?to=${encodeURIComponent(to)}`;
    return `<h1 class="in">Get paid</h1>
    <p class="lede in">This is where your clients send money. It goes into your treasury, and your revenue split shares it out at once.</p>
    <section class="slab in"><h2>Your payment address</h2><p class="sub" style="margin-bottom:14px">Your treasury is a contract on the NEAR test network.</p>${cmdBox('payaddr', to)}</section>
    <section class="slab in"><h2>Your payment link</h2><p class="sub" style="margin-bottom:14px">Send this to a client. They open it, connect their wallet and pay. The split happens automatically.</p>${cmdBox('paylink', link)}
      <div class="row" style="margin-top:14px"><a class="btn" href="${esc(link)}" target="_blank" rel="noopener" style="text-decoration:none">Open the payment page</a></div></section>
    <section class="slab in"><h2>What happens when a client pays</h2><ul class="cc">${liI('The client pays through the link and confirms in their own wallet', true)}${liI('The contract splits the money by your revenue split in the same moment', true)}${liI('Whatever you do not hand out stays in your treasury', true)}${liI('A plain transfer to the address above lands in the treasury but is not split. Use the link.', false)}</ul></section>`;
  },
  agent() {
    const src = /^(Claude|Gemini)/.test(S.ai || '') ? (S.ai || '').replace(' (real model)', '') + ', a real AI model' : 'A scripted stand-in (no API key set)';
    const recent = (S.activity || []).slice(0, 5);
    return `<h1 class="in">AI agent</h1>
    <p class="lede in">The agent reads your invoices and prepares payments. It never decides what is safe to pay: you and the contract do.</p>
    <div class="grid2"><section class="slab in"><h2>Which AI is working</h2><p class="sub">${esc(src)}</p><p class="note">${/^(Claude|Gemini)/.test(S.ai || '') ? 'It reads real invoice text.' : 'The stand-in is built to be easy to fool, so the defences get tested honestly. Setting GEMINI_API_KEY or ANTHROPIC_API_KEY switches to a real model.'}</p></section>
    <section class="slab in"><h2>Its key</h2><p class="sub">A key on your account that can call <b style="color:#fff">pay</b> on Trustpal and nothing else.</p>${S.agentPubKey ? cmdBox('agentpk', S.agentPubKey) : '<p class="note">Practice mode has no real key. On testnet its public key shows here.</p>'}</section></div>
    <section class="slab in"><h2>What it can do</h2><ul class="cc">${liI('Read invoices and emails you give it', true)}${liI('Propose payments', true)}${liI('Send a payment you approved, exactly as approved', true)}${liI('Pay people on your list, within your limits', true)}</ul></section>
    <section class="slab in"><h2>What it cannot do</h2><ul class="cc">${liI('Approve its own payments', false)}${liI('Change your limits, your list or your split', false)}${liI('Add keys, send money freely or call other contracts', false)}</ul>
      <p class="note" style="margin-top:12px">The network itself refused all six of those when we tried them with the agent's key.</p></section>
    <section class="slab in"><h2>Recent work</h2>${recent.length ? `<ul class="tl">${recent.map((a) => feedItem(a, true)).join('')}</ul>` : '<div class="empty">Nothing yet. Paste an invoice under Invoices.</div>'}</section>`;
  },
  activity() {
    return `<h1 class="in">Activity</h1>
    <p class="lede in">Everything the AI tried, and what happened. Each entry is chained to the one before, so editing an entry that is still in the log breaks the chain. It is not stored on the blockchain, so it is not a complete audit trail.</p>
    <p class="in"><button class="btn ghost sm" id="csv">Download records (CSV)</button></p>
    <p class="in"><span class="tag ${S.ledgerIntact ? 'paid' : 'stopped'}">${S.ledgerIntact ? 'Chain intact' : 'Chain broken'}</span> <span class="sub" style="display:inline;margin-left:8px">${S.ledgerLength} entries recorded by this app</span></p>
    <section class="slab in" style="margin-top:20px">${S.activity.length ? `<ul class="tl">${S.activity.map((a) => feedItem(a, true)).join('')}</ul>` : '<div class="empty">No activity yet.</div>'}</section>`;
  },
  security() {
    const A = [
      ['invoice', 'Poisoned invoice', 'An invoice hides an instruction telling the AI to pay a stranger. The guard should refuse.'],
      ['fraud', 'Fraud on an approved invoice', "A fake invoice reuses an approved reference but swaps in the attacker's address."],
      ['lookalike', 'Look-alike address', "The payee's name is one character off from someone you trust."],
      ['bypass', 'Guard switched off', 'We switch the guard off and call the contract directly. The contract still says no.'],
      ['overlimit', 'Over the limit', 'The AI asks for twice the per-payment limit, for a trusted contractor.'],
    ], N = [
      ['approved', 'Pay the approved invoice', 'The happy path: pay exactly what the owner approved.'],
      ['replay', 'Pay a paid invoice again', 'Try to pay an invoice that is already paid. Run the approved invoice first.'],
      ['legit', 'Pay an approved contractor', 'A normal payment to someone on your list, within limits.'],
    ], row = ([k, t, d]) => `<div class="atk"><div><h3>${t} <span class="tag ${EV[k] ? 'paid' : 'info'}" style="margin-left:8px;vertical-align:middle">${EV[k] ? 'Proven on testnet' : 'Tested offline'}</span></h3><p>${d}</p></div><button class="btn sm" data-s="${k}">Run</button><div class="out" id="out-${k}"></div></div>`;
    const keys = ['Send NEAR out of the account', 'Add a new key to the account', 'Pause or unpause the contract', 'Create its own approval', 'Change the revenue split', 'Call any other contract'];
    return `<h1 class="in">Security lab</h1>
    <p class="lede in">Try to rob the business. Each run travels along the path of four checks and stops where it is caught.</p>
    <section class="slab in"><div class="sechead" style="margin-bottom:4px"><h2>Attacks</h2><button class="btn ghost sm" id="runall">Run all five</button></div>${A.map(row).join('')}</section>
    <section class="slab in"><h2 style="margin-bottom:4px">Normal payments</h2>
      <p class="sub" style="margin:6px 0 10px">Which approved invoice should "Pay the approved invoice" and "Fraud" use? ${S.approvals.length ? `<select id="apref" style="margin-left:6px">${S.approvals.map((a) => `<option value="${esc(a.ref)}">${esc(a.ref)}: ${esc(a.amount)} NEAR to ${esc(a.to)}</option>`).join('')}</select>` : '<b>None open. Approve one on the Approvals screen first.</b>'}</p>${N.map(row).join('')}</section>
    <section class="slab in"><h2>What the AI's key can do</h2><p class="sub" style="margin-bottom:10px">The AI holds a restricted key that can call one thing: <b style="color:#fff">pay</b>. These actions were tried with it on testnet and refused by NEAR with a permission error.</p>
      <table class="keys">${keys.map((k) => `<tr><td>${k}</td><td><span class="tag stopped">Refused</span></td></tr>`).join('')}</table>
      <p class="sub" style="margin-top:12px">Reproduce with <code>npm run key-limits</code>. It prints the key's real permission from the network, counts only genuine permission errors, and reports network failures as inconclusive.</p></section>
    <div class="honest in"><b>What is real and what is not.</b> Payments, limits, approvals and the split are enforced by a contract on NEAR testnet. The look-alike check is an early-warning rule of thumb in the guard; the contract is the real boundary. Without an API key the AI is a scripted stand-in that obeys any instruction. Owner approvals are signed in your wallet; other owner changes run from the command line on testnet. The contract has not been audited and handles native NEAR only.</div>`;
  },
};

/* ================= owner actions ================= */
async function ownerDo(body, cmd, msg = 'Saved') {
  if (!S.canEdit) { await copy(cmd); toast('Command copied. Run it in your Codespace.'); return null; }
  const r = await api('/api/owner', { method: 'POST', body: JSON.stringify(body) });
  await refresh(); toast(msg); return r;
}
function rerender() { const y = scrollY; $('main').classList.add('still'); $('main').innerHTML = screens[route](); $('main').insertAdjacentHTML('afterbegin', ribbonHtml()); bind(route); bindWallet(); scrollTo(0, y); }
const num = (v) => { const s = String(v).trim(); return /^\d+(\.\d+)?$/.test(s) ? s : null; };

/* ================= wiring ================= */
let splitDraft = [];
function splitValidate() {
  const errs = []; let sum = 0; const seen = new Set();
  splitDraft.forEach((r, i) => {
    r.err = '';
    if (!ACCOUNT.test(r.who.trim()) || r.who.trim().length < 2) r.err = 'Enter a NEAR account name like name.testnet';
    else if (seen.has(r.who.trim())) r.err = 'This person is already in the list';
    seen.add(r.who.trim());
    const p = Number(r.pct);
    if (!r.err && !(p > 0 && p <= 100 && Math.abs(p * 100 - Math.round(p * 100)) < 1e-9)) r.err = 'Use a share above 0%, with at most two decimals';
    if (!r.err) sum += p; if (r.err) errs.push(r.err);
  });
  const total = Math.round(sum * 100) / 100;
  if (!errs.length && total > 100) errs.push('Shares add up to more than 100%');
  if (!splitDraft.length) errs.push('Add at least one person');
  return { errs, total, treasury: Math.round((100 - total) * 100) / 100 };
}
function splitCmd() { return cmdLine('split ' + splitDraft.map((r) => `${r.who.trim()}:${Math.round(Number(r.pct) * 100)}`).join(' ')); }
function splitSummary() {
  const v = splitValidate(); const ok = !v.errs.length;
  const parts = splitDraft.filter((r) => !r.err && Number(r.pct) > 0).map((r, i) => ({ who: r.who, pct: Number(r.pct), c: segColor(i) }));
  if (v.treasury > 0 && v.total <= 100) parts.push({ who: 'Kept in the treasury', pct: v.treasury, c: '#4CC2A1' });
  $('sbar').innerHTML = parts.map((p) => `<div class="seg" style="width:${p.pct}%;background:${p.c};color:${segText(p.c)};animation:none">${p.pct >= 10 ? p.pct + '%' : ''}</div>`).join('');
  $('snote').className = 'note ' + (ok ? 'good' : 'bad');
  $('snote').textContent = ok ? `You keep ${v.treasury}% in the treasury.` : v.errs[0];
  $('scmd').textContent = ok ? splitCmd() : 'Fix the highlighted fields to see the command.';
  const ap = $('sapply'); if (ap) ap.disabled = !ok;
  document.querySelectorAll('#splitrows input[data-f="who"]').forEach((el, i) => el.classList.toggle('bad', !!splitDraft[i].err));
}
function renderSplit() {
  $('splitwrap').innerHTML = `<div class="bar" id="sbar" role="img" aria-label="Preview of the split"></div><div id="splitrows">${splitDraft.map((r, i) => `<div class="srow"><input data-k="${i}" data-f="who" value="${esc(r.who)}" placeholder="name.testnet" aria-label="Account ${i + 1}"><div class="pctwrap"><input data-k="${i}" data-f="pct" value="${esc(r.pct)}" inputmode="decimal" aria-label="Share ${i + 1}"></div><button class="x" data-rm="${i}" aria-label="Remove">×</button></div>`).join('')}</div>
    <div class="row" style="margin-top:8px"><button class="btn ghost sm" id="sadd"${splitDraft.length >= 10 ? ' disabled' : ''}>Add a person</button>${S.canEdit ? '<button class="btn" id="sapply">Save split</button>' : ''}</div>
    <p class="note" id="snote"></p>${cmdBox('scmd', '')}`;
  document.querySelectorAll('#splitrows input').forEach((el) => el.addEventListener('input', () => { splitDraft[+el.dataset.k][el.dataset.f] = el.value; splitSummary(); }));
  document.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { splitDraft.splice(+b.dataset.rm, 1); renderSplit(); }));
  $('sadd').onclick = () => { splitDraft.push({ who: '', pct: '' }); renderSplit(); document.querySelectorAll('#splitrows input[data-f="who"]').forEach((e, i, a) => i === a.length - 1 && e.focus()); };
  const ap = $('sapply'); if (ap) ap.onclick = async () => { try { await ownerDo({ action: 'split', shares: splitDraft.map((r) => ({ account: r.who.trim(), bps: Math.round(Number(r.pct) * 100) })) }, splitCmd()); rerender(); } catch (e) { $('snote').className = 'note bad'; $('snote').textContent = e.message; } };
  splitSummary();
}
function renderPayees() {
  $('payees').innerHTML = S.recipients.length ? S.recipients.map((r) => `<div class="payee"><span class="mono" style="word-break:break-all">${esc(r)}</span><button class="btn ghost sm" data-del="${esc(r)}">Remove</button></div>`).join('') : '<div class="empty">No payees yet. The AI can only pay exact invoices you approve.</div>';
  document.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { try { if (await ownerDo({ action: 'recipient-remove', account: b.dataset.del }, cmdLine('recipient-remove ' + b.dataset.del), 'Payee removed')) rerender(); } catch (e) { $('perr').className = 'note bad'; $('perr').textContent = e.message; } }));
}
function bind(r) {
  document.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => copy($(b.dataset.copy).textContent)));
  if (r === 'overview') {
    const bal = $('bal'); countTo(bal, S.balance); lastBal = Number(S.balance);
    const len = 452.4, frac = Math.max(0, Math.min(1, Number(S.remainingToday) / Number(S.dailyCap || 1)));
    requestAnimationFrame(() => requestAnimationFrame(() => { $('ringp').style.strokeDashoffset = String(len * (1 - frac)); }));
  }
  if (r === 'invoices') {
    const clean = `INVOICE #2001 - Logo design - Total: 0.05 NEAR\nPay to: ${S.recipients[0] || 'contractor.testnet'}`;
    $('doc').value = S.sample; $('cleanbtn').onclick = () => { $('doc').value = clean; };
    $('readbtn').onclick = async (e) => {
      const b = e.currentTarget; if (busy) return; busy = true; b.disabled = true; b.textContent = 'Reading';
      try {
        const res = await api('/api/agent', { method: 'POST', body: $('doc').value, signal: AbortSignal.timeout(60000) }); await refresh();
        const acts = res.results.map((x) => S.activity.find((a) => a.id === x.id) || { outcome: 'info' });
        $('invres').innerHTML = res.results.length ? res.results.map((x, i) => { const a = acts[i] || { outcome: 'info' }; const [c, l] = tagFor(a.outcome); return `<div class="res" style="animation-delay:${i * 120}ms"><h3 class="num">${fmt(x.amount)} NEAR to ${esc(x.to)}</h3><span class="tag ${c}">${l}</span><span class="why">${esc(a.headline || x.status)}</span></div>`; }).join('') : `<div class="empty">${esc(res.note || 'The AI found no payments in this text.')}</div>`;
        for (const a of acts) if (a.id) await railPlay(a);
      } catch (err) { $('invres').innerHTML = `<div class="empty">Something went wrong: ${esc(err.message)}. Check the terminal running npm run web.</div>`; }
      b.disabled = false; b.textContent = 'Read this invoice'; busy = false;
    };
  }
  if (r === 'activity' && $('csv')) $('csv').onclick = exportCsv;
  if (r === 'approvals') {
    bindWalletApprove(); document.querySelectorAll('[data-cancel]').forEach((b) => { b.onclick = () => cancelWallet(b.dataset.cancel); });
    const upd = () => { const a = [$('aref').value.trim(), $('ato').value.trim(), $('aamt').value.trim()]; $('acmd').textContent = cmdLine(`approve ${a[0]} ${a[1]} ${a[2]} 7200`); };
    ['aref', 'ato', 'aamt'].forEach((i) => $(i).addEventListener('input', upd)); upd();
    const ap = $('aapply'); if (ap) ap.onclick = async () => { const amt = num($('aamt').value); if (!amt) { $('aerr').className = 'note bad'; $('aerr').textContent = 'Enter the amount as a number, like 0.5'; return; } try { await ownerDo({ action: 'approve', reference: $('aref').value, recipient: $('ato').value.trim(), amount: amt, seconds: 7200 }, '', 'Approved'); rerender(); } catch (e) { $('aerr').className = 'note bad'; $('aerr').textContent = e.message; } };
  }
  if (r === 'revenue') {
    const upd = () => { $('ccmd').textContent = cmdLine(`client-pay ${$('camt').value.trim() || '1'} "INV-3001"`); }; $('camt').addEventListener('input', upd); upd();
    const ap = $('capply'); if (ap) ap.onclick = async () => { const amt = num($('camt').value); if (!amt) { toast('Enter the amount as a number'); return; } try { const res = await ownerDo({ action: 'client-pay', amount: amt }, '', 'Client payment received'); await refresh(); const keep = res.retained; rerender(); $('cres').innerHTML = `<ul class="legend" style="margin-top:16px">${res.payouts.map((p) => `<li><span class="sw" style="background:#9BA8AB"></span><span>${esc(p.account)}</span><b>+${fmt(p.amount)} NEAR</b></li>`).join('')}<li><span class="sw" style="background:#4CC2A1"></span><span>Kept in the treasury</span><b>+${fmt(keep)} NEAR</b></li></ul>`; } catch (e) { toast(e.message); } };
  }
  if (r === 'owner') {
    splitDraft = S.split.map((x) => ({ who: x.who, pct: String(x.pct), err: '' })); renderSplit(); renderPayees();
    const lupd = () => { const mx = num($('lmax').value), cp = num($('lcap').value), cd = Number($('lcool').value), ok = mx && cp && cd >= 0 && Number.isFinite(cd);
      $('lcmd').textContent = ok ? cmdLine(`limits ${mx} ${cp}`) + '\n' + cmdLine(`cooldown ${Math.round(cd * 60)}`) : 'Enter numbers to see the command.';
      $('lerr').className = 'note'; $('lerr').textContent = ''; return ok; };
    ['lmax', 'lcap', 'lcool'].forEach((i) => $(i).addEventListener('input', lupd)); lupd();
    const la = $('lapply'); if (la) la.onclick = async () => { if (!lupd()) { $('lerr').className = 'note bad'; $('lerr').textContent = 'Enter numbers like 2 or 0.5'; return; } try { await ownerDo({ action: 'limits', max: num($('lmax').value), cap: num($('lcap').value) }, ''); await ownerDo({ action: 'cooldown', seconds: Math.round(Number($('lcool').value) * 60) }, '', 'Limits saved'); rerender(); } catch (e) { $('lerr').className = 'note bad'; $('lerr').textContent = e.message; } };
    $('padd').onclick = async () => { const a = $('pnew').value.trim(); if (!ACCOUNT.test(a) || a.length < 2) { $('perr').className = 'note bad'; $('perr').textContent = 'Enter a NEAR account name like name.testnet'; return; } try { if (await ownerDo({ action: 'recipient-add', account: a }, cmdLine('recipient-add ' + a), 'Payee added')) rerender(); } catch (e) { $('perr').className = 'note bad'; $('perr').textContent = e.message; } };
    const pc = () => { $('pcmd').textContent = cmdLine(S.paused ? 'unpause' : 'pause'); }; pc();
    $('pause').onclick = async () => { const next = !S.paused; try { if (await ownerDo({ action: 'pause', paused: next }, cmdLine(next ? 'pause' : 'unpause'), next ? 'Payments paused' : 'Payments resumed')) rerender(); } catch (e) { toast(e.message); } };
  }
  if (r === 'security') {
    const lock = (v) => document.querySelectorAll('[data-s],#runall').forEach((x) => (x.disabled = v));
    const runOne = async (k) => { const out = $('out-' + k); out.textContent = 'Running'; out.className = 'out'; const a = await api('/api/run?s=' + k + ($('apref') ? '&ref=' + encodeURIComponent($('apref').value) : ''), { method: 'POST' }); await railPlay(a); out.className = 'out ' + (a.outcome === 'stopped' ? 'bad' : a.outcome === 'paid' ? 'good' : ''); out.textContent = a.headline; };
    document.querySelectorAll('[data-s]').forEach((b) => (b.onclick = async () => { if (busy) return; busy = true; lock(true); try { await runOne(b.dataset.s); await refresh(); } catch (e) { $('out-' + b.dataset.s).textContent = 'Something went wrong: ' + e.message; } lock(false); busy = false; }));
    $('runall').onclick = async () => { if (busy) return; busy = true; lock(true); try { for (const k of ['invoice', 'fraud', 'lookalike', 'bypass', 'overlimit']) { await runOne(k); await sleep(700); } await refresh(); } catch (e) { toast(e.message); } lock(false); busy = false; };
  }
}

/* ================= shell ================= */
const sheet = $('sheet'), moreBtn = $('morebtn');
moreBtn.onclick = (e) => { e.stopPropagation(); sheet.classList.toggle('open'); };
addEventListener('click', (e) => { if (!sheet.contains(e.target)) sheet.classList.remove('open'); });
function placeNav() {
  moreBtn.classList.toggle('on', ['getpaid', 'agent', 'authority', 'revenue', 'activity', 'security'].includes(route));
  const a = document.querySelector('.nav a.on'), hl = $('navhl'); if (!a) return;
  hl.style.transform = `translateY(${a.parentElement.offsetTop}px)`; hl.style.opacity = 1;
}

function exportCsv() {
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const rows = [['time', 'mode', 'what', 'outcome', 'stopped_at', 'result', 'to', 'amount_near', 'transaction']];
  for (const a of S.activity) rows.push([new Date(a.at).toISOString(), a.mode, a.label, a.outcome, a.stoppedAt || '', a.headline, a.to || '', a.amount || '', a.tx || '']);
  const blob = new Blob([rows.map((r) => r.map(q).join(',')).join('\n')], { type: 'text/csv' });
  const u = document.createElement('a'); u.href = URL.createObjectURL(blob); u.download = 'trustpal-records.csv'; u.click(); setTimeout(() => URL.revokeObjectURL(u.href), 1000);
}
/* ---- wallet (real testnet transactions, signed inside the person's own wallet) ---- */
let walletAcct = null, walletErr = '', walletBusy = false;
const isOwnerAcct = () => walletAcct && S.walletOwner && walletAcct === S.walletOwner;
const explorerTx = (h) => `https://testnet.nearblocks.io/txns/${h}`;
function ribbonHtml() {
  const live = S.network === 'testnet';
  const chip = walletAcct
    ? `<span class="wchip on"><i></i><b>${esc(walletAcct)}</b><em>${isOwnerAcct() ? 'Owner' : 'View only'}</em><button id="wout" aria-label="Disconnect wallet">Disconnect</button></span>`
    : `<button class="wchip" id="wconn"><i></i>Connect wallet</button>`;
  return `<div class="ribbon ${live ? 'live' : ''}"><b>${live ? 'Live on NEAR testnet' : 'Practice mode'}</b><span>${live ? 'Test money only. You approve payments in your wallet.' : 'A simulation on your computer. Nothing here touches the network.'}</span>${chip}</div>`;
}
function bindWallet() {
  const c = $('wconn'), o = $('wout');
  if (c) c.onclick = () => { if (!window.TrustpalWallet || walletErr) { toast(walletErr || 'The wallet code is still loading'); return; } TrustpalWallet.connect(); };
  if (o) o.onclick = async () => { try { await TrustpalWallet.disconnect(); } catch { /* ignore */ } };
}
async function walletInit() {
  try { await refresh(); } catch { /* the server message is shown by show() */ }
  if (!window.TrustpalWallet) { walletErr = 'Wallet code did not load. Run npm run build:wallet.'; return; }
  try {
    const r = await TrustpalWallet.init(S.walletContract);
    walletAcct = TrustpalWallet.account();
    TrustpalWallet.onChange((a) => { walletAcct = a; refreshChrome(); });
    if (r.returnedTx) toast('Sent to testnet. See it in the activity list.');
    if (r.returnedTx) lastWalletTx = r.returnedTx;
    refreshChrome();
  } catch (e) { walletErr = 'Wallet could not start: ' + e.message; }
}
let lastWalletTx = '';
function refreshChrome() { const rb = document.querySelector('.ribbon'); if (rb) { rb.outerHTML = ribbonHtml(); bindWallet(); } if (route === 'approvals') rerender(); }
function walletApproveBlock() {
  if (S.network !== 'testnet') return `<p class="sub">Approving with a wallet works in live mode, where the dashboard reads your real contract on the NEAR test network. In practice mode, use the simulated approval below. See DEMO.md to start live mode.</p>`;
  if (walletErr) return `<p class="note bad">${esc(walletErr)}</p>`;
  const tx = lastWalletTx ? `<p class="note ok">Last transaction: <a href="${explorerTx(lastWalletTx)}" target="_blank" rel="noopener">${esc(lastWalletTx.slice(0, 10))}… on the NEAR testnet explorer</a></p>` : '';
  if (!walletAcct) return `<p class="sub">Connect the wallet that holds <b>${esc(S.walletOwner)}</b>. Nothing is sent until you confirm inside your wallet.</p><div class="row" style="margin-top:14px"><button class="btn" id="wconn2">Connect wallet</button></div>${tx}`;
  if (!isOwnerAcct()) return `<p class="sub">Connected as <b>${esc(walletAcct)}</b>. Only <b>${esc(S.walletOwner)}</b> can approve payments. This account can look around, and the contract would refuse an approval from it.</p>${tx}`;
  return `<p class="sub">You are signed in as the owner. Review the exact payment, then confirm it in your wallet. This is a <b>real test-network transaction</b>.</p>
    <div class="formgrid" style="margin-top:14px"><label>Valid for (hours)<input id="whrs" value="2" inputmode="decimal"></label></div>
    <div class="row" style="margin-top:14px"><button class="btn" id="wapprove">Review and approve</button></div>
    <p class="note" style="margin-top:10px">Wallet not working? Use the command under Advanced below.</p>
    <div class="confirm" id="wconfirm" hidden></div>${tx}`;
}
function bindWalletApprove() {
  const c2 = $('wconn2'); if (c2) c2.onclick = () => { if (walletErr) { toast(walletErr); return; } TrustpalWallet.connect(); };
  const ap = $('wapprove'); if (!ap) return;
  ap.onclick = () => {
    const ref = $('aref').value.trim(), to = $('ato').value.trim(), amt = $('aamt').value.trim(), hrs = parseFloat($('whrs').value);
    const bad = !ref ? 'Enter an invoice number' : !/^[a-z0-9._-]{2,64}$/.test(to) ? 'Enter the payee account, like alex.testnet' : !num(amt) ? 'Enter the amount as a number, like 0.5' : !(hrs > 0 && hrs <= 720) ? 'Valid for must be between 0 and 720 hours' : '';
    if (bad) { toast(bad); return; }
    const box = $('wconfirm'); box.hidden = false;
    box.innerHTML = `<h3>Check every line</h3><dl><div><dt>Invoice</dt><dd>${esc(ref)}</dd></div><div><dt>Pay to</dt><dd>${esc(to)}</dd></div><div><dt>Amount</dt><dd>${esc(amt)} NEAR</dd></div><div><dt>Valid for</dt><dd>${hrs} hours, one use</dd></div></dl><p class="note">The contract will pay exactly this and nothing else. If any line is wrong, cancel and fix it.</p><div class="row"><button class="btn" id="wgo">Confirm in my wallet</button><button class="btn ghost" id="wno">Cancel</button></div><p class="note" id="wmsg"></p>`;
    $('wno').onclick = () => { box.hidden = true; };
    $('wgo').onclick = async () => {
      if (walletBusy) return; walletBusy = true; $('wgo').disabled = true; $('wmsg').className = 'note'; $('wmsg').textContent = 'Waiting for your wallet…';
      try { const r = await TrustpalWallet.approvePayment({ reference: ref, recipient: to, amountNear: amt, seconds: Math.round(hrs * 3600) }); if (r.hash) lastWalletTx = r.hash; await refresh(); const ok = S.approvals.some((x) => x.ref === ref); toast(ok ? 'Approved on testnet' : 'The wallet returned, but the contract does not show this approval yet. Check the Approvals list in a few seconds.'); rerender(); }
      catch (e) { $('wmsg').className = 'note bad'; $('wmsg').textContent = friendlyWalletError(e.message); }
      walletBusy = false;
    };
  };
}
function friendlyWalletError(m) {
  if (/owner/i.test(m)) return 'The contract refused this: only the owner account can approve. Connect the owner wallet.';
  if (/already/i.test(m)) return 'The contract refused this: that invoice number was already used or approved. Use a new reference.';
  return 'The wallet or contract refused this: ' + m;
}
async function cancelWallet(ref) {
  if (!confirm(`Cancel the approval for ${ref}? The AI will no longer be able to pay it.`)) return;
  try { const r = await TrustpalWallet.cancelApproval(ref); if (r.hash) lastWalletTx = r.hash; toast('Approval cancelled'); await refresh(); rerender(); } catch (e) { toast(friendlyWalletError(e.message)); }
}

async function show() {
  route = (location.hash.slice(1) in screens) ? location.hash.slice(1) : 'overview';
  document.body.dataset.route = route;
  document.querySelectorAll('[data-r]').forEach((a) => a.classList.toggle('on', a.dataset.r === route)); placeNav();
  try { await refresh(); } catch { $('main').innerHTML = '<div class="empty">Can\'t reach the Trustpal server. Is <code>npm run web</code> still running?</div>'; return; }
  document.body.dataset.route = route; layoutRail();
  const m = $('main'); m.classList.remove('still'); m.innerHTML = screens[route]();
  m.insertAdjacentHTML('afterbegin', ribbonHtml());
  m.querySelectorAll('.in').forEach((el, i) => el.style.setProperty('--i', i)); bind(route); bindWallet(); scrollTo(0, 0);
}
addEventListener('hashchange', () => { sheet.classList.remove('open'); show(); });
addEventListener('resize', () => { layoutRail(); placeNav(); });
if (window.ResizeObserver) new ResizeObserver(layoutRail).observe(stackEl);
if (!reduced && matchMedia('(pointer:fine)').matches) {
  const amb = document.querySelector('.ambient'); let raf = 0;
  addEventListener('pointermove', (e) => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; amb.style.setProperty('--mx', e.clientX + 'px'); amb.style.setProperty('--my', e.clientY + 'px'); }); });
}
layoutRail();
(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { layoutRail(); placeNav(); });
walletInit().then(() => show()).then(() => { layoutRail(); placeNav(); let seen = false; try { seen = !!sessionStorage.getItem('seen'); sessionStorage.setItem('seen', '1'); } catch { /* ignore */ } if (!seen) railIdle(); });
