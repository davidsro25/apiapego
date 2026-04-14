import { FastifyInstance } from 'fastify'
import { InstanceService } from '../services/instance.service'
import { query } from '../database/db'
import QRCode from 'qrcode'

const STATUS_BADGE: Record<string, string> = {
  connected:    'background:#16a34a;color:#fff',
  qr:           'background:#d97706;color:#fff',
  connecting:   'background:#2563eb;color:#fff',
  disconnected: 'background:#dc2626;color:#fff',
}
const STATUS_LABEL: Record<string, string> = {
  connected:    'Conectado',
  qr:           'Aguardando QR',
  connecting:   'Conectando...',
  disconnected: 'Desconectado',
}

function authCheck(request: any, reply: any, GLOBAL_KEY: string): boolean {
  const rawCookie = (request.cookies as any)?.dash_key
  const cookieKey = rawCookie ? decodeURIComponent(rawCookie) : null
  if (cookieKey !== GLOBAL_KEY) {
    reply.redirect('/dashboard')
    return false
  }
  return true
}

const BASE_STYLE = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0f1e;color:#fff;font-family:system-ui,sans-serif;min-height:100vh}
a{color:inherit;text-decoration:none}
header{background:#111827;border-bottom:1px solid #1f2937;padding:14px 28px;display:flex;align-items:center;gap:16px}
header h1{font-size:18px;color:#6366f1;font-weight:700;flex:1}
.badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600}
.back{background:#1f2937;border:none;border-radius:8px;padding:8px 14px;color:#9ca3af;cursor:pointer;font-size:13px}
.back:hover{color:#fff;background:#374151}
main{padding:28px;max-width:1100px;margin:0 auto}
.tabs{display:flex;gap:4px;margin-bottom:24px;background:#111827;border-radius:10px;padding:4px;flex-wrap:wrap}
.tab{flex:1;min-width:80px;padding:9px 10px;text-align:center;border:none;background:transparent;color:#6b7280;cursor:pointer;border-radius:8px;font-size:12px;font-weight:600;transition:all .15s}
.tab.active{background:#6366f1;color:#fff}
.tab:hover:not(.active){background:#1f2937;color:#e5e7eb}
.panel{display:none}.panel.active{display:block}
.card{background:#111827;border-radius:12px;padding:24px;margin-bottom:16px}
.card h3{font-size:15px;color:#e5e7eb;margin-bottom:16px;font-weight:600}
label{display:block;font-size:13px;color:#9ca3af;margin-bottom:6px;margin-top:14px}
label:first-child{margin-top:0}
input,textarea,select{width:100%;background:#1f2937;border:1px solid #374151;border-radius:8px;padding:10px 14px;color:#fff;font-size:14px;outline:none;font-family:inherit}
input:focus,textarea:focus,select:focus{border-color:#6366f1}
textarea{resize:vertical;min-height:80px}
.row{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap}
.row>*{flex:1;min-width:120px}
.row>.btn-action{flex:0 0 auto}
.btn-action{background:#6366f1;border:none;border-radius:8px;padding:10px 20px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap}
.btn-action:hover{background:#4f46e5}
.btn-danger{background:#991b1b!important}.btn-danger:hover{background:#7f1d1d!important}
.btn-gray{background:#374151!important}.btn-gray:hover{background:#4b5563!important}
.btn-green{background:#15803d!important}.btn-green:hover{background:#166534!important}
.btn-sm{padding:6px 12px!important;font-size:12px!important}
.result{margin-top:12px;background:#0f172a;border:1px solid #1f2937;border-radius:8px;padding:12px;font-size:13px;color:#94a3b8;font-family:monospace;white-space:pre-wrap;word-break:break-all;display:none}
.result.ok{border-color:#16a34a;color:#86efac}
.result.err{border-color:#dc2626;color:#fca5a5}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:12px;color:#6b7280;padding:8px 12px;text-transform:uppercase;border-bottom:1px solid #1f2937}
td{padding:10px 12px;font-size:13px;border-bottom:1px solid #0f172a;vertical-align:middle}
tr:last-child td{border-bottom:none}
.key-val{font-family:monospace;font-size:12px;color:#a5b4fc;cursor:pointer}
.check-row{display:flex;align-items:center;gap:8px;margin-top:8px}
.check-row input[type=checkbox]{width:auto;cursor:pointer}
.check-row label{margin:0;cursor:pointer;color:#e5e7eb;font-size:13px}
#toast{position:fixed;bottom:24px;right:24px;background:#1f2937;border:1px solid #22c55e;border-radius:10px;padding:12px 20px;font-size:14px;color:#fff;display:none;z-index:200}
.section-title{font-size:13px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:.05em;margin:20px 0 12px;padding-top:16px;border-top:1px solid #1f2937}
.section-title:first-child{margin-top:0;padding-top:0;border-top:none}
`

export async function dashboardRoutes(app: FastifyInstance) {

  // POST /dashboard/login
  app.post('/dashboard/login', {
    schema: { hide: true },
    config: { skipAuth: true }
  }, async (request: any, reply: any) => {
    const GLOBAL_KEY = process.env.GLOBAL_API_KEY || 'apego@ApiKey2024#Secure'
    const body = request.body as any
    const key = body?.key || ''
    if (key === GLOBAL_KEY) {
      reply.setCookie('dash_key', key, { path: '/', httpOnly: true, maxAge: 86400 * 7, sameSite: 'lax' })
      return reply.redirect('/dashboard')
    }
    return reply.redirect('/dashboard?erro=1')
  })

  // GET /dashboard — lista instâncias
  app.get('/dashboard', {
    schema: { hide: true },
    config: { skipAuth: true }
  }, async (request: any, reply: any) => {
    const GLOBAL_KEY = process.env.GLOBAL_API_KEY || 'apego@ApiKey2024#Secure'
    const queryKey = (request.query as any)?.key
    const erro = (request.query as any)?.erro
    const rawCookie = (request.cookies as any)?.dash_key
    const cookieKey = rawCookie ? decodeURIComponent(rawCookie) : null
    const apiKey = queryKey || cookieKey

    if (apiKey !== GLOBAL_KEY) {
      const erroMsg = erro ? '<p style="color:#f87171;margin-top:8px">Chave inválida</p>' : ''
      return reply.type('text/html').send(`<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ApiApego — Login</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0f1e;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#111827;border-radius:16px;padding:40px;width:100%;max-width:380px;box-shadow:0 8px 32px rgba(0,0,0,.5)}
h2{font-size:22px;margin-bottom:8px;color:#6366f1}
p{color:#9ca3af;font-size:13px;margin-bottom:24px}
input{width:100%;background:#1f2937;border:1px solid #374151;border-radius:8px;padding:12px 16px;color:#fff;font-size:15px;outline:none}
input:focus{border-color:#6366f1}
button{width:100%;margin-top:12px;background:#6366f1;border:none;border-radius:8px;padding:12px;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
button:hover{background:#4f46e5}
</style></head><body>
<div class="card">
<h2>ApiApego Dashboard</h2>
<p>Digite a API Key para acessar o painel</p>
<form method="POST" action="/dashboard/login">
<input type="password" name="key" placeholder="API Key">
<button type="submit">Entrar</button>
</form>
${erroMsg}
</div>
</body></html>`)
    }

    if (queryKey) {
      reply.setCookie('dash_key', queryKey, { path: '/', httpOnly: true, maxAge: 86400 * 7, sameSite: 'lax' })
      return reply.redirect('/dashboard')
    }

    const instances = await InstanceService.list()

    const rows = instances.map(inst => {
      const status = inst.status || 'disconnected'
      const badge = STATUS_BADGE[status] || STATUS_BADGE.disconnected
      const label = STATUS_LABEL[status] || status
      const canQr = status !== 'connected'
      const qrBtn = canQr ? `<a class="btn btn-qr" href="/qr/${inst.id}" target="_blank">QR Code</a>` : ''
      const subBadge = inst.subscription_active
        ? '<span class="badge" style="background:#1e3a5f;color:#93c5fd;font-size:10px">Ativo</span>'
        : '<span class="badge" style="background:#3b1515;color:#fca5a5;font-size:10px">Inativo</span>'
      return `<tr id="row-${inst.id}">
        <td><div class="name">${inst.name}</div><div class="phone">${inst.phone || inst.profile_name || '—'}</div></td>
        <td><span class="badge" style="${badge}">${label}</span></td>
        <td>${subBadge}</td>
        <td class="actions">
          <a class="btn btn-cfg" href="/dashboard/instance/${inst.id}">Configurar</a>
          ${qrBtn}
          <button class="btn btn-restart" onclick="doAction('${inst.id}','restart')">Restart</button>
          <button class="btn btn-del" onclick="doAction('${inst.id}','delete')">Deletar</button>
        </td>
      </tr>`
    }).join('')

    const empty = instances.length === 0
      ? '<tr><td colspan="4" style="text-align:center;color:#6b7280;padding:40px">Nenhuma instância criada</td></tr>'
      : ''

    return reply.type('text/html').send(`<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ApiApego — Dashboard</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0f1e;color:#fff;font-family:system-ui,sans-serif;min-height:100vh}
header{background:#111827;border-bottom:1px solid #1f2937;padding:16px 32px;display:flex;align-items:center;justify-content:space-between}
header h1{font-size:20px;color:#6366f1;font-weight:700}
header span{color:#6b7280;font-size:13px}
main{padding:32px;max-width:1100px;margin:0 auto}
.topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}
.topbar h2{font-size:18px;color:#e5e7eb}
.btn-new{background:#6366f1;border:none;border-radius:8px;padding:10px 20px;color:#fff;font-size:14px;font-weight:600;cursor:pointer}
.btn-new:hover{background:#4f46e5}
table{width:100%;border-collapse:collapse;background:#111827;border-radius:12px;overflow:hidden}
th{background:#1f2937;padding:14px 20px;text-align:left;font-size:13px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
td{padding:16px 20px;border-bottom:1px solid #1f2937;vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:hover td{background:#1a2235}
.name{font-weight:600;color:#e5e7eb;font-size:15px}
.phone{color:#6b7280;font-size:13px;margin-top:2px}
.badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600}
.actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.btn{border:none;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;transition:opacity .15s}
.btn:hover{opacity:.8}
.btn-cfg{background:#6366f1;color:#fff}
.btn-qr{background:#0e7490;color:#fff}
.btn-restart{background:#1d4ed8;color:#fff}
.btn-del{background:#991b1b;color:#fff}
.modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:100;align-items:center;justify-content:center}
.modal-bg.open{display:flex}
.modal{background:#111827;border-radius:16px;padding:32px;width:100%;max-width:440px}
.modal h3{font-size:18px;margin-bottom:16px}
.modal label{display:block;font-size:13px;color:#9ca3af;margin-bottom:6px}
.modal input,.modal select{width:100%;background:#1f2937;border:1px solid #374151;border-radius:8px;padding:10px 14px;color:#fff;font-size:14px;outline:none;margin-bottom:14px}
.modal-btns{display:flex;gap:8px;justify-content:flex-end}
.btn-cancel{background:#374151;color:#fff;padding:8px 18px;border:none;border-radius:8px;cursor:pointer;font-size:14px}
.btn-create{background:#6366f1;color:#fff;padding:8px 18px;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600}
#toast{position:fixed;bottom:24px;right:24px;background:#1f2937;border:1px solid #22c55e;border-radius:10px;padding:12px 20px;font-size:14px;color:#fff;display:none;z-index:200}
</style></head><body>
<header>
  <h1>ApiApego Dashboard</h1>
  <span>Gerenciamento de Instâncias WhatsApp</span>
</header>
<main>
  <div class="topbar">
    <h2>Instâncias (${instances.length})</h2>
    <button class="btn-new" onclick="openModal()">+ Nova Instância</button>
  </div>
  <table>
    <thead><tr><th>Instância</th><th>Status</th><th>Assinatura</th><th>Ações</th></tr></thead>
    <tbody id="tbody">${rows}${empty}</tbody>
  </table>
</main>
<div class="modal-bg" id="modal">
  <div class="modal">
    <h3>Nova Instância</h3>
    <label>Nome (sem espaços)</label>
    <input type="text" id="inst-name" placeholder="ex: cliente-joao">
    <label>Webhook URL (opcional)</label>
    <input type="url" id="inst-webhook" placeholder="https://...">
    <label>Provider</label>
    <select id="inst-provider"><option value="baileys">Baileys (WhatsApp)</option><option value="meta">Meta (API oficial)</option></select>
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeModal()">Cancelar</button>
      <button class="btn-create" onclick="createInstance()">Criar</button>
    </div>
  </div>
</div>
<div id="toast"></div>
<script>
var K='${GLOBAL_KEY}';
function toast(msg,ok){var t=document.getElementById('toast');t.textContent=msg;t.style.display='block';t.style.borderColor=ok===false?'#ef4444':'#22c55e';setTimeout(function(){t.style.display='none'},3500);}
function doAction(id,action){
  if(action==='delete'&&!confirm('Deletar esta instância?'))return;
  var map={restart:{method:'POST',url:'/api/instances/'+id+'/restart'},delete:{method:'DELETE',url:'/api/instances/'+id}};
  var opt=map[action];
  fetch(opt.url,{method:opt.method,headers:{'x-api-key':K}}).then(function(r){
    if(!r.ok){r.json().then(function(e){toast('Erro: '+(e.message||r.status),false)});return;}
    toast(action==='delete'?'Deletada':'Restart iniciado');
    if(action==='delete'){var row=document.getElementById('row-'+id);if(row)row.remove();}
    else setTimeout(function(){location.reload()},2000);
  }).catch(function(){toast('Erro de rede',false)});
}
function openModal(){document.getElementById('modal').classList.add('open');}
function closeModal(){document.getElementById('modal').classList.remove('open');}
document.getElementById('modal').addEventListener('click',function(e){if(e.target===e.currentTarget)closeModal();});
function createInstance(){
  var name=document.getElementById('inst-name').value.trim().replace(/\\s/g,'-').toLowerCase();
  var webhook=document.getElementById('inst-webhook').value.trim();
  var provider=document.getElementById('inst-provider').value;
  if(!name){toast('Nome obrigatório',false);return;}
  var body={name:name,provider:provider};if(webhook)body.webhookUrl=webhook;
  fetch('/api/instances',{method:'POST',headers:{'x-api-key':K,'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){
    if(!r.ok){r.json().then(function(e){toast('Erro: '+(e.message||r.status),false)});return;}
    toast('Criada!');setTimeout(function(){location.reload()},1500);
  }).catch(function(){toast('Erro de rede',false)});
}
setTimeout(function(){location.reload()},20000);
</script>
</body></html>`)
  })

  // GET /dashboard/instance/:id — página de configuração da instância
  app.get('/dashboard/instance/:id', {
    schema: { hide: true },
    config: { skipAuth: true }
  }, async (request: any, reply: any) => {
    const GLOBAL_KEY = process.env.GLOBAL_API_KEY || 'apego@ApiKey2024#Secure'
    if (!authCheck(request, reply, GLOBAL_KEY)) return

    const inst = await InstanceService.get(request.params.id)
    if (!inst) return reply.redirect('/dashboard')

    const { qr, status } = await InstanceService.getQr(inst.id)
    const badge = STATUS_BADGE[status] || STATUS_BADGE.disconnected
    const label = STATUS_LABEL[status] || status

    let qrHtml = ''
    if (status === 'connected') {
      qrHtml = `<div style="text-align:center;padding:40px">
        <div style="font-size:64px">✅</div>
        <h3 style="margin-top:12px;color:#22c55e">WhatsApp Conectado</h3>
        <p style="color:#6b7280;margin-top:4px">${inst.phone || inst.profile_name || ''}</p>
      </div>`
    } else if (qr) {
      const qrDataUrl = await QRCode.toDataURL(qr, { width: 260, margin: 2 })
      qrHtml = `<div style="text-align:center;padding:20px">
        <p style="color:#d97706;margin-bottom:12px">Escaneie com o WhatsApp → Dispositivos Conectados</p>
        <img src="${qrDataUrl}" width="260" style="border-radius:8px">
        <p style="color:#6b7280;font-size:12px;margin-top:8px">QR expira em ~20s — atualize se necessário</p>
        <button class="btn-action" style="margin-top:12px" onclick="location.reload()">Atualizar QR</button>
      </div>`
    } else {
      qrHtml = `<div style="text-align:center;padding:40px">
        <div style="font-size:48px">⏳</div>
        <p style="color:#9ca3af;margin-top:12px">Gerando QR Code...</p>
        <button class="btn-action" style="margin-top:12px" onclick="location.reload()">Atualizar</button>
      </div>`
    }

    const WEBHOOK_EVENTS = ['messages', 'status', 'connection', 'qr', 'reaction', 'groups', 'contacts', 'presence', 'call', 'chats', 'labels']
    const currentWhEvents: string[] = inst.webhook_events || []
    const currentWsEvents: string[] = (inst as any).ws_events || ['messages', 'connection', 'qr', 'presence', 'call']
    const webhookEventChecks = WEBHOOK_EVENTS.map(e =>
      `<div class="check-row"><input type="checkbox" id="whev-${e}" ${currentWhEvents.includes(e) || currentWhEvents.includes('all') ? 'checked' : ''}><label for="whev-${e}">${e}</label></div>`
    ).join('')
    const wsEventChecks = WEBHOOK_EVENTS.map(e =>
      `<div class="check-row"><input type="checkbox" id="wsev-${e}" ${currentWsEvents.includes(e) || currentWsEvents.includes('all') ? 'checked' : ''}><label for="wsev-${e}">${e}</label></div>`
    ).join('')

    const apiKeys = await query('SELECT id, key, name, active, created_at FROM api_keys ORDER BY created_at DESC')
    const keyRows = (apiKeys as any[]).map((k: any) => `
      <tr>
        <td>${k.name}</td>
        <td><span class="key-val" onclick="copyKey('${k.key}')" title="Clique para copiar">${k.key.substring(0, 20)}...</span></td>
        <td><span class="badge" style="${k.active ? 'background:#15803d' : 'background:#7f1d1d'};color:#fff">${k.active ? 'Ativa' : 'Revogada'}</span></td>
        <td>${new Date(k.created_at).toLocaleDateString('pt-BR')}</td>
        <td>${k.active ? `<button class="btn-action btn-sm btn-danger" onclick="revokeKey('${k.id}')">Revogar</button>` : ''}</td>
      </tr>`).join('')

    const instApiKey = inst.api_key
    const s = inst.settings as any || {}
    const proxyUrl = (inst as any).proxy_url || ''
    const subActive = inst.subscription_active

    return reply.type('text/html').send(`<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ApiApego — ${inst.name}</title>
<style>${BASE_STYLE}</style>
</head><body>
<header>
  <button class="back" onclick="location.href='/dashboard'">← Voltar</button>
  <h1>${inst.name}</h1>
  <span class="badge" style="${badge}">${label}</span>
</header>
<main>
  <div class="tabs">
    <button class="tab active" onclick="switchTab('status',this)">Status</button>
    <button class="tab" onclick="switchTab('webhook',this)">Webhook</button>
    <button class="tab" onclick="switchTab('websocket',this)">WebSocket</button>
    <button class="tab" onclick="switchTab('enviar',this)">Enviar</button>
    <button class="tab" onclick="switchTab('grupos',this)">Grupos</button>
    <button class="tab" onclick="switchTab('perfil',this)">Perfil</button>
    <button class="tab" onclick="switchTab('config',this)">Configurações</button>
    <button class="tab" onclick="switchTab('historico',this)">Histórico</button>
    <button class="tab" onclick="switchTab('apikeys',this)">API Keys</button>
  </div>

  <!-- STATUS -->
  <div id="tab-status" class="panel active">
    <div class="card">
      <h3>Conexão WhatsApp</h3>
      ${qrHtml}
      <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
        <button class="btn-action btn-gray" onclick="doAction('restart')">↺ Restart</button>
        <button class="btn-action btn-danger" onclick="doAction('logout')">⏏ Logout</button>
      </div>
    </div>
    <div class="card">
      <h3>Informações</h3>
      <table>
        <tr><td style="color:#6b7280;width:160px">ID</td><td style="font-family:monospace;font-size:12px">${inst.id}</td></tr>
        <tr><td style="color:#6b7280">Nome</td><td>${inst.name}</td></tr>
        <tr><td style="color:#6b7280">Telefone</td><td>${inst.phone || '—'}</td></tr>
        <tr><td style="color:#6b7280">Perfil</td><td>${inst.profile_name || '—'}</td></tr>
        <tr><td style="color:#6b7280">Provider</td><td>${inst.provider}</td></tr>
        <tr><td style="color:#6b7280">Assinatura</td><td>
          <span class="badge" style="${subActive ? 'background:#15803d' : 'background:#7f1d1d'};color:#fff">${subActive ? 'Ativa' : 'Desativada'}</span>
          <button class="btn-action btn-sm" style="margin-left:8px" onclick="toggleSub(${!subActive})">${subActive ? 'Desativar' : 'Ativar'}</button>
        </td></tr>
        <tr><td style="color:#6b7280">Proxy</td><td style="font-family:monospace;font-size:12px">${proxyUrl || '—'}</td></tr>
        <tr><td style="color:#6b7280">API Key da instância</td><td><span class="key-val" onclick="copyKey('${instApiKey}')" title="Clique para copiar">${instApiKey}</span></td></tr>
        <tr><td style="color:#6b7280">Criada em</td><td>${new Date(inst.created_at).toLocaleString('pt-BR')}</td></tr>
      </table>
    </div>
  </div>

  <!-- WEBHOOK -->
  <div id="tab-webhook" class="panel">
    <div class="card">
      <h3>Configurar Webhook</h3>
      <div class="check-row" style="margin-bottom:16px">
        <input type="checkbox" id="wh-enabled" ${inst.webhook_enabled !== false ? 'checked' : ''}>
        <label for="wh-enabled" style="color:#e5e7eb;font-size:14px">Webhook ativo</label>
      </div>
      <label>URL do Webhook</label>
      <input type="url" id="wh-url" placeholder="https://seusite.com/webhook" value="${inst.webhook_url || ''}">
      <label>Eventos recebidos</label>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:4px;margin-top:4px">
        ${webhookEventChecks}
        <div class="check-row"><input type="checkbox" id="whev-all" ${currentWhEvents.includes('all') ? 'checked' : ''}><label for="whev-all"><b>all (todos)</b></label></div>
      </div>
      <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-action" onclick="saveWebhook()">Salvar Webhook</button>
      </div>
      <div class="result" id="wh-result"></div>
    </div>
    <div class="card">
      <h3>Testar Webhook</h3>
      <p style="color:#6b7280;font-size:13px">Envia um payload de teste para a URL configurada acima.</p>
      <button class="btn-action btn-green" style="margin-top:12px" onclick="testWebhook()">Enviar Teste</button>
      <div class="result" id="wh-test-result"></div>
    </div>
  </div>

  <!-- WEBSOCKET -->
  <div id="tab-websocket" class="panel">
    <div class="card">
      <h3>Conexão WebSocket</h3>
      <p style="color:#6b7280;font-size:13px;margin-bottom:16px">Conexão persistente para receber eventos em tempo real com baixa latência.</p>
      <label>URL do WebSocket</label>
      <div style="display:flex;align-items:center;gap:8px;background:#0f172a;border-radius:8px;padding:12px;margin-bottom:16px">
        <span style="font-family:monospace;font-size:13px;color:#a5b4fc;flex:1" id="ws-url">wss://apiapego.apego.app.br/api/instances/${inst.name}/ws</span>
        <button class="btn-action btn-sm" onclick="copyKey(document.getElementById('ws-url').textContent)">Copiar</button>
      </div>
      <label>Eventos recebidos via WebSocket</label>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:4px;margin-top:4px">
        ${wsEventChecks}
        <div class="check-row"><input type="checkbox" id="wsev-all" ${currentWsEvents.includes('all') ? 'checked' : ''}><label for="wsev-all"><b>all (todos)</b></label></div>
      </div>
      <div style="margin-top:16px">
        <button class="btn-action" onclick="saveWsConfig()">Salvar Configuração WS</button>
      </div>
      <div class="result" id="ws-result"></div>
    </div>
    <div class="card">
      <h3>Testar WebSocket</h3>
      <p style="color:#6b7280;font-size:13px;margin-bottom:12px">Conecta ao WebSocket e mostra os eventos recebidos em tempo real.</p>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button class="btn-action btn-green" onclick="startWsTest()" id="ws-test-btn">Conectar</button>
        <button class="btn-action btn-danger" onclick="stopWsTest()" id="ws-stop-btn" style="display:none">Desconectar</button>
      </div>
      <div id="ws-log" style="background:#0f172a;border:1px solid #1f2937;border-radius:8px;padding:12px;min-height:120px;max-height:300px;overflow-y:auto;font-family:monospace;font-size:12px;color:#94a3b8">
        <em style="color:#6b7280">Clique em Conectar para iniciar...</em>
      </div>
    </div>
  </div>

  <!-- ENVIAR -->
  <div id="tab-enviar" class="panel">
    <div class="card">
      <h3>Enviar Mensagem</h3>
      <label>Para (número com DDI)</label>
      <input type="text" id="msg-to" placeholder="5511999999999">
      <label>Tipo</label>
      <select id="msg-type" onchange="onTypeChange()">
        <option value="text">Texto</option>
        <option value="image">Imagem</option>
        <option value="video">Vídeo</option>
        <option value="audio">Áudio / PTT</option>
        <option value="document">Documento</option>
        <option value="location">Localização</option>
        <option value="sticker">Sticker</option>
        <option value="reaction">Reação (Emoji)</option>
        <option value="buttons">Botões Simples</option>
        <option value="list">Lista de Opções</option>
        <option value="poll">Enquete</option>
        <option value="carousel">Carrossel</option>
      </select>

      <div id="field-text">
        <label>Texto</label>
        <textarea id="msg-text" placeholder="Digite sua mensagem..."></textarea>
      </div>
      <div id="field-media" style="display:none">
        <label>URL da mídia</label>
        <input type="url" id="msg-media" placeholder="https://...">
        <label>Legenda (opcional)</label>
        <input type="text" id="msg-caption" placeholder="Legenda...">
        <div id="field-ptt" style="display:none">
          <div class="check-row" style="margin-top:8px">
            <input type="checkbox" id="msg-ptt">
            <label for="msg-ptt">Enviar como nota de voz (PTT)</label>
          </div>
        </div>
      </div>
      <div id="field-doc" style="display:none">
        <label>URL do documento</label>
        <input type="url" id="msg-doc" placeholder="https://...">
        <label>Nome do arquivo</label>
        <input type="text" id="msg-filename" placeholder="arquivo.pdf">
      </div>
      <div id="field-loc" style="display:none">
        <label>Latitude</label>
        <input type="number" id="msg-lat" placeholder="-23.5505" step="any">
        <label>Longitude</label>
        <input type="number" id="msg-lng" placeholder="-46.6333" step="any">
        <label>Nome do local (opcional)</label>
        <input type="text" id="msg-locname" placeholder="São Paulo, SP">
      </div>
      <div id="field-reaction" style="display:none">
        <label>ID da Mensagem</label>
        <input type="text" id="msg-reactid" placeholder="ID da mensagem">
        <label>Emoji</label>
        <input type="text" id="msg-emoji" placeholder="👍" maxlength="4">
      </div>
      <div id="field-buttons" style="display:none">
        <label>Texto principal</label>
        <textarea id="msg-btn-text" placeholder="Mensagem com botões..."></textarea>
        <label>Rodapé (opcional)</label>
        <input type="text" id="msg-btn-footer" placeholder="Rodapé">
        <label>Botões (JSON — máx 3)</label>
        <textarea id="msg-btn-buttons" placeholder='[{"id":"btn1","text":"Opção 1"},{"id":"btn2","text":"Opção 2"}]'>[{"id":"btn1","text":"Opção 1"},{"id":"btn2","text":"Opção 2"}]</textarea>
      </div>
      <div id="field-list" style="display:none">
        <label>Título</label>
        <input type="text" id="msg-list-title" placeholder="Cardápio">
        <label>Texto</label>
        <textarea id="msg-list-text" placeholder="Escolha uma opção:"></textarea>
        <label>Texto do botão</label>
        <input type="text" id="msg-list-btntext" placeholder="Ver opções" value="Ver opções">
        <label>Seções (JSON)</label>
        <textarea id="msg-list-sections" placeholder='[{"title":"Categoria","rows":[{"id":"r1","title":"Item 1","description":"Desc"}]}]'>[{"title":"Categoria","rows":[{"id":"r1","title":"Item 1","description":"Descrição opcional"}]}]</textarea>
      </div>
      <div id="field-poll" style="display:none">
        <label>Pergunta da Enquete</label>
        <input type="text" id="msg-poll-name" placeholder="Qual o melhor horário?">
        <label>Opções (uma por linha, mín 2)</label>
        <textarea id="msg-poll-values" placeholder="Manhã&#10;Tarde&#10;Noite">Manhã
Tarde
Noite</textarea>
        <label>Respostas permitidas</label>
        <input type="number" id="msg-poll-count" value="1" min="0" max="12" placeholder="1 (0 = ilimitado)">
      </div>
      <div id="field-carousel" style="display:none">
        <label>Cards (JSON)</label>
        <textarea id="msg-carousel-cards" rows="8" placeholder='[{"title":"Produto 1","body":"Descrição","footer":"Rodapé","image":"https://...","buttons":[{"id":"b1","text":"Ver mais","url":"https://..."}]}]'>[{"title":"Produto 1","body":"Descrição do produto","footer":"R$ 49,90","image":"https://picsum.photos/300/200","buttons":[{"id":"b1","text":"Comprar","url":"https://exemplo.com"},{"id":"b2","text":"Saiba mais"}]}]</textarea>
      </div>

      <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
        <button class="btn-action" onclick="sendMsg()">Enviar</button>
        <button class="btn-action btn-gray" onclick="checkNum()">Verificar Número</button>
      </div>
      <div class="result" id="msg-result"></div>
    </div>

    <div class="card">
      <h3>Ações em Mensagens</h3>
      <div class="section-title">Deletar Mensagem</div>
      <div class="row">
        <div><label>Para</label><input type="text" id="del-to" placeholder="5511999999999"></div>
        <div><label>ID da mensagem</label><input type="text" id="del-msgid" placeholder="ID"></div>
      </div>
      <div class="check-row" style="margin-top:8px">
        <input type="checkbox" id="del-forall" checked>
        <label for="del-forall">Deletar para todos</label>
      </div>
      <button class="btn-action btn-danger" style="margin-top:12px" onclick="deleteMsg()">Deletar Mensagem</button>
      <div class="result" id="del-result"></div>

      <div class="section-title">Editar Mensagem</div>
      <label>Para</label><input type="text" id="edit-to" placeholder="5511999999999">
      <label>ID da mensagem</label><input type="text" id="edit-msgid" placeholder="ID">
      <label>Novo texto</label><textarea id="edit-text" placeholder="Novo conteúdo da mensagem..."></textarea>
      <button class="btn-action" style="margin-top:12px" onclick="editMsg()">Editar Mensagem</button>
      <div class="result" id="edit-result"></div>

      <div class="section-title">Marcar como Lido</div>
      <label>JID remoto (ex: 5511...@s.whatsapp.net)</label>
      <input type="text" id="read-jid" placeholder="5511999999999@s.whatsapp.net">
      <label>ID da mensagem</label>
      <input type="text" id="read-msgid" placeholder="ID">
      <button class="btn-action btn-green" style="margin-top:12px" onclick="readMsg()">Marcar como Lido</button>
      <div class="result" id="read-result"></div>
    </div>
  </div>

  <!-- GRUPOS -->
  <div id="tab-grupos" class="panel">
    <div class="card">
      <h3>Grupos da Instância</h3>
      <button class="btn-action" onclick="loadGroups()">Carregar Grupos</button>
      <div id="groups-result" style="margin-top:16px"></div>
    </div>
    <div class="card">
      <h3>Criar Grupo</h3>
      <label>Nome do grupo</label>
      <input type="text" id="grp-name" placeholder="Meu Grupo">
      <label>Participantes (um por linha, com DDI)</label>
      <textarea id="grp-participants" placeholder="5511999999999&#10;5511888888888"></textarea>
      <button class="btn-action" style="margin-top:12px" onclick="createGroup()">Criar Grupo</button>
      <div class="result" id="grp-create-result"></div>
    </div>
    <div class="card">
      <h3>Gerenciar Grupo</h3>
      <label>ID do Grupo</label>
      <input type="text" id="grp-id" placeholder="120363xxxxxx@g.us ou só o número">
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn-action btn-sm" onclick="getGroupMeta()">Metadados</button>
        <button class="btn-action btn-sm" onclick="getGroupInvite()">Link Convite</button>
        <button class="btn-action btn-sm btn-danger" onclick="leaveGroup()">Sair do Grupo</button>
      </div>
      <div class="result" id="grp-meta-result"></div>

      <div class="section-title">Gerenciar Participantes</div>
      <label>Ação</label>
      <select id="grp-paction">
        <option value="add">Adicionar</option>
        <option value="remove">Remover</option>
        <option value="promote">Promover a Admin</option>
        <option value="demote">Rebaixar de Admin</option>
      </select>
      <label>Participantes (um por linha)</label>
      <textarea id="grp-plist" placeholder="5511999999999&#10;5511888888888"></textarea>
      <button class="btn-action" style="margin-top:12px" onclick="manageParticipants()">Executar</button>
      <div class="result" id="grp-part-result"></div>

      <div class="section-title">Configurar Grupo</div>
      <label>Nome do grupo</label>
      <input type="text" id="grp-subject" placeholder="Novo nome">
      <label>Descrição</label>
      <textarea id="grp-desc" placeholder="Nova descrição"></textarea>
      <div class="check-row" style="margin-top:8px">
        <input type="checkbox" id="grp-announce">
        <label for="grp-announce">Somente admins enviam mensagens</label>
      </div>
      <div class="check-row" style="margin-top:4px">
        <input type="checkbox" id="grp-restrict">
        <label for="grp-restrict">Somente admins editam informações</label>
      </div>
      <button class="btn-action" style="margin-top:12px" onclick="updateGroupSettings()">Salvar Configurações do Grupo</button>
      <div class="result" id="grp-settings-result"></div>
    </div>
  </div>

  <!-- PERFIL & CONTATOS -->
  <div id="tab-perfil" class="panel">
    <div class="card">
      <h3>Perfil WhatsApp</h3>
      <div class="section-title">Ver Foto de Perfil</div>
      <label>Número (deixe vazio para ver o próprio)</label>
      <input type="text" id="pp-phone" placeholder="5511999999999 (opcional)">
      <button class="btn-action" style="margin-top:12px" onclick="getProfilePic()">Ver Foto</button>
      <div id="pp-result" style="margin-top:12px"></div>

      <div class="section-title">Atualizar Foto de Perfil</div>
      <label>URL ou base64 da nova foto</label>
      <input type="text" id="pp-image" placeholder="https://... ou data:image/jpeg;base64,...">
      <button class="btn-action" style="margin-top:12px" onclick="updateProfilePic()">Atualizar Foto</button>
      <div class="result" id="pp-update-result"></div>

      <div class="section-title">Atualizar Status/Bio</div>
      <input type="text" id="prof-status" placeholder="Disponível para atendimento" value="">
      <button class="btn-action" style="margin-top:12px" onclick="updateProfileStatus()">Atualizar Bio</button>
      <div class="result" id="prof-status-result"></div>

      <div class="section-title">Atualizar Nome</div>
      <input type="text" id="prof-name" placeholder="Novo nome (máx 25 chars)" value="${inst.profile_name || ''}">
      <button class="btn-action" style="margin-top:12px" onclick="updateProfileName()">Atualizar Nome</button>
      <div class="result" id="prof-name-result"></div>
    </div>
    <div class="card">
      <h3>Contatos & Bloqueios</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        <button class="btn-action" onclick="loadContacts()">Ver Contatos</button>
        <button class="btn-action btn-gray" onclick="loadBlocked()">Ver Bloqueados</button>
      </div>
      <div id="contacts-result" style="margin-top:8px"></div>

      <div class="section-title">Bloquear / Desbloquear</div>
      <label>Número</label>
      <input type="text" id="block-phone" placeholder="5511999999999">
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn-action btn-danger" onclick="blockContact('block')">Bloquear</button>
        <button class="btn-action btn-green" onclick="blockContact('unblock')">Desbloquear</button>
      </div>
      <div class="result" id="block-result"></div>
    </div>
    <div class="card">
      <h3>Labels (Etiquetas)</h3>
      <button class="btn-action" onclick="loadLabels()">Carregar Etiquetas</button>
      <div id="labels-result" style="margin-top:12px"></div>
      <div class="section-title">Aplicar Etiqueta</div>
      <label>JID do chat</label>
      <input type="text" id="lbl-jid" placeholder="5511999999999@s.whatsapp.net">
      <label>ID da etiqueta</label>
      <input type="text" id="lbl-id" placeholder="1">
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn-action btn-green" onclick="manageLabel('add')">Adicionar</button>
        <button class="btn-action btn-danger" onclick="manageLabel('remove')">Remover</button>
      </div>
      <div class="result" id="lbl-result"></div>
    </div>
    <div class="card">
      <h3>Presença</h3>
      <label>Para (número)</label>
      <input type="text" id="pres-to" placeholder="5511999999999">
      <label>Tipo</label>
      <select id="pres-type">
        <option value="composing">Digitando...</option>
        <option value="recording">Gravando áudio...</option>
        <option value="paused">Pausado</option>
        <option value="available">Online</option>
        <option value="unavailable">Offline</option>
      </select>
      <button class="btn-action" style="margin-top:12px" onclick="sendPresence()">Enviar Presença</button>
      <div class="result" id="pres-result"></div>
    </div>
  </div>

  <!-- CONFIGURAÇÕES -->
  <div id="tab-config" class="panel">
    <div class="card">
      <h3>Comportamento Automático</h3>
      <label>Delay entre mensagens (ms)</label>
      <input type="number" id="cfg-delay" placeholder="0" value="${s.messageDelay || 0}">
      <div class="check-row" style="margin-top:12px">
        <input type="checkbox" id="cfg-rejectcall" ${s.rejectCalls ? 'checked' : ''}>
        <label for="cfg-rejectcall">Rejeitar chamadas automaticamente</label>
      </div>
      <label>Mensagem ao rejeitar chamada</label>
      <input type="text" id="cfg-callmsg" placeholder="Não recebo chamadas por aqui." value="${s.callRejectMessage || ''}">
      <div class="check-row" style="margin-top:12px">
        <input type="checkbox" id="cfg-ignoregroups" ${s.ignoreGroups ? 'checked' : ''}>
        <label for="cfg-ignoregroups">Ignorar mensagens de grupos</label>
      </div>
      <div class="check-row" style="margin-top:8px">
        <input type="checkbox" id="cfg-ignorechannels" ${s.ignoreChannels ? 'checked' : ''}>
        <label for="cfg-ignorechannels">Ignorar mensagens de canais/newsletters</label>
      </div>
      <div class="check-row" style="margin-top:8px">
        <input type="checkbox" id="cfg-alwaysonline" ${s.alwaysOnline ? 'checked' : ''}>
        <label for="cfg-alwaysonline">Sempre online</label>
      </div>
      <div class="check-row" style="margin-top:8px">
        <input type="checkbox" id="cfg-readmsgs" ${s.readMessages ? 'checked' : ''}>
        <label for="cfg-readmsgs">Visualizar mensagens automaticamente</label>
      </div>
      <div class="check-row" style="margin-top:8px">
        <input type="checkbox" id="cfg-readstatus" ${s.readStatus ? 'checked' : ''}>
        <label for="cfg-readstatus">Visualizar status automaticamente</label>
      </div>
      <div class="check-row" style="margin-top:8px">
        <input type="checkbox" id="cfg-synchistory" ${s.syncFullHistory ? 'checked' : ''}>
        <label for="cfg-synchistory">Sincronizar histórico completo ao conectar</label>
      </div>
      <div class="check-row" style="margin-top:8px">
        <input type="checkbox" id="cfg-queue" ${s.queueManager ? 'checked' : ''}>
        <label for="cfg-queue">Gerenciador de fila com rate limiting</label>
      </div>
      <div style="margin-top:16px">
        <button class="btn-action" onclick="saveConfig()">Salvar Configurações</button>
      </div>
      <div class="result" id="cfg-result"></div>
    </div>
    <div class="card">
      <h3>Proxy da Instância</h3>
      <p style="color:#6b7280;font-size:13px;margin-bottom:12px">Formatos suportados: http://, https://, socks4://, socks5://</p>
      <label>URL do Proxy</label>
      <input type="text" id="proxy-url" placeholder="http://user:pass@proxy.example.com:8080" value="${proxyUrl}">
      <p style="color:#6b7280;font-size:12px;margin-top:6px">Deixe vazio para remover o proxy. Reconecte a instância após salvar.</p>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-action" onclick="saveProxy()">Salvar Proxy</button>
        <button class="btn-action btn-danger" onclick="saveProxy(true)">Remover Proxy</button>
      </div>
      <div class="result" id="proxy-result"></div>
    </div>
    <div class="card" style="border:1px solid #7f1d1d">
      <h3 style="color:#fca5a5">Zona de Perigo</h3>
      <p style="color:#6b7280;font-size:13px;margin-bottom:12px">Estas ações são irreversíveis.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-action btn-danger" onclick="doAction('logout')">⏏ Desconectar (Logout)</button>
        <button class="btn-action btn-danger" onclick="deleteInst()">🗑 Deletar Instância</button>
      </div>
    </div>
  </div>

  <!-- HISTÓRICO -->
  <div id="tab-historico" class="panel">
    <div class="card">
      <h3>Histórico de Mensagens</h3>
      <div class="row">
        <div>
          <label>Filtrar por número (opcional)</label>
          <input type="text" id="hist-phone" placeholder="5511999999999">
        </div>
        <div>
          <label>Limite</label>
          <select id="hist-limit">
            <option>20</option><option>50</option><option>100</option>
          </select>
        </div>
        <button class="btn-action" onclick="loadHistory()">Buscar</button>
      </div>
      <div id="hist-result" style="margin-top:16px"></div>
    </div>
  </div>

  <!-- API KEYS -->
  <div id="tab-apikeys" class="panel">
    <div class="card">
      <h3>API Key desta Instância</h3>
      <p style="color:#6b7280;font-size:13px;margin-bottom:12px">Use esta chave para autenticar requisições específicas desta instância.</p>
      <div style="display:flex;align-items:center;gap:12px;background:#0f172a;border-radius:8px;padding:12px">
        <span class="key-val" style="font-size:13px;flex:1" onclick="copyKey('${instApiKey}')">${instApiKey}</span>
        <button class="btn-action" onclick="copyKey('${instApiKey}')">Copiar</button>
      </div>
    </div>
    <div class="card">
      <h3>API Keys Globais</h3>
      <div style="display:flex;gap:12px;margin-bottom:16px">
        <input type="text" id="new-key-name" placeholder="Nome da key (ex: cliente-joao)" style="flex:1">
        <button class="btn-action" onclick="createKey()">+ Criar Key</button>
      </div>
      <div id="key-result" class="result"></div>
      <table>
        <thead><tr><th>Nome</th><th>Key</th><th>Status</th><th>Criada</th><th></th></tr></thead>
        <tbody id="keys-tbody">${keyRows}</tbody>
      </table>
    </div>
  </div>

</main>
<div id="toast"></div>
<script>
var INST_ID='${inst.id}';
var INST_NAME='${inst.name}';
var K='${GLOBAL_KEY}';
var BASE='/api/instances/'+INST_ID;
var wsConn=null;

function toast(msg,ok){var t=document.getElementById('toast');t.textContent=msg;t.style.display='block';t.style.borderColor=ok===false?'#ef4444':'#22c55e';setTimeout(function(){t.style.display='none'},3500);}

function switchTab(name,el){
  document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('active');});
  document.querySelectorAll('.panel').forEach(function(p){p.classList.remove('active');});
  el.classList.add('active');
  document.getElementById('tab-'+name).classList.add('active');
}

function showResult(id,data,ok){
  var el=document.getElementById(id);
  el.style.display='block';
  el.className='result '+(ok?'ok':'err');
  el.textContent=typeof data==='string'?data:JSON.stringify(data,null,2);
}

function api(method,url,body){
  return fetch(url,{method:method,headers:Object.assign({'x-api-key':K},body?{'Content-Type':'application/json'}:{}),body:body?JSON.stringify(body):undefined});
}

// ── Status ──────────────────────────────────────────────────
function doAction(action){
  if(action==='logout'&&!confirm('Desconectar esta instância?'))return;
  api('POST',BASE+'/'+action).then(function(r){
    toast(action==='logout'?'Logout feito':'Restart iniciado');
    setTimeout(function(){location.reload()},2000);
  }).catch(function(){toast('Erro',false)});
}
function deleteInst(){
  if(!confirm('DELETAR esta instância permanentemente?'))return;
  api('DELETE',BASE).then(function(){location.href='/dashboard';}).catch(function(){toast('Erro',false)});
}
function toggleSub(active){
  api('PUT',BASE+'/subscription',{active:active}).then(function(r){
    toast(active?'Assinatura ativada':'Assinatura desativada');
    setTimeout(function(){location.reload()},1200);
  }).catch(function(){toast('Erro',false)});
}

// ── Webhook ─────────────────────────────────────────────────
function saveWebhook(){
  var url=document.getElementById('wh-url').value.trim();
  var enabled=document.getElementById('wh-enabled').checked;
  if(document.getElementById('whev-all').checked){
    api('PUT',BASE+'/webhook',{url:url,enabled:enabled,events:['all']}).then(function(r){
      return r.json().then(function(d){showResult('wh-result',d,r.ok);if(r.ok)toast('Webhook salvo!');});
    }).catch(function(e){showResult('wh-result',e.message,false);});
    return;
  }
  var events=[];
  document.querySelectorAll('[id^="whev-"]:not(#whev-all)').forEach(function(cb){if(cb.checked)events.push(cb.id.replace('whev-',''));});
  if(!url&&enabled){toast('URL obrigatória se webhook ativo',false);return;}
  api('PUT',BASE+'/webhook',{url:url||null,enabled:enabled,events:events}).then(function(r){
    return r.json().then(function(d){showResult('wh-result',d,r.ok);if(r.ok)toast('Webhook salvo!');});
  }).catch(function(e){showResult('wh-result',e.message,false);});
}
function testWebhook(){
  var url=document.getElementById('wh-url').value.trim();
  if(!url){toast('Configure a URL primeiro',false);return;}
  fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'test',instanceId:INST_ID,timestamp:Date.now(),data:{message:'Teste de webhook ApiApego'}})})
    .then(function(r){showResult('wh-test-result','Status: '+r.status+' '+r.statusText,r.ok);})
    .catch(function(e){showResult('wh-test-result','Erro: '+e.message,false);});
}

// ── WebSocket ───────────────────────────────────────────────
function saveWsConfig(){
  if(document.getElementById('wsev-all').checked){
    api('PUT',BASE+'/websocket',{events:['all']}).then(function(r){
      return r.json().then(function(d){showResult('ws-result',d,r.ok);if(r.ok)toast('Config WS salva!');});
    }).catch(function(e){showResult('ws-result',e.message,false);});
    return;
  }
  var events=[];
  document.querySelectorAll('[id^="wsev-"]:not(#wsev-all)').forEach(function(cb){if(cb.checked)events.push(cb.id.replace('wsev-',''));});
  api('PUT',BASE+'/websocket',{events:events}).then(function(r){
    return r.json().then(function(d){showResult('ws-result',d,r.ok);if(r.ok)toast('Config WS salva!');});
  }).catch(function(e){showResult('ws-result',e.message,false);});
}
function startWsTest(){
  var proto=location.protocol==='https:'?'wss':'ws';
  var wsUrl=proto+'://'+location.host+'/api/instances/'+INST_NAME+'/ws?x-api-key='+K;
  wsConn=new WebSocket(wsUrl);
  var log=document.getElementById('ws-log');
  log.innerHTML='';
  document.getElementById('ws-test-btn').style.display='none';
  document.getElementById('ws-stop-btn').style.display='';
  function addLog(msg,color){
    var line=document.createElement('div');
    line.style.color=color||'#94a3b8';
    line.style.marginBottom='4px';
    line.textContent=new Date().toLocaleTimeString()+' '+msg;
    log.appendChild(line);
    log.scrollTop=log.scrollHeight;
  }
  wsConn.onopen=function(){addLog('✅ Conectado','#86efac');};
  wsConn.onmessage=function(e){try{addLog(JSON.stringify(JSON.parse(e.data),null,0),'#a5b4fc');}catch{addLog(e.data);}};
  wsConn.onerror=function(){addLog('❌ Erro de conexão','#fca5a5');};
  wsConn.onclose=function(){addLog('🔌 Desconectado','#d97706');document.getElementById('ws-test-btn').style.display='';document.getElementById('ws-stop-btn').style.display='none';};
}
function stopWsTest(){if(wsConn){wsConn.close();wsConn=null;}}

// ── Enviar ──────────────────────────────────────────────────
function onTypeChange(){
  var type=document.getElementById('msg-type').value;
  var fields=['text','media','doc','loc','reaction','buttons','list','poll','carousel'];
  fields.forEach(function(f){document.getElementById('field-'+f).style.display='none';});
  var map={text:'text',image:'media',video:'media',audio:'media',document:'doc',location:'loc',sticker:'media',reaction:'reaction',buttons:'buttons',list:'list',poll:'poll',carousel:'carousel'};
  var show=map[type];
  if(show)document.getElementById('field-'+show).style.display='block';
  document.getElementById('field-ptt').style.display=(type==='audio')?'block':'none';
  if(['image','video','sticker'].includes(type))document.getElementById('field-media').querySelector('textarea')||void 0;
}
function sendMsg(){
  var type=document.getElementById('msg-type').value;
  var to=document.getElementById('msg-to').value.trim().replace(/\\D/g,'');
  if(!to){toast('Número obrigatório',false);return;}
  var body={to:to};
  var url=BASE+'/send-'+type;
  if(type==='text'){body.text=document.getElementById('msg-text').value;if(!body.text){toast('Texto obrigatório',false);return;}}
  else if(type==='image'){body.image=document.getElementById('msg-media').value;body.caption=document.getElementById('msg-caption').value;}
  else if(type==='video'){body.video=document.getElementById('msg-media').value;body.caption=document.getElementById('msg-caption').value;}
  else if(type==='audio'){body.audio=document.getElementById('msg-media').value;body.ptt=document.getElementById('msg-ptt').checked;}
  else if(type==='document'){body.document=document.getElementById('msg-doc').value;body.filename=document.getElementById('msg-filename').value;}
  else if(type==='location'){body.latitude=parseFloat(document.getElementById('msg-lat').value);body.longitude=parseFloat(document.getElementById('msg-lng').value);body.name=document.getElementById('msg-locname').value;}
  else if(type==='sticker'){body.sticker=document.getElementById('msg-media').value;}
  else if(type==='reaction'){body.messageId=document.getElementById('msg-reactid').value;body.emoji=document.getElementById('msg-emoji').value;url=BASE+'/send-reaction';}
  else if(type==='buttons'){try{body.text=document.getElementById('msg-btn-text').value;body.footer=document.getElementById('msg-btn-footer').value;body.buttons=JSON.parse(document.getElementById('msg-btn-buttons').value);}catch(e){toast('JSON inválido nos botões',false);return;}}
  else if(type==='list'){try{body.title=document.getElementById('msg-list-title').value;body.text=document.getElementById('msg-list-text').value;body.buttonText=document.getElementById('msg-list-btntext').value;body.sections=JSON.parse(document.getElementById('msg-list-sections').value);}catch(e){toast('JSON inválido nas seções',false);return;}}
  else if(type==='poll'){var vals=document.getElementById('msg-poll-values').value.trim().split('\\n').filter(Boolean);body.name=document.getElementById('msg-poll-name').value;body.values=vals;body.selectableCount=parseInt(document.getElementById('msg-poll-count').value)||1;}
  else if(type==='carousel'){try{body.cards=JSON.parse(document.getElementById('msg-carousel-cards').value);}catch(e){toast('JSON inválido no carrossel',false);return;}}
  api('POST',url,body).then(function(r){
    return r.json().then(function(d){showResult('msg-result',d,r.ok);if(r.ok)toast('Enviado!');});
  }).catch(function(e){showResult('msg-result',e.message,false);});
}
function checkNum(){
  var to=document.getElementById('msg-to').value.trim().replace(/\\D/g,'');
  if(!to){toast('Número obrigatório',false);return;}
  api('POST',BASE+'/check-number',{phone:to}).then(function(r){
    return r.json().then(function(d){showResult('msg-result',d,r.ok);});
  }).catch(function(e){showResult('msg-result',e.message,false);});
}
function deleteMsg(){
  var to=document.getElementById('del-to').value.trim().replace(/\\D/g,'');
  var mid=document.getElementById('del-msgid').value.trim();
  var fa=document.getElementById('del-forall').checked;
  if(!to||!mid){toast('Número e ID obrigatórios',false);return;}
  api('POST',BASE+'/delete-message',{to:to,messageId:mid,forEveryone:fa}).then(function(r){
    return r.json().then(function(d){showResult('del-result',d,r.ok);if(r.ok)toast('Deletada!');});
  }).catch(function(e){showResult('del-result',e.message,false);});
}
function editMsg(){
  var to=document.getElementById('edit-to').value.trim().replace(/\\D/g,'');
  var mid=document.getElementById('edit-msgid').value.trim();
  var text=document.getElementById('edit-text').value;
  if(!to||!mid||!text){toast('Preencha todos os campos',false);return;}
  api('POST',BASE+'/edit-message',{to:to,messageId:mid,text:text}).then(function(r){
    return r.json().then(function(d){showResult('edit-result',d,r.ok);if(r.ok)toast('Editada!');});
  }).catch(function(e){showResult('edit-result',e.message,false);});
}
function readMsg(){
  var jid=document.getElementById('read-jid').value.trim();
  var mid=document.getElementById('read-msgid').value.trim();
  if(!jid||!mid){toast('JID e ID obrigatórios',false);return;}
  api('POST',BASE+'/read-messages',{keys:[{remoteJid:jid,id:mid}]}).then(function(r){
    return r.json().then(function(d){showResult('read-result',d,r.ok);if(r.ok)toast('Marcada como lida!');});
  }).catch(function(e){showResult('read-result',e.message,false);});
}

// ── Grupos ──────────────────────────────────────────────────
function loadGroups(){
  api('GET',BASE+'/groups').then(function(r){
    return r.json().then(function(d){
      if(!r.ok){showResult('groups-result',d,false);return;}
      var groups=d.data||[];
      if(!groups.length){document.getElementById('groups-result').innerHTML='<p style="color:#6b7280;padding:12px">Nenhum grupo encontrado</p>';return;}
      var html='<table><thead><tr><th>Nome</th><th>ID</th><th>Participantes</th></tr></thead><tbody>';
      groups.forEach(function(g){html+='<tr><td>'+g.subject+'</td><td style="font-family:monospace;font-size:11px;cursor:pointer" onclick="document.getElementById(&quot;grp-id&quot;).value=&quot;'+g.id+'&quot;">'+g.id+'</td><td>'+g.size+'</td></tr>';});
      html+='</tbody></table><p style="color:#6b7280;font-size:12px;margin-top:8px">Clique no ID para selecioná-lo</p>';
      document.getElementById('groups-result').innerHTML=html;
    });
  }).catch(function(e){document.getElementById('groups-result').innerHTML='<p style="color:#f87171">Erro: '+e.message+'</p>';});
}
function createGroup(){
  var name=document.getElementById('grp-name').value.trim();
  var plist=document.getElementById('grp-participants').value.trim().split('\\n').map(function(p){return p.trim().replace(/\\D/g,'');}).filter(Boolean);
  if(!name||!plist.length){toast('Nome e participantes obrigatórios',false);return;}
  api('POST',BASE+'/groups',{name:name,participants:plist}).then(function(r){
    return r.json().then(function(d){showResult('grp-create-result',d,r.ok);if(r.ok)toast('Grupo criado!');});
  }).catch(function(e){showResult('grp-create-result',e.message,false);});
}
function getGroupMeta(){
  var gid=document.getElementById('grp-id').value.trim();
  if(!gid){toast('ID do grupo obrigatório',false);return;}
  api('GET',BASE+'/groups/'+encodeURIComponent(gid)).then(function(r){
    return r.json().then(function(d){showResult('grp-meta-result',d,r.ok);});
  }).catch(function(e){showResult('grp-meta-result',e.message,false);});
}
function getGroupInvite(){
  var gid=document.getElementById('grp-id').value.trim();
  if(!gid){toast('ID do grupo obrigatório',false);return;}
  api('GET',BASE+'/groups/'+encodeURIComponent(gid)+'/invite').then(function(r){
    return r.json().then(function(d){showResult('grp-meta-result',d,r.ok);});
  }).catch(function(e){showResult('grp-meta-result',e.message,false);});
}
function leaveGroup(){
  var gid=document.getElementById('grp-id').value.trim();
  if(!gid||!confirm('Sair do grupo '+gid+'?'))return;
  api('POST',BASE+'/groups/'+encodeURIComponent(gid)+'/leave').then(function(r){
    return r.json().then(function(d){showResult('grp-meta-result',d,r.ok);if(r.ok)toast('Saiu do grupo!');});
  }).catch(function(e){showResult('grp-meta-result',e.message,false);});
}
function manageParticipants(){
  var gid=document.getElementById('grp-id').value.trim();
  var action=document.getElementById('grp-paction').value;
  var plist=document.getElementById('grp-plist').value.trim().split('\\n').map(function(p){return p.trim().replace(/\\D/g,'');}).filter(Boolean);
  if(!gid||!plist.length){toast('ID do grupo e participantes obrigatórios',false);return;}
  api('POST',BASE+'/groups/'+encodeURIComponent(gid)+'/participants',{action:action,participants:plist}).then(function(r){
    return r.json().then(function(d){showResult('grp-part-result',d,r.ok);if(r.ok)toast('Feito!');});
  }).catch(function(e){showResult('grp-part-result',e.message,false);});
}
function updateGroupSettings(){
  var gid=document.getElementById('grp-id').value.trim();
  if(!gid){toast('ID do grupo obrigatório',false);return;}
  var settings={};
  var s=document.getElementById('grp-subject').value.trim();
  var d=document.getElementById('grp-desc').value.trim();
  if(s)settings.subject=s;
  if(d)settings.description=d;
  settings.announce=document.getElementById('grp-announce').checked;
  settings.restrict=document.getElementById('grp-restrict').checked;
  api('PUT',BASE+'/groups/'+encodeURIComponent(gid)+'/settings',settings).then(function(r){
    return r.json().then(function(d){showResult('grp-settings-result',d,r.ok);if(r.ok)toast('Configurações salvas!');});
  }).catch(function(e){showResult('grp-settings-result',e.message,false);});
}

// ── Perfil & Contatos ───────────────────────────────────────
function getProfilePic(){
  var phone=document.getElementById('pp-phone').value.trim().replace(/\\D/g,'');
  var url=BASE+'/profile/picture'+(phone?'?phone='+phone:'');
  api('GET',url).then(function(r){
    return r.json().then(function(d){
      if(!r.ok){document.getElementById('pp-result').innerHTML='<p style="color:#f87171">'+JSON.stringify(d)+'</p>';return;}
      var imgUrl=d.data&&d.data.url;
      document.getElementById('pp-result').innerHTML=imgUrl?'<img src="'+imgUrl+'" style="max-width:120px;border-radius:50%;margin-top:8px">':'<p style="color:#6b7280">Sem foto de perfil</p>';
    });
  });
}
function updateProfilePic(){
  var image=document.getElementById('pp-image').value.trim();
  if(!image){toast('URL ou base64 obrigatório',false);return;}
  api('PUT',BASE+'/profile/picture',{image:image}).then(function(r){
    return r.json().then(function(d){showResult('pp-update-result',d,r.ok);if(r.ok)toast('Foto atualizada!');});
  }).catch(function(e){showResult('pp-update-result',e.message,false);});
}
function updateProfileStatus(){
  var status=document.getElementById('prof-status').value.trim();
  if(!status){toast('Status obrigatório',false);return;}
  api('PUT',BASE+'/profile/status',{status:status}).then(function(r){
    return r.json().then(function(d){showResult('prof-status-result',d,r.ok);if(r.ok)toast('Bio atualizada!');});
  }).catch(function(e){showResult('prof-status-result',e.message,false);});
}
function updateProfileName(){
  var name=document.getElementById('prof-name').value.trim();
  if(!name){toast('Nome obrigatório',false);return;}
  api('PUT',BASE+'/profile/name',{name:name}).then(function(r){
    return r.json().then(function(d){showResult('prof-name-result',d,r.ok);if(r.ok)toast('Nome atualizado!');});
  }).catch(function(e){showResult('prof-name-result',e.message,false);});
}
function loadContacts(){
  api('GET',BASE+'/contacts').then(function(r){
    return r.json().then(function(d){
      if(!r.ok){document.getElementById('contacts-result').innerHTML='<p style="color:#f87171">'+JSON.stringify(d)+'</p>';return;}
      var contacts=d.data||[];
      document.getElementById('contacts-result').innerHTML=contacts.length?'<p style="color:#6b7280;font-size:12px">'+contacts.length+' contatos encontrados</p><div class="result ok" style="display:block">'+JSON.stringify(contacts.slice(0,20),null,2)+(contacts.length>20?'\\n... e mais '+(contacts.length-20):'')+'</div>':'<p style="color:#6b7280">Nenhum contato</p>';
    });
  });
}
function loadBlocked(){
  api('GET',BASE+'/contacts/blocked').then(function(r){
    return r.json().then(function(d){
      if(!r.ok){document.getElementById('contacts-result').innerHTML='<p style="color:#f87171">'+JSON.stringify(d)+'</p>';return;}
      var blocked=d.data||[];
      document.getElementById('contacts-result').innerHTML='<p style="color:#6b7280;font-size:12px">'+blocked.length+' bloqueados</p><div class="result ok" style="display:block">'+JSON.stringify(blocked,null,2)+'</div>';
    });
  });
}
function blockContact(action){
  var phone=document.getElementById('block-phone').value.trim().replace(/\\D/g,'');
  if(!phone){toast('Número obrigatório',false);return;}
  api('POST',BASE+'/contacts/block',{phone:phone,action:action}).then(function(r){
    return r.json().then(function(d){showResult('block-result',d,r.ok);if(r.ok)toast(action==='block'?'Bloqueado!':'Desbloqueado!');});
  }).catch(function(e){showResult('block-result',e.message,false);});
}
function loadLabels(){
  api('GET',BASE+'/labels').then(function(r){
    return r.json().then(function(d){
      if(!r.ok){document.getElementById('labels-result').innerHTML='<p style="color:#f87171">'+JSON.stringify(d)+'</p>';return;}
      var labels=d.data||[];
      document.getElementById('labels-result').innerHTML=labels.length?'<div class="result ok" style="display:block">'+JSON.stringify(labels,null,2)+'</div>':'<p style="color:#6b7280">Nenhuma etiqueta encontrada</p>';
    });
  });
}
function manageLabel(action){
  var jid=document.getElementById('lbl-jid').value.trim();
  var labelId=document.getElementById('lbl-id').value.trim();
  if(!jid||!labelId){toast('JID e ID da etiqueta obrigatórios',false);return;}
  api('POST',BASE+'/labels/manage',{jid:jid,labelId:labelId,action:action}).then(function(r){
    return r.json().then(function(d){showResult('lbl-result',d,r.ok);if(r.ok)toast('Etiqueta '+action+'!');});
  }).catch(function(e){showResult('lbl-result',e.message,false);});
}
function sendPresence(){
  var to=document.getElementById('pres-to').value.trim().replace(/\\D/g,'');
  var type=document.getElementById('pres-type').value;
  if(!to){toast('Número obrigatório',false);return;}
  api('POST',BASE+'/presence',{to:to,type:type}).then(function(r){
    return r.json().then(function(d){showResult('pres-result',d,r.ok);if(r.ok)toast('Presença enviada!');});
  }).catch(function(e){showResult('pres-result',e.message,false);});
}

// ── Configurações ───────────────────────────────────────────
function saveConfig(){
  var settings={
    messageDelay:parseInt(document.getElementById('cfg-delay').value)||0,
    rejectCalls:document.getElementById('cfg-rejectcall').checked,
    callRejectMessage:document.getElementById('cfg-callmsg').value,
    ignoreGroups:document.getElementById('cfg-ignoregroups').checked,
    ignoreChannels:document.getElementById('cfg-ignorechannels').checked,
    alwaysOnline:document.getElementById('cfg-alwaysonline').checked,
    readMessages:document.getElementById('cfg-readmsgs').checked,
    readStatus:document.getElementById('cfg-readstatus').checked,
    syncFullHistory:document.getElementById('cfg-synchistory').checked,
    queueManager:document.getElementById('cfg-queue').checked,
  };
  api('PUT',BASE+'/settings',settings).then(function(r){
    return r.json().then(function(d){showResult('cfg-result',d,r.ok);if(r.ok)toast('Salvo!');});
  }).catch(function(e){showResult('cfg-result',e.message,false);});
}
function saveProxy(remove){
  var url=remove?null:document.getElementById('proxy-url').value.trim()||null;
  api('PUT',BASE+'/proxy',{url:url}).then(function(r){
    return r.json().then(function(d){showResult('proxy-result',d,r.ok);if(r.ok)toast(url?'Proxy salvo! Reconecte a instância.':'Proxy removido!');});
  }).catch(function(e){showResult('proxy-result',e.message,false);});
}

// ── Histórico ───────────────────────────────────────────────
function loadHistory(){
  var phone=document.getElementById('hist-phone').value.trim().replace(/\\D/g,'');
  var limit=document.getElementById('hist-limit').value;
  var url=BASE+'/messages?limit='+limit+(phone?'&phone='+phone:'');
  api('GET',url).then(function(r){
    return r.json().then(function(d){
      if(!r.ok){showResult('hist-result',d,false);return;}
      var msgs=(d.data||d||[]);
      if(!msgs.length){document.getElementById('hist-result').innerHTML='<p style="color:#6b7280;padding:20px;text-align:center">Nenhuma mensagem encontrada</p>';return;}
      var html='<div style="overflow-x:auto"><table><thead><tr><th>De</th><th>Para</th><th>Tipo</th><th>Conteúdo</th><th>Data</th></tr></thead><tbody>';
      msgs.forEach(function(m){
        var content=m.content&&m.content.text?m.content.text:(JSON.stringify(m.content||{}).substring(0,60));
        html+='<tr><td>'+(m.from_me?'Eu':m.remote_jid)+'</td><td>'+m.remote_jid+'</td><td>'+m.type+'</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+content+'</td><td>'+new Date(m.timestamp||m.created_at).toLocaleString('pt-BR')+'</td></tr>';
      });
      html+='</tbody></table></div>';
      document.getElementById('hist-result').innerHTML=html;
    });
  }).catch(function(e){document.getElementById('hist-result').innerHTML='<p style="color:#f87171">Erro: '+e.message+'</p>';});
}

// ── API Keys ─────────────────────────────────────────────────
function copyKey(k){navigator.clipboard.writeText(k).then(function(){toast('Copiado!');});}
function createKey(){
  var name=document.getElementById('new-key-name').value.trim();
  if(!name){toast('Nome obrigatório',false);return;}
  api('POST','/api/keys',{name:name}).then(function(r){
    return r.json().then(function(d){
      if(!r.ok){showResult('key-result',d,false);return;}
      showResult('key-result','Key criada: '+d.data.key,true);
      document.getElementById('new-key-name').value='';
      setTimeout(function(){location.reload()},2000);
    });
  }).catch(function(e){showResult('key-result',e.message,false);});
}
function revokeKey(id){
  if(!confirm('Revogar esta API key?'))return;
  api('DELETE','/api/keys/'+id).then(function(r){
    toast('Key revogada');setTimeout(function(){location.reload()},1500);
  }).catch(function(){toast('Erro',false)});
}
</script>
</body></html>`)
  })
}
