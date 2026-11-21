const STORAGE_KEY = 'voice-rights-demo-v1';

const demo = {
  project: '咖啡店春季促销广告',
  producer: '南岸制作工作室',
  voiceActor: '林岚（演示配音员）',
  reviewer: '周岑（声誉审查机构）',
  scripts: {
    v1: { label: '第一版台词', text: '第二杯半价，今天就来坐坐。' },
    v2: { label: '第二版台词', text: '第二杯免费，今天就来坐坐。' },
  },
  audio: {
    v1: { name: 'coffee-ad-v1-demo.wav', src: 'assets/coffee-ad-v1-demo.wav' },
    v2: { name: 'coffee-ad-v2-demo.wav', src: 'assets/coffee-ad-v2-demo.wav' },
  },
};

const monad = { rpcUrl: 'https://testnet-rpc.monad.xyz', chainId: 10143, contractAddress: '0x2C58E09Ec80503354B5b18D1F45223ACd7395e75', status: 'deployed' };

const freshState = () => ({
  page: 'authorize',
  role: 'voice',
  authorization: { id: 'AUTH-20261121-001', scriptVersion: 'v1', usage: '门店视频与短视频投放', validUntil: '2026-12-31', status: 'active', signer: demo.voiceActor, tx: '0xauth_demo_v1' },
  submissions: [],
  approvals: [],
  selectedSubmission: null,
  verify: { receipt: null, file: null, result: null },
  notice: null,
});

let state = loadState();

function loadState() {
  try { return { ...freshState(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; }
  catch { return freshState(); }
}
function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }
function shortHash(hash = '') { return hash.length > 25 ? `${hash.slice(0, 12)}…${hash.slice(-8)}` : hash; }
async function sha256Bytes(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function hashText(text) { return sha256Bytes(new TextEncoder().encode(text)); }
function nowLabel() { return new Intl.DateTimeFormat('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }).format(new Date()); }
function txId(prefix) { return `${prefix}_${Math.random().toString(16).slice(2, 12)}`; }
function setNotice(kind, title, detail) { state.notice = { kind, title, detail }; persist(); render(); }
function clearNotice() { state.notice = null; }
function currentAuth() { return state.authorization; }
function activeApproval() { return state.approvals.find(a => a.status === 'approved'); }
function selectedSubmission() { return state.submissions.find(s => s.id === state.selectedSubmission) || state.submissions[0]; }

function render() {
  const app = document.querySelector('#app');
  app.innerHTML = `
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">声</div><div class="brand-copy"><div class="brand-name">声证 / VOICE PROOF</div><div class="brand-sub">授权 · 审查 · 核验</div></div></div>
      <div><div class="side-label">工作台</div><nav class="nav">${navButton('authorize','01','授权确认')} ${navButton('submit','02','上传送审')} ${navButton('review','03','机构审核')} ${navButton('verify','04','独立核验')}</nav></div>
      <div class="sidebar-spacer"></div>
      <div class="project-chip">当前项目<br><strong>${escapeHtml(demo.project)}</strong></div>
      <div class="network-card"><div class="network-row"><span>记录网络</span><span class="network-value"><i class="dot" id="rpcDot"></i><span id="rpcState">RPC 检查中</span></span></div><div class="network-row"><span>Monad 测试网</span><span class="network-value" id="chainState">10143 · 合约待部署</span></div></div>
    </aside>
    <main class="main">
      <header class="topbar"><div class="crumb">项目 / ${escapeHtml(demo.project)} / <strong>${pageTitle()}</strong></div><div class="role-switcher"><span>当前角色</span><select id="roleSelect"><option value="voice" ${state.role==='voice'?'selected':''}>配音员 · 林岚</option><option value="producer" ${state.role==='producer'?'selected':''}>制作方 · 南岸工作室</option><option value="reviewer" ${state.role==='reviewer'?'selected':''}>审核员 · 周岑</option><option value="recipient" ${state.role==='recipient'?'selected':''}>接收方 · 独立核验</option></select></div></header>
      <section class="content">${pageMarkup()}</section>
    </main>
    ${state.notice ? `<div class="toast" role="status"><strong>${escapeHtml(state.notice.title)}</strong><div>${escapeHtml(state.notice.detail)}</div></div>` : ''}
  `;
  bindEvents();
}

function navButton(page, index, label) { return `<button class="${state.page===page?'active':''}" data-page="${page}"><span class="nav-index">${index}</span><span>${label}</span></button>`; }
function pageTitle() { return ({authorize:'授权确认', submit:'上传送审', review:'机构审核', verify:'独立核验'})[state.page]; }
function pageMarkup() {
  const head = `<div class="page-head"><div><div class="eyebrow">${state.page === 'verify' ? 'Proof / 04' : `Workflow / 0${['authorize','submit','review','verify'].indexOf(state.page)+1}`}</div><h1>${({authorize:'先确认，<br>再让声音出门。',submit:'让每一份成品<br>都有出处。',review:'审核的是这一份，<br>不是“差不多”。',verify:'收到的文件，<br>和回执一致吗？'})[state.page]}</h1><p class="lede">${({authorize:'配音员确认项目、台词版本、用途与期限，形成可追溯的授权单。',submit:'制作方只能提交与当前授权匹配的台词版本，文件会生成唯一指纹。',review:'第三方机构试听具体成品，作出通过或驳回决定，并签发审查回执。',verify:'接收方重新计算音频指纹，与链上记录的已审文件做逐字节比对。'})[state.page]}</p></div><div class="head-status"><strong>${statusHeadline()}</strong><small>${statusSubline()}</small></div></div>`;
  return `${head}<div class="steps">${stepMarkup()}</div>${state.page === 'authorize' ? authorizePage() : state.page === 'submit' ? submitPage() : state.page === 'review' ? reviewPage() : verifyPage()}`;
}
function stepMarkup() { const pages=['authorize','submit','review','verify']; const current=pages.indexOf(state.page); return pages.map((p,i)=>`<div class="step ${i===current?'active':''} ${i<current?'done':''}"><div class="step-num">0${i+1}</div><div class="step-title">${['签发授权','上传送审','审核签发','独立核验'][i]}</div><div class="step-desc">${['配音员确认范围','制作方提交成品','机构给出决定','接收方查文件'][i]}</div></div>`).join(''); }
function statusHeadline() { if (state.page==='authorize') return state.authorization.scriptVersion === 'v2' ? '双版本授权已就绪' : '第一版授权已就绪'; if (state.page==='submit') return state.submissions.length ? '已有送审记录' : '等待成品送审'; if (state.page==='review') return activeApproval() ? '审核已签发' : '等待机构决定'; return state.verify.result === 'match' ? '文件匹配' : state.verify.result === 'mismatch' ? '文件不匹配' : '等待导入回执'; }
function statusSubline() { if (state.page==='authorize') return `当前授权 ${state.authorization.id}`; if (state.page==='submit') return `${state.submissions.length} 份成品进入记录`; if (state.page==='review') return activeApproval() ? '审核结果已写入演示账本' : '选择一份具体成品试听'; return '重新计算本地文件指纹'; }

function authorizePage() {
  const auth = currentAuth(); const v2 = auth.scriptVersion === 'v2';
  return `<div class="grid"><div class="card pad"><div class="card-title"><div><h2>授权单 ${escapeHtml(auth.id)}</h2><p>授权签发后，台词版本和用途会成为送审门槛。</p></div><span class="badge teal">${v2?'有效 · 第二版':'有效 · 第一版'}</span></div><div class="field-grid"><div class="field"><label>配音员</label><input disabled value="${escapeHtml(demo.voiceActor)}"></div><div class="field"><label>制作方</label><input disabled value="${escapeHtml(demo.producer)}"></div><div class="field"><label>项目</label><input disabled value="${escapeHtml(demo.project)}"></div><div class="field"><label>用途与渠道</label><input id="usageInput" value="${escapeHtml(auth.usage)}"></div><div class="field"><label>有效期至</label><input id="validUntilInput" type="date" value="${escapeHtml(auth.validUntil)}"></div><div class="field"><label>签发网络</label><input disabled value="Monad Testnet · 演示账本"></div></div><div class="section-label">本次确认的台词版本</div><div class="script-box"><div class="script-meta"><span>${escapeHtml(demo.scripts[auth.scriptVersion].label)}</span><span class="badge ${v2?'copper':'neutral'}">${auth.scriptVersion.toUpperCase()}</span></div><div class="script-text">“${escapeHtml(demo.scripts[auth.scriptVersion].text)}”</div></div><div class="actions"><button class="btn copper" id="signV2">${v2?'已签发第二版授权':'签发第二版授权'}</button><button class="btn ghost" id="saveAuth">保存授权信息</button></div><div class="notice info" style="margin-top:16px"><span class="notice-icon">◎</span><div><strong>链下材料保留在平台外</strong>原始录音、台词正文与审核材料不会写入链上；这里只记录授权编号、版本、用途和状态。</div></div></div><div class="rail"><div class="card pad"><div class="card-title"><div><h2>授权范围</h2><p>审核员会按这些字段核对。</p></div></div><div class="audit-list"><div class="audit-item done"><strong><span class="timeline-dot"></span>项目已锁定</strong><small>${escapeHtml(demo.project)}</small></div><div class="audit-item ${v2?'done':'pending'}"><strong><span class="timeline-dot" style="background:${v2?'var(--teal)':'var(--amber)'}"></span>台词版本 ${v2?'v1 + v2':'v1'}</strong><small>${v2?'两版授权可分别送审':'第二版仍需要单独授权'}</small></div><div class="audit-item done"><strong><span class="timeline-dot"></span>有效期</strong><small>${escapeHtml(auth.validUntil)} 前有效</small></div></div></div>${ledgerCard()}</div></div>`;
}

function submitPage() {
  const auth = currentAuth(); const selected = selectedSubmission();
  return `<div class="grid"><div class="card pad"><div class="card-title"><div><h2>成品送审</h2><p>先选台词版本，再关联对应授权单。</p></div><span class="badge ${auth.scriptVersion==='v2'?'teal':'amber'}">${auth.scriptVersion==='v2'?'可提交 v1 / v2':'仅可提交 v1'}</span></div><div class="field-grid"><div class="field"><label>选择台词版本</label><select id="scriptVersionSelect"><option value="v1">第一版 · “${escapeHtml(demo.scripts.v1.text)}”</option><option value="v2">第二版 · “${escapeHtml(demo.scripts.v2.text)}”${auth.scriptVersion==='v2'?'':'（当前授权未覆盖）'}</option></select></div><div class="field"><label>关联授权单</label><input disabled value="${escapeHtml(auth.id)} · ${auth.scriptVersion.toUpperCase()}"></div></div><div class="section-label">上传外部制作好的音频</div><div class="upload-zone" id="uploadZone"><div class="upload-icon">↥</div><strong>拖入音频，或点击选择</strong><p>支持 WAV / MP3 / M4A · 文件只在本地浏览器内处理</p><input type="file" id="audioInput" accept="audio/*" hidden><button class="btn ghost" id="chooseAudio" style="margin-top:14px">选择音频文件</button></div>${selected ? `<div class="file-chip"><div><strong>${escapeHtml(selected.fileName)}</strong><small>指纹 ${escapeHtml(shortHash(selected.fileHash))}</small></div><span class="badge ${selected.status==='pending'?'amber':selected.status==='approved'?'teal':'copper'}">${selected.status==='pending'?'待审核':selected.status==='approved'?'已通过':'已驳回'}</span></div>`:''}<div class="actions"><button class="btn copper" id="submitReview" ${selected && selected.status==='pending'?'disabled':''}>正式送审</button><button class="btn ghost" id="loadSample">载入演示音频</button></div><div id="submitNotice" style="margin-top:16px"></div></div><div class="rail">${ledgerCard()}<div class="card pad"><div class="card-title"><div><h2>送审记录</h2><p>每一份文件都有独立指纹。</p></div></div>${state.submissions.length ? state.submissions.map(s=>`<div class="ledger-line" style="border-top-color:var(--line)"><span>${escapeHtml(s.scriptVersion.toUpperCase())} · ${escapeHtml(s.fileName)}</span><strong class="mono" style="color:var(--ink)">${escapeHtml(shortHash(s.fileHash))}</strong></div>`).join('') : '<div class="empty">还没有送审成品</div>'}</div></div></div>`;
}

function reviewPage() {
  const s = selectedSubmission(); const a = activeApproval();
  return `<div class="grid"><div class="card pad"><div class="card-title"><div><h2>机构审查队列</h2><p>试听、核对台词，再对这一个文件作决定。</p></div><span class="badge ${a?'teal':'amber'}">${a?'已签发':'待处理'}</span></div>${s ? `<div class="script-box"><div class="script-meta"><span>${escapeHtml(s.fileName)}</span><span class="badge neutral">${escapeHtml(s.scriptVersion.toUpperCase())}</span></div><div class="script-text" style="font-size:16px">“${escapeHtml(demo.scripts[s.scriptVersion].text)}”</div><div class="detail-grid"><div class="detail"><small>上传人</small><strong>${escapeHtml(demo.producer)}</strong></div><div class="detail"><small>文件指纹</small><strong class="mono">${escapeHtml(shortHash(s.fileHash))}</strong></div><div class="detail"><small>关联授权</small><strong>${escapeHtml(s.authorizationId)}</strong></div><div class="detail"><small>送审时间</small><strong>${escapeHtml(s.submittedAt)}</strong></div></div><div class="actions"><button class="btn ghost" id="playSample">▶ 播放演示音频</button><button class="btn copper" id="approveSubmission" ${a?'disabled':''}>${a?'已通过':'审核通过并签发回执'}</button><button class="btn ghost" id="rejectSubmission" ${a?'disabled':''}>驳回</button></div></div>` : '<div class="empty">暂无送审文件。先在“上传送审”完成提交。</div>'}</div><div class="rail"><div class="card pad"><div class="card-title"><div><h2>审核准则</h2><p>业务判断发生在机构侧。</p></div></div><div class="audit-list"><div class="audit-item done"><strong>授权范围匹配</strong><small>项目、用途、有效期与台词版本一致。</small></div><div class="audit-item done"><strong>实际读词核对</strong><small>试听文件与选定台词版本一致。</small></div><div class="audit-item pending"><strong>机构签发</strong><small>${a?'结果已写入演示账本。':'通过后生成不可混用的回执。'}</small></div></div></div>${ledgerCard()}</div></div>`;
}

function verifyPage() {
  const a = activeApproval(); const result = state.verify.result; const r = state.verify.receipt;
  return `<div class="grid"><div class="card pad"><div class="card-title"><div><h2>独立核验</h2><p>导入回执与收到的音频，重新计算文件指纹。</p></div><span class="badge ${result==='match'?'teal':result==='mismatch'?'copper':'neutral'}">${result==='match'?'匹配':result==='mismatch'?'不匹配':'待核验'}</span></div>${a ? `<div class="field"><label>已签发回执</label><select id="receiptSelect"><option value="${escapeHtml(a.receiptId)}">${escapeHtml(a.receiptId)} · ${escapeHtml(a.fileName)}</option></select></div><div class="section-label">收到的音频文件</div><div class="upload-zone" id="verifyZone"><div class="upload-icon">⌁</div><strong>导入要核验的音频</strong><p>可导入获批文件，或载入另一份演示文件观察不匹配。</p><input type="file" id="verifyInput" accept="audio/*" hidden><button class="btn ghost" id="chooseVerify" style="margin-top:14px">选择音频文件</button></div><div class="actions"><button class="btn copper" id="verifyMatchSample">载入获批文件并核验</button><button class="btn ghost" id="verifyOtherSample">换成另一份文件</button></div>${result ? verifyResultMarkup(a) : ''}` : `<div class="notice error"><span class="notice-icon">!</span><div><strong>还没有可核验的回执</strong>先让审核员通过一份送审成品，系统才会生成交付回执。</div></div>`}</div><div class="rail">${receiptCard(a)}<div class="card pad"><div class="card-title"><div><h2>核验说明</h2><p>平台只判断文件是否为已审的那一份。</p></div></div><div class="audit-list"><div class="audit-item done"><strong>授权方</strong><small>${escapeHtml(demo.voiceActor)}</small></div><div class="audit-item done"><strong>审查机构</strong><small>${escapeHtml(demo.reviewer)}</small></div><div class="audit-item ${result?'done':'pending'}"><strong>文件指纹</strong><small>${result==='match'?'重新计算结果与回执一致。':result==='mismatch'?'指纹不同，不能沿用原审核结果。':'等待导入文件。'}</small></div></div></div></div></div>`;
}

function ledgerCard() { const a=currentAuth(); const deployed=Boolean(monad.contractAddress); return `<div class="ledger"><div class="card-title"><div><h2>共享记录</h2><p>${deployed ? 'Monad Testnet · Chain 10143' : '演示账本 · 等待部署'}</p></div><span class="badge ${deployed?'teal':'amber'}">${deployed?'已部署':'待部署'}</span></div><div class="ledger-line"><span>授权签发</span><strong class="mono">${escapeHtml(a.tx || '待签发')}</strong></div><div class="ledger-line"><span>当前状态</span><strong>${a.status==='active'?'有效':'已失效'}</strong></div><div class="ledger-line"><span>合约地址</span><strong class="mono">${deployed?escapeHtml(shortHash(monad.contractAddress)):'未配置'}</strong></div><div class="ledger-line"><span>链上写入</span><strong>${deployed?'真实合约':'本地模拟'}</strong></div></div>`; }
function receiptCard(a) { return `<div class="ledger"><div class="card-title"><div><h2>交付回执</h2><p>审核通过后自动生成</p></div><span class="badge ${a?'teal':'neutral'}">${a?'已签发':'未生成'}</span></div>${a ? `<div class="ledger-line"><span>回执编号</span><strong class="mono">${escapeHtml(a.receiptId)}</strong></div><div class="ledger-line"><span>文件指纹</span><strong class="mono">${escapeHtml(shortHash(a.fileHash))}</strong></div><div class="ledger-line"><span>审核员</span><strong>${escapeHtml(demo.reviewer)}</strong></div><div class="ledger-line"><span>签发时间</span><strong>${escapeHtml(a.approvedAt)}</strong></div>` : '<div class="empty" style="color:#9ca5b2">没有已签发回执</div>'}</div>`; }
function verifyResultMarkup(a) { const match=state.verify.result==='match'; return `<div class="verify-result ${match?'match':'mismatch'}" style="margin-top:16px"><div class="result-icon">${match?'✓':'×'}</div><h3>${match?'文件匹配，审核结果有效':'文件不匹配，不能沿用这张回执'}</h3><p>${match?'收到的文件指纹与机构已审文件一致，可以向品牌方交付。':'回执仍然属于原文件；当前文件指纹不同，必须重新送审。'}</p><div class="detail-grid"><div class="detail"><small>回执指纹</small><strong class="mono">${escapeHtml(shortHash(a.fileHash))}</strong></div><div class="detail"><small>当前文件指纹</small><strong class="mono">${escapeHtml(shortHash(state.verify.file?.hash || ''))}</strong></div></div></div>`; }

function bindEvents() {
  document.querySelectorAll('[data-page]').forEach(b => b.addEventListener('click', () => { state.page=b.dataset.page; clearNotice(); persist(); render(); }));
  document.querySelector('#roleSelect')?.addEventListener('change', e => { state.role=e.target.value; const target={voice:'authorize',producer:'submit',reviewer:'review',recipient:'verify'}[state.role]; state.page=target; persist(); render(); });
  document.querySelector('#signV2')?.addEventListener('click', () => { state.authorization = {...state.authorization, scriptVersion:'v2', tx:txId('0xauth_demo_v2')}; setNotice('info','第二版授权已签发','现在可以选择 v2 成品送审。'); });
  document.querySelector('#saveAuth')?.addEventListener('click', () => { state.authorization.usage=document.querySelector('#usageInput').value.trim() || state.authorization.usage; state.authorization.validUntil=document.querySelector('#validUntilInput').value || state.authorization.validUntil; setNotice('info','授权信息已保存','授权编号和适用范围已更新到本地演示账本。'); });
  const input=document.querySelector('#audioInput'); const zone=document.querySelector('#uploadZone');
  document.querySelector('#chooseAudio')?.addEventListener('click', () => input?.click()); input?.addEventListener('change', e => handleAudio(e.target.files?.[0]));
  zone?.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); }); zone?.addEventListener('dragleave', () => zone.classList.remove('dragover')); zone?.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); handleAudio(e.dataTransfer.files?.[0]); });
  document.querySelector('#loadSample')?.addEventListener('click', async () => { const v=document.querySelector('#scriptVersionSelect').value; const sample=await getDemoAudio(v); handleAudio(sample); });
  document.querySelector('#submitReview')?.addEventListener('click', submitForReview);
  document.querySelectorAll('[data-submission]').forEach(b => b.addEventListener('click', () => { state.selectedSubmission=b.dataset.submission; persist(); render(); }));
  document.querySelector('#approveSubmission')?.addEventListener('click', approve);
  document.querySelector('#rejectSubmission')?.addEventListener('click', reject);
  document.querySelector('#playSample')?.addEventListener('click', () => playDemoAudio(selectedSubmission()?.scriptVersion || 'v1'));
  const vi=document.querySelector('#verifyInput'); const vz=document.querySelector('#verifyZone'); document.querySelector('#chooseVerify')?.addEventListener('click',()=>vi?.click()); vi?.addEventListener('change',e=>handleVerifyFile(e.target.files?.[0])); vz?.addEventListener('dragover',e=>{e.preventDefault();vz.classList.add('dragover')}); vz?.addEventListener('dragleave',()=>vz.classList.remove('dragover')); vz?.addEventListener('drop',e=>{e.preventDefault();vz.classList.remove('dragover');handleVerifyFile(e.dataTransfer.files?.[0])});
  document.querySelector('#verifyMatchSample')?.addEventListener('click', () => setVerifySample('match'));
  document.querySelector('#verifyOtherSample')?.addEventListener('click', () => setVerifySample('mismatch'));
}

async function getDemoAudio(version) { const sample = demo.audio[version]; const response = await fetch(sample.src); if (!response.ok) throw new Error(`演示音频加载失败: ${response.status}`); const buffer = await response.arrayBuffer(); return { name: sample.name, size: buffer.byteLength, arrayBuffer: async () => buffer, demoVersion: version }; }
async function handleAudio(file) { if(!file) return; const buffer=await file.arrayBuffer(); const hash=await sha256Bytes(buffer); window.__pendingAudio={fileName:file.name, fileSize:file.size || buffer.byteLength, fileHash:hash, demoVersion:file.demoVersion || null}; const zone=document.querySelector('#uploadZone'); if(zone) zone.innerHTML=`<div class="upload-icon">✓</div><strong>${escapeHtml(file.name)}</strong><p>已计算文件指纹 ${escapeHtml(shortHash(hash))}</p>`; }
async function submitForReview() { const version=document.querySelector('#scriptVersionSelect')?.value || 'v1'; const auth=currentAuth(); if(version !== auth.scriptVersion && !(auth.scriptVersion==='v2' && version==='v1')) { setNotice('error','缺少匹配授权','当前授权只覆盖第一版台词；第二版必须先单独签发授权。'); return; } if(!window.__pendingAudio) { setNotice('error','还没有音频文件','先载入演示音频或选择一份外部成品。'); return; } const p=window.__pendingAudio; const submission={id:`SUB-${Date.now()}`,scriptVersion:version,authorizationId:auth.id,fileName:p.fileName,fileHash:p.fileHash,fileSize:p.fileSize,submittedAt:nowLabel(),status:'pending'}; state.submissions=[submission,...state.submissions]; state.selectedSubmission=submission.id; window.__pendingAudio=null; persist(); setNotice('info','已正式送审','文件指纹已锁定，审核员可以开始试听。'); }
function approve() { const s=selectedSubmission(); if(!s) return; const approval={...s,status:'approved',receiptId:`RCPT-${Date.now().toString().slice(-8)}`,approvedAt:nowLabel(),reviewer:demo.reviewer,tx:txId('0xreview_demo')}; state.approvals=[approval,...state.approvals.filter(a=>a.id!==s.id)]; state.submissions=state.submissions.map(x=>x.id===s.id?{...x,status:'approved'}:x); persist(); setNotice('info','审核通过并签发回执','接收方现在可以在独立核验页比对文件。'); }
function reject() { const s=selectedSubmission(); if(!s) return; state.submissions=state.submissions.map(x=>x.id===s.id?{...x,status:'rejected'}:x); persist(); setNotice('error','已驳回这份成品','请重新制作并提交新的文件。'); }
function handleVerifyFile(file) { if(!file) return; file.arrayBuffer().then(async b=>{state.verify.file={name:file.name,hash:await sha256Bytes(b)};state.verify.result=null;persist();render();}); }
async function setVerifySample(kind) { const a=activeApproval(); if(!a) return; const v=kind==='match'?a.scriptVersion:(a.scriptVersion==='v1'?'v2':'v1'); const sample=await getDemoAudio(v); const hash=await sha256Bytes(await sample.arrayBuffer()); state.verify.file={name:sample.name,hash}; state.verify.result=hash===a.fileHash?'match':'mismatch'; persist(); render(); }
function playDemoAudio(version) { const audio = new Audio(demo.audio[version].src); audio.play().catch(() => setNotice('error','浏览器阻止了自动播放','请点击页面中的音频控件或再次点击播放。')); }
async function syncMonadStatus() { try { const cfg = await fetch('monad-config.json').then(r => r.json()); Object.assign(monad, cfg); const res = await fetch(monad.rpcUrl, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]}) }); const payload = await res.json(); const chainId = Number.parseInt(payload.result, 16); const rpcState = document.querySelector('#rpcState'); const chainState = document.querySelector('#chainState'); const dot = document.querySelector('#rpcDot'); if (rpcState) rpcState.textContent = chainId === monad.chainId ? 'RPC 已连通' : '链 ID 不匹配'; if (chainState) chainState.textContent = `${chainId} · ${monad.contractAddress ? '合约已部署' : '合约待部署'}`; if (dot) dot.style.background = chainId === monad.chainId ? 'var(--teal)' : 'var(--copper)'; } catch { const rpcState = document.querySelector('#rpcState'); if (rpcState) rpcState.textContent = 'RPC 不可用'; } }

render();
syncMonadStatus();
