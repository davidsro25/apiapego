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
main{padding:28px;max-width:1000px;margin:0 auto}
.tabs{display:flex;gap:4px;margin-bottom:24px;background:#111827;border-radius:10px;padding:4px}
.tab{flex:1;padding:10px;text-align:center;border:none;background:transparent;color:#6b7280;cursor:pointer;border-radius:8px;font-size:13px;font-weight:600;transition:all .15s}
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
.row{display:flex;gap:12px;align-items:flex-end}
.row>*{flex:1}
.row>.btn-action{flex:0 0 auto}
.btn-action{background:#6366f1;border:none;border-radius:8px;padding:10px 20px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap}
.btn-action:hover{background:#4f46e5}
.btn-danger{background:#991b1b}.btn-danger:hover{background:#7f1d1d}
.btn-gray{background:#374151}.btn-gray:hover{background:#4b5563}
.btn-green{background:#15803d}.btn-green:hover{background:#166534}
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
      return `<tr id="row-${inst.id}">
        <td><div class="name">${inst.name}</div><div class="phone">${inst.phone || inst.profile_name || '—'}</div></td>
        <td><span class="badge" style="${badge}">${label}</span></td>
        <td class="actions">
          <a class="btn btn-cfg" href="/dashboard/instance/${inst.id}">Configurar</a>
          ${qrBtn}
          <button class="btn btn-restart" onclick="doAction('${inst.id}','restart')">Restart</button>
          <button class="btn btn-del" onclick="doAction('${inst.id}','delete')">Deletar</button>
        </td>
      </tr>`
    }).join('')

    const empty = instances.length === 0
      ? '<tr><td colspan="3" style="text-align:center;color:#6b7280;padding:40px">Nenhuma instância criada</td></tr>'
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
.modal input{width:100%;background:#1f2937;border:1px solid #374151;border-radius:8px;padding:10px 14px;color:#fff;font-size:14px;outline:none;margin-bottom:14px}
.modal input:focus{border-color:#6366f1}
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
    <thead><tr><th>Instância</th><th>Status</th><th>Ações</th></tr></thead>
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
  var name=document.getElementById('inst-name').value.trim().replace(/\s/g,'-').toLowerCase();
  var webhook=document.getElementById('inst-webhook').value.trim();
  if(!name){toast('Nome obrigatório',false);return;}
  var body={name:name};if(webhook)body.webhookUrl=webhook;
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

    const events = ['messages', 'status', 'connection', 'qr', 'groups', 'contacts']
    const currentEvents: string[] = inst.webhook_events || []
    const eventChecks = events.map(e =>
      `<div class="check-row"><input type="checkbox" id="ev-${e}" ${currentEvents.includes(e) ? 'checked' : ''}><label for="ev-${e}">${e}</label></div>`
    ).join('')

    const apiKeys = await query('SELECT id, key, name, active, created_at FROM api_keys ORDER BY created_at DESC')
    const keyRows = (apiKeys as any[]).map((k: any) => `
      <tr>
        <td>${k.name}</td>
        <td><span class="key-val" onclick="copyKey('${k.key}')" title="Clique para copiar">${k.key.substring(0, 20)}...</span></td>
        <td><span class="badge" style="${k.active ? 'background:#15803d' : 'background:#7f1d1d'};color:#fff">${k.active ? 'Ativa' : 'Revogada'}</span></td>
        <td>${new Date(k.created_at).toLocaleDateString('pt-BR')}</td>
        <td>${k.active ? `<button class="btn-action btn-danger" onclick="revokeKey('${k.id}')">Revogar</button>` : ''}</td>
      </tr>`).join('')

    const instApiKey = inst.api_key

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
    <button class="tab" onclick="switchTab('enviar',this)">Enviar</button>
    <button class="tab" onclick="switchTab('historico',this)">Histórico</button>
    <button class="tab" onclick="switchTab('apikeys',this)">API Keys</button>
    <button class="tab" onclick="switchTab('config',this)">Configurações</button>
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
        <tr><td style="color:#6b7280">API Key da instância</td><td><span class="key-val" onclick="copyKey('${instApiKey}')" title="Clique para copiar">${instApiKey}</span></td></tr>
        <tr><td style="color:#6b7280">Criada em</td><td>${new Date(inst.created_at).toLocaleString('pt-BR')}</td></tr>
      </table>
    </div>
  </div>

  <!-- WEBHOOK -->
  <div id="tab-webhook" class="panel">
    <div class="card">
      <h3>Configurar Webhook</h3>
      <label>URL do Webhook</label>
      <input type="url" id="wh-url" placeholder="https://seusite.com/webhook" value="${inst.webhook_url || ''}">
      <label>Eventos</label>
      ${eventChecks}
      <div style="margin-top:16px">
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

  <!-- ENVIAR -->
  <div id="tab-enviar" class="panel">
    <div class="card">
      <h3>Enviar Mensagem</h3>
      <label>Tipo</label>
      <select id="msg-type" onchange="onTypeChange()">
        <option value="text">Texto</option>
        <option value="image">Imagem</option>
        <option value="video">Vídeo</option>
        <option value="audio">Áudio</option>
        <option value="document">Documento</option>
        <option value="location">Localização</option>
      </select>
      <label>Para (número com DDI)</label>
      <input type="text" id="msg-to" placeholder="5511999999999">

      <div id="field-text">
        <label>Texto</label>
        <textarea id="msg-text" placeholder="Digite sua mensagem..."></textarea>
      </div>
      <div id="field-media" style="display:none">
        <label>URL da mídia</label>
        <input type="url" id="msg-media" placeholder="https://...">
        <label>Legenda (opcional)</label>
        <input type="text" id="msg-caption" placeholder="Legenda...">
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

      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn-action" onclick="sendMsg()">Enviar</button>
        <button class="btn-action btn-gray" onclick="checkNum()">Verificar Número</button>
      </div>
      <div class="result" id="msg-result"></div>
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
        <button class="btn-action btn-action" onclick="loadHistory()">Buscar</button>
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

  <!-- CONFIGURAÇÕES -->
  <div id="tab-config" class="panel">
    <div class="card">
      <h3>Configurações da Instância</h3>
      <label>Delay entre mensagens (ms)</label>
      <input type="number" id="cfg-delay" placeholder="0" value="${(inst.settings as any)?.messageDelay || 0}">
      <label>Rejeitar chamadas automaticamente</label>
      <select id="cfg-rejectcall">
        <option value="false" ${!(inst.settings as any)?.rejectCalls ? 'selected' : ''}>Não</option>
        <option value="true" ${(inst.settings as any)?.rejectCalls ? 'selected' : ''}>Sim</option>
      </select>
      <label>Mensagem ao rejeitar chamada</label>
      <input type="text" id="cfg-callmsg" placeholder="Não recebo chamadas por aqui." value="${(inst.settings as any)?.callRejectMessage || ''}">
      <label>Ler mensagens automaticamente</label>
      <select id="cfg-readmsgs">
        <option value="false" ${!(inst.settings as any)?.readMessages ? 'selected' : ''}>Não</option>
        <option value="true" ${(inst.settings as any)?.readMessages ? 'selected' : ''}>Sim</option>
      </select>
      <div style="margin-top:16px">
        <button class="btn-action" onclick="saveConfig()">Salvar Configurações</button>
      </div>
      <div class="result" id="cfg-result"></div>
    </div>
    <div class="card" style="border:1px solid #7f1d1d">
      <h3 style="color:#fca5a5">Zona de Perigo</h3>
      <p style="color:#6b7280;font-size:13px;margin-bottom:12px">Estas ações são irreversíveis.</p>
      <div style="display:flex;gap:8px">
        <button class="btn-action btn-danger" onclick="doAction('logout')">⏏ Desconectar (Logout)</button>
        <button class="btn-action btn-danger" onclick="deleteInst()">🗑 Deletar Instância</button>
      </div>
    </div>
  </div>

</main>
<div id="toast"></div>
<script>
var INST_ID='${inst.id}';
var K='${GLOBAL_KEY}';
var BASE='/api/instances/'+INST_ID;

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

// Status
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

// Webhook
function saveWebhook(){
  var url=document.getElementById('wh-url').value.trim();
  var events=[];
  document.querySelectorAll('[id^="ev-"]').forEach(function(cb){if(cb.checked)events.push(cb.id.replace('ev-',''));});
  if(!url){toast('URL obrigatória',false);return;}
  api('PUT',BASE+'/webhook',{url:url,events:events}).then(function(r){
    return r.json().then(function(d){showResult('wh-result',d,r.ok);});
  }).catch(function(e){showResult('wh-result',e.message,false);});
}
function testWebhook(){
  var url=document.getElementById('wh-url').value.trim();
  if(!url){toast('Configure a URL primeiro',false);return;}
  fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'test',instanceId:INST_ID,timestamp:Date.now(),data:{message:'Teste de webhook ApiApego'}})})
    .then(function(r){showResult('wh-test-result','Status: '+r.status+' '+r.statusText,r.ok);})
    .catch(function(e){showResult('wh-test-result','Erro: '+e.message,false);});
}

// Enviar
function onTypeChange(){
  var type=document.getElementById('msg-type').value;
  document.getElementById('field-text').style.display=type==='text'?'block':'none';
  document.getElementById('field-media').style.display=['image','video','audio'].includes(type)?'block':'none';
  document.getElementById('field-doc').style.display=type==='document'?'block':'none';
  document.getElementById('field-loc').style.display=type==='location'?'block':'none';
}
function sendMsg(){
  var type=document.getElementById('msg-type').value;
  var to=document.getElementById('msg-to').value.trim().replace(/\\D/g,'');
  if(!to){toast('Número obrigatório',false);return;}
  var body={to:to};
  if(type==='text'){body.text=document.getElementById('msg-text').value;if(!body.text){toast('Texto obrigatório',false);return;}}
  else if(type==='image'){body.image=document.getElementById('msg-media').value;body.caption=document.getElementById('msg-caption').value;}
  else if(type==='video'){body.video=document.getElementById('msg-media').value;body.caption=document.getElementById('msg-caption').value;}
  else if(type==='audio'){body.audio=document.getElementById('msg-media').value;}
  else if(type==='document'){body.document=document.getElementById('msg-doc').value;body.filename=document.getElementById('msg-filename').value;}
  else if(type==='location'){body.latitude=parseFloat(document.getElementById('msg-lat').value);body.longitude=parseFloat(document.getElementById('msg-lng').value);body.name=document.getElementById('msg-locname').value;}
  api('POST',BASE+'/send-'+type,body).then(function(r){
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

// Histórico
function loadHistory(){
  var phone=document.getElementById('hist-phone').value.trim().replace(/\\D/g,'');
  var limit=document.getElementById('hist-limit').value;
  var url=BASE+'/messages?limit='+limit+(phone?'&phone='+phone:'');
  api('GET',url).then(function(r){
    return r.json().then(function(d){
      if(!r.ok){showResult('hist-result',d,false);return;}
      var msgs=(d.data||d||[]);
      if(!msgs.length){document.getElementById('hist-result').innerHTML='<p style="color:#6b7280;padding:20px;text-align:center">Nenhuma mensagem encontrada</p>';return;}
      var html='<table><thead><tr><th>De</th><th>Para</th><th>Tipo</th><th>Conteúdo</th><th>Data</th></tr></thead><tbody>';
      msgs.forEach(function(m){
        var content=m.content&&m.content.text?m.content.text:(JSON.stringify(m.content||'').substring(0,60)+'...');
        html+='<tr><td>'+m.from_jid+'</td><td>'+m.to_jid+'</td><td>'+m.type+'</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">'+content+'</td><td>'+new Date(m.created_at).toLocaleString('pt-BR')+'</td></tr>';
      });
      html+='</tbody></table>';
      document.getElementById('hist-result').innerHTML=html;
    });
  }).catch(function(e){document.getElementById('hist-result').innerHTML='<p style="color:#f87171">Erro: '+e.message+'</p>';});
}

// API Keys
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

// Configurações
function saveConfig(){
  var settings={
    messageDelay:parseInt(document.getElementById('cfg-delay').value)||0,
    rejectCalls:document.getElementById('cfg-rejectcall').value==='true',
    callRejectMessage:document.getElementById('cfg-callmsg').value,
    readMessages:document.getElementById('cfg-readmsgs').value==='true',
  };
  api('PUT',BASE+'/settings',settings).then(function(r){
    return r.json().then(function(d){showResult('cfg-result',d,r.ok);if(r.ok)toast('Salvo!');});
  }).catch(function(e){showResult('cfg-result',e.message,false);});
}
</script>
</body></html>`)
  })
}
