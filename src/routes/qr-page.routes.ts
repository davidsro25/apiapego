import { FastifyInstance } from 'fastify'
import QRCode from 'qrcode'
import { InstanceService } from '../services/instance.service'

export async function qrPageRoutes(app: FastifyInstance) {
  app.get('/qr/:id', {
    schema: { hide: true },
    config: { skipAuth: true }
  }, async (request: any, reply: any) => {
    const instance = await InstanceService.get(request.params.id)
    if (!instance) return reply.status(404).send('Instância não encontrada')

    const { qr, status } = await InstanceService.getQr(request.params.id)

    if (status === 'connected') {
      return reply.type('text/html').send(`
        <!DOCTYPE html><html><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>ApiApego — Conectado</title>
        <style>body{background:#0a0f1e;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;flex-direction:column;gap:16px;text-align:center}</style>
        </head><body>
        <div style="font-size:64px">✅</div>
        <h2>WhatsApp Conectado!</h2>
        <p style="color:#22c55e;font-size:18px">Instância: <strong>${instance.name}</strong></p>
        <p style="color:#6b7280;font-size:14px">Esta janela pode ser fechada.</p>
        <button onclick="window.close()" style="margin-top:8px;background:#374151;border:none;border-radius:8px;padding:10px 24px;color:#fff;font-size:14px;cursor:pointer">Fechar</button>
        <script>setTimeout(function(){ try { window.close() } catch(e){} }, 3000);</script>
        </body></html>
      `)
    }

    if (!qr) {
      return reply.type('text/html').send(`
        <!DOCTYPE html><html><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>ApiApego — Aguardando QR</title>
        <style>body{background:#0a0f1e;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;flex-direction:column;gap:16px;text-align:center}</style>
        </head><body>
        <div style="font-size:48px">⏳</div>
        <h2>Gerando QR Code...</h2>
        <p style="color:#9ca3af">Atualizando automaticamente...</p>
        <script>setTimeout(function(){location.reload()},3000);</script>
        </body></html>
      `)
    }

    const qrDataUrl = await QRCode.toDataURL(qr, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' }
    })

    return reply.type('text/html').send(`
      <!DOCTYPE html><html><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>ApiApego — Conectar WhatsApp</title>
      <style>
        body{background:#0a0f1e;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;flex-direction:column;gap:16px;text-align:center;padding:20px;box-sizing:border-box}
        .card{background:#111827;border-radius:16px;padding:32px;box-shadow:0 8px 32px rgba(0,0,0,.5);max-width:400px;width:100%}
        img{border-radius:8px;display:block;margin:16px auto}
        .badge{background:#1a2035;border-radius:8px;padding:8px 16px;font-size:13px;color:#9ca3af}
        .inst{color:#6366f1;font-weight:700;font-size:18px}
      </style>
      </head><body>
      <div class="card">
        <div style="font-size:32px;margin-bottom:8px">📱</div>
        <h2 style="margin:0 0 4px">Conectar WhatsApp</h2>
        <p class="inst">${instance.name}</p>
        <img src="${qrDataUrl}" width="280" height="280" alt="QR Code">
        <div class="badge">Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo → Escaneie</div>
        <p id="timer" style="color:#6b7280;font-size:12px;margin-top:16px"></p>
      </div>
      <script>
        var countdown = 20;
        function tick(){
          if(countdown<=0){location.reload();return;}
          document.getElementById('timer').textContent='QR expira em '+countdown+'s';
          countdown--;setTimeout(tick,1000);
        }
        tick();
        // Verifica conexão a cada 3s sem precisar de auth (usa endpoint público de status)
        function checkConn(){
          fetch('/api/instances/${instance.id}/status',{headers:{'x-api-key':'${process.env.GLOBAL_API_KEY||''}'}})
            .then(function(r){return r.json();}).then(function(d){
              if(d&&d.data&&d.data.status==='connected'){
                document.querySelector('.card').innerHTML='<div style="font-size:64px">✅</div><h2 style="color:#22c55e;margin-top:12px">Conectado!</h2><p style="color:#6b7280;margin-top:8px">Fechando em 2s...</p>';
                setTimeout(function(){try{window.close();}catch(e){}},2000);
              }
            }).catch(function(){});
        }
        setInterval(checkConn,3000);
      </script>
      </body></html>
    `)
  })
}
