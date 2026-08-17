/**
 * Módulo de Diagnóstico de Rede - Mestre do PC V10 (OTIMIZADO)
 * Integração do Casa5G Dashboard com o painel principal
 * Usa MCP server para diagnósticos高效
 */

const RedeDashboard = {
  // Estado
  monitoramentoAtivo: false,
  intervaloId: null,
  historico: [],
  ollamaHost: 'http://localhost:11434',
  ollamaModel: 'qwen2.5-coder:3b',
  destinos: ['1.1.1.1', '8.8.8.8', '9.9.9.9'],
  idxDestino: 0,
  maxHistorico: 50,

  // Inicialização
  init() {
    this.criarPainel();
    console.log('📡 Rede Dashboard V2 - Otimizado!');
  },

  // Criar painel HTML
  criarPainel() {
    const existente = document.getElementById('rede-dash');
    if (existente) existente.remove();

    const div = document.createElement('div');
    div.id = 'rede-dash';
    div.innerHTML = `
      <div class="rd-header">
        <div class="rd-title">
          <span class="rd-icon">📡</span>
          <span>Diagnóstico de Rede</span>
        </div>
        <div class="rd-actions">
          <button id="rd-btn-on" class="rd-btn rd-on" onclick="RedeDashboard.ativar()">▶ ATIVAR</button>
          <button id="rd-btn-off" class="rd-btn rd-off" onclick="RedeDashboard.desativar()" disabled>⏹ PARAR</button>
          <button class="rd-btn rd-test" onclick="RedeDashboard.testar()">🔄 TESTAR</button>
        </div>
      </div>
      
      <div class="rd-grid">
        <div class="rd-card" id="rd-wifi">
          <div class="rd-card-icon">📶</div>
          <div class="rd-card-body">
            <div class="rd-card-label">Wi-Fi</div>
            <div class="rd-card-value" id="rd-v-wifi">--</div>
          </div>
        </div>
        <div class="rd-card" id="rd-sinal">
          <div class="rd-card-icon">📊</div>
          <div class="rd-card-body">
            <div class="rd-card-label">Sinal</div>
            <div class="rd-card-value" id="rd-v-sinal">--%</div>
          </div>
        </div>
        <div class="rd-card" id="rd-rota">
          <div class="rd-card-icon">🔗</div>
          <div class="rd-card-body">
            <div class="rd-card-label">Roteador</div>
            <div class="rd-card-value" id="rd-v-rota">--ms</div>
          </div>
        </div>
        <div class="rd-card" id="rd-inet">
          <div class="rd-card-icon">🌐</div>
          <div class="rd-card-body">
            <div class="rd-card-label">Internet</div>
            <div class="rd-card-value" id="rd-v-inet">--ms</div>
          </div>
        </div>
        <div class="rd-card" id="rd-dns">
          <div class="rd-card-icon">🔍</div>
          <div class="rd-card-body">
            <div class="rd-card-label">DNS</div>
            <div class="rd-card-value" id="rd-v-dns">--</div>
          </div>
        </div>
        <div class="rd-card" id="rd-https">
          <div class="rd-card-icon">🔒</div>
          <div class="rd-card-body">
            <div class="rd-card-label">HTTPS</div>
            <div class="rd-card-value" id="rd-v-https">--</div>
          </div>
        </div>
      </div>

      <div class="rd-info">
        <span><b>SSID:</b> <span id="rd-ssid">--</span></span>
        <span><b>IPv4:</b> <span id="rd-ipv4">--</span></span>
        <span><b>Gateway:</b> <span id="rd-gateway">--</span></span>
        <span><b>DNS:</b> <span id="rd-dnssrv">--</span></span>
        <span><b>Canal:</b> <span id="rd-canal">--</span></span>
      </div>

      <div class="rd-status">
        <span>Status:</span>
        <span class="rd-badge" id="rd-badge">AGUARDANDO</span>
      </div>

      <div class="rd-history">
        <div class="rd-history-header">
          <span>📋 Histórico</span>
          <button class="rd-btn-sm" onclick="RedeDashboard.limparHist()">🗑️</button>
        </div>
        <div class="rd-history-body" id="rd-history-body">
          <table class="rd-table">
            <thead>
              <tr><th>Hora</th><th>Status</th><th>Sinal</th><th>Roteador</th><th>Internet</th><th>Perda</th></tr>
            </thead>
            <tbody id="rd-tbody"></tbody>
          </table>
        </div>
      </div>

      <div class="rd-ai">
        <div class="rd-ai-header">
          <span>🤖 Análise IA</span>
          <button id="rd-ai-btn" class="rd-btn-sm" onclick="RedeDashboard.analisarIA()" disabled>🔮 Analisar</button>
        </div>
        <div class="rd-ai-body" id="rd-ai-body">
          <p>Ative o monitoramento e clique em "Analisar" para receber uma explicação da IA.</p>
        </div>
      </div>
    `;

    // Injetar estilos
    if (!document.getElementById('rd-styles')) {
      const s = document.createElement('style');
      s.id = 'rd-styles';
      s.textContent = this.getStyles();
      document.head.appendChild(s);
    }

    // Inserir no dashboard
    const dash = document.getElementById('dashboard');
    if (dash) dash.appendChild(div);
  },

  // Estilos CSS
  getStyles() {
    return `
      /* O painel é injetado dentro de #dashboard, que é um grid de métricas
         (repeat(auto-fit, minmax(160px,1fr))). Sem grid-column ele caía numa célula
         de ~187px e o layout inteiro dependia do container de métricas: os botões
         vazavam da caixa e os 6 mini-cards viravam uma pilha de 1130px de altura.
         grid-column: 1/-1 dá ao painel a linha inteira e o torna autônomo.
         O margin vira 0 porque o espaçamento já vem do gap do grid pai. */
      #rede-dash {
        grid-column: 1 / -1;
        background: var(--panel);
        border-radius: 16px;
        padding: 20px;
        margin: 0;
        border: 1px solid rgba(0,212,255,.2);
        font-family: 'Segoe UI', system-ui, sans-serif;
      }
      .rd-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
      .rd-title { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 700; color: var(--text); }
      .rd-icon { font-size: 24px; }
      /* flex-wrap evita que os 3 botões estourem a caixa em larguras estreitas. */
      .rd-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .rd-btn { padding: 8px 16px; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 13px; transition: all .2s; }
      .rd-btn:disabled { opacity: .4; cursor: not-allowed; }
      .rd-on { background: linear-gradient(135deg,#00c853,#00e676); color: #000; }
      .rd-off { background: linear-gradient(135deg,#ff5252,#ff1744); color: #fff; }
      .rd-test { background: linear-gradient(135deg,#2196f3,#21bbf3); color: #fff; }
      .rd-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,.3); }
      .rd-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; margin-bottom: 16px; }
      .rd-card { background: var(--card); border-radius: 12px; padding: 14px; display: flex; align-items: center; gap: 10px; border: 1px solid var(--border); transition: all .3s; }
      .rd-card:hover { background: rgba(255,255,255,.07); transform: translateY(-2px); }
      .rd-card-icon { font-size: 22px; }
      .rd-card-label { font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: .5px; }
      .rd-card-value { font-size: 16px; font-weight: 700; color: var(--text); }
      .rd-card-value.ok { color: #00e676; }
      .rd-card-value.warn { color: #ffc107; }
      .rd-card-value.err { color: #ff5252; }
      .rd-info { display: flex; flex-wrap: wrap; gap: 16px; padding: 12px; background: rgba(0,0,0,.2); border-radius: 10px; margin-bottom: 16px; font-size: 13px; color: #8b949e; }
      .rd-info b { color: var(--text); }
      .rd-status { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding: 12px; background: rgba(255,255,255,.03); border-radius: 10px; }
      .rd-badge { padding: 6px 18px; border-radius: 20px; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; }
      .rd-badge.saudavel { background: linear-gradient(135deg,#00c853,#00e676); color: #000; }
      .rd-badge.atencao { background: linear-gradient(135deg,#ffc107,#ffca28); color: #000; }
      .rd-badge.critico { background: linear-gradient(135deg,#ff5252,#ff1744); color: #fff; animation: rd-pulse 1.5s infinite; }
      @keyframes rd-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
      .rd-history { margin-bottom: 16px; }
      .rd-history-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-weight: 600; color: var(--text); }
      .rd-btn-sm { background: rgba(255,255,255,.1); border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; transition: all .2s; }
      .rd-btn-sm:hover { background: rgba(255,255,255,.15); }
      .rd-history-body { overflow-x: auto; background: rgba(0,0,0,.2); border-radius: 10px; }
      .rd-table { width: 100%; border-collapse: collapse; font-size: 12px; }
      .rd-table th { background: rgba(0,212,255,.15); color: #00d4ff; padding: 10px 8px; text-align: left; font-weight: 600; }
      .rd-table td { padding: 8px; color: var(--text); border-bottom: 1px solid rgba(255,255,255,.04); }
      .rd-table tr:hover { background: rgba(255,255,255,.03); }
      .rd-ai { background: rgba(0,0,0,.2); border-radius: 10px; padding: 14px; }
      .rd-ai-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-weight: 600; color: #a78bfa; }
      .rd-ai-body { color: var(--text); font-size: 13px; line-height: 1.6; }
      .rd-ai-body.loading { opacity: .6; }
      .rd-ai-body p { margin: 0; color: #8b949e; }
    `;
  },

  // Ativar monitoramento
  ativar() {
    if (this.monitoramentoAtivo) return;
    this.monitoramentoAtivo = true;
    this.defBotoes(true);
    this.log('Monitoramento ATIVADO');
    this.ciclo();
    this.intervaloId = setInterval(() => this.ciclo(), 10000);
  },

  // Desativar monitoramento
  desativar() {
    if (!this.monitoramentoAtivo) return;
    this.monitoramentoAtivo = false;
    clearInterval(this.intervaloId);
    this.defBotoes(false);
    this.log('Monitoramento PARADO');
  },

  // Definir estado dos botões
  defBotoes(ativo) {
    const on = document.getElementById('rd-btn-on');
    const off = document.getElementById('rd-btn-off');
    const ai = document.getElementById('rd-ai-btn');
    if (on) on.disabled = ativo;
    if (off) off.disabled = !ativo;
    if (ai) ai.disabled = !ativo;
  },

  // Executar ciclo de diagnóstico
  async ciclo() {
    try {
      // Obter info básica
      const info = await this.obterInfo();
      this.atualizarInfo(info);

      // Testar conectividade
      const teste = await this.testarRede();
      const resultado = { ...info, ...teste };
      
      // Classificar
      resultado.saude = this.classificar(resultado);
      resultado.ts = new Date();

      // Histórico
      this.historico.push(resultado);
      if (this.historico.length > this.maxHistorico) this.historico.shift();

      // UI
      this.atualizarUI(resultado);
    } catch (e) {
      console.error('Erro ciclo:', e);
      this.log('Erro: ' + e.message, 'err');
    }
  },

  // Testar agora
  testar() {
    this.log('Teste manual...');
    this.ciclo();
  },

  // Executar operação registrada via /run (polling de job)
  async executarOperacao(id) {
    try {
      const runRes = await fetch('http://127.0.0.1:7777/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Mestre-Client': 'v10-web' },
        body: JSON.stringify({ id })
      });
      const runData = await runRes.json();
      if (!runData.accepted || !runData.jobId) return null;

      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 500));
        const statusRes = await fetch(`http://127.0.0.1:7777/run-status?id=${runData.jobId}`);
        const status = await statusRes.json();
        if (status.done) return status.output || '';
      }
    } catch {}
    return null;
  },

  // Obter informações via operações registradas
  async obterInfo() {
    const info = { ssid: 'Offline', sinal: 0, canal: 0, gateway: '--', ipv4: '--', dns: '--' };
    try {
      const wifiOut = await this.executarOperacao('rede_info_wifi_completo');
      if (wifiOut) {
        const ssidMatch = wifiOut.match(/SSID\s*[:\-]\s*(.+)/i);
        const sinalMatch = wifiOut.match(/Sinal\s*[:\-]\s*(\d+)/i);
        const canalMatch = wifiOut.match(/Canal\s*[:\-]\s*(\d+)/i);
        if (ssidMatch) info.ssid = ssidMatch[1].trim();
        if (sinalMatch) info.sinal = parseInt(sinalMatch[1]);
        if (canalMatch) info.canal = parseInt(canalMatch[1]);
      }

      const ipOut = await this.executarOperacao('diagnostico_de_rede_completo');
      if (ipOut) {
        const ipv4Match = ipOut.match(/IPv4[\s.]+:\s+([\d.]+)/i);
        const gwMatch = ipOut.match(/Gateway Padr[ãa]o[\s.]+:\s+([\d.]+)/i);
        const dnsMatch = ipOut.match(/Servidores DNS[\s.]+:\s+([\d.,\s]+)/i);
        if (ipv4Match) info.ipv4 = ipv4Match[1].trim();
        if (gwMatch) info.gateway = gwMatch[1].trim();
        if (dnsMatch) info.dns = dnsMatch[1].trim();
      }
    } catch {}
    return info;
  },

  // Testar rede via operações registradas
  async testarRede() {
    const destino = this.destinos[this.idxDestino];
    this.idxDestino = (this.idxDestino + 1) % this.destinos.length;
    const res = { pgw: null, pex: null, dnsOk: false, httpsOk: false, destino };

    try {
      const gwOut = await this.executarOperacao('rede_testar_gateway');
      if (gwOut) {
        const gwMatch = gwOut.match(/(\d+)ms/);
        if (gwMatch) res.pgw = parseInt(gwMatch[1]);
      }

      const inetOut = await this.executarOperacao('rede_testar_internet_multiplos');
      if (inetOut) {
        const times = [...inetOut.matchAll(/OK\s+-\s+(\d+)ms/g)].map(m => parseInt(m[1]));
        if (times.length) res.pex = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
      }

      const dnsOut = await this.executarOperacao('rede_testar_dns_google_cloudflare');
      if (dnsOut) res.dnsOk = dnsOut.includes('OK');

      const httpsOut = await this.executarOperacao('rede_testar_https443');
      if (httpsOut) res.httpsOk = httpsOut.includes('HTTPS OK');
    } catch {}
    return res;
  },

  // Classificar saúde
  classificar(r) {
    if (!r.pgw || r.pex >= 9999) return 'CRÍTICO';
    if (!r.dnsOk && !r.httpsOk) return 'CRÍTICO';
    if (r.pex > 200 || r.pgw > 50) return 'ATENÇÃO';
    if (!r.dnsOk || !r.httpsOk) return 'ATENÇÃO';
    return 'SAUDÁVEL';
  },

  // Atualizar informações básicas
  atualizarInfo(info) {
    const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    set('rd-ssid', info.ssid);
    set('rd-ipv4', info.ipv4 || '--');
    set('rd-gateway', info.gateway || '--');
    set('rd-dnssrv', info.dns || '--');
    set('rd-canal', info.canal || '--');
    set('rd-v-sinal', info.sinal ? `${info.sinal}%` : '--%');

    const wifiEl = document.getElementById('rd-v-wifi');
    if (info.ssid && info.ssid !== 'Offline') {
      wifiEl.textContent = 'CONECTADO';
      wifiEl.className = 'rd-card-value ok';
    } else {
      wifiEl.textContent = 'OFFLINE';
      wifiEl.className = 'rd-card-value err';
    }
  },

  // Atualizar UI
  atualizarUI(r) {
    // Latências
    const setVal = (id, val, ok) => {
      const e = document.getElementById(id);
      if (e) {
        e.textContent = val != null ? `${val}ms` : '--';
        e.className = `rd-card-value ${ok ? 'ok' : 'warn'}`;
      }
    };
    setVal('rd-v-rota', r.pgw, r.pgw && r.pgw < 50);
    setVal('rd-v-inet', r.pex, r.pex && r.pex < 200);

    // DNS/HTTPS
    const setOk = (id, ok) => {
      const e = document.getElementById(id);
      if (e) {
        e.textContent = ok ? 'OK' : 'FALHA';
        e.className = `rd-card-value ${ok ? 'ok' : 'err'}`;
      }
    };
    setOk('rd-v-dns', r.dnsOk);
    setOk('rd-v-https', r.httpsOk);

    // Badge
    const badge = document.getElementById('rd-badge');
    if (badge) {
      badge.textContent = r.saude;
      badge.className = `rd-badge ${r.saude.toLowerCase()}`;
    }

    // Histórico
    this.atualizarHist();
  },

  // Atualizar histórico
  atualizarHist() {
    const tbody = document.getElementById('rd-tbody');
    if (!tbody) return;
    const ultimos = this.historico.slice(-8).reverse();
    tbody.innerHTML = ultimos.map(h => `
      <tr>
        <td>${h.ts.toLocaleTimeString('pt-BR')}</td>
        <td><span class="rd-badge rd-badge-${h.saude.toLowerCase()}">${h.saude}</span></td>
        <td>${h.sinal}%</td>
        <td>${h.pgw != null ? h.pgw + 'ms' : '--'}</td>
        <td>${h.pex != null ? h.pex + 'ms' : '--'}</td>
        <td>--</td>
      </tr>
    `).join('');
  },

  // Limpar histórico
  limparHist() {
    this.historico = [];
    this.atualizarHist();
    this.log('Histórico limpo');
  },

  // Analisar com IA
  async analisarIA() {
    const ult = this.historico[this.historico.length - 1];
    if (!ult) { this.log('Sem dados para analisar'); return; }

    const body = document.getElementById('rd-ai-body');
    body.innerHTML = '<p>🤖 Analisando...</p>';
    body.classList.add('loading');

    try {
      const prompt = `Analise este diagnóstico de rede Wi-Fi e explique em português:

SSID: ${ult.ssid}
Sinal: ${ult.sinal}%
Gateway: ${ult.gateway}
Latência Roteador: ${ult.pgw != null ? ult.pgw + 'ms' : 'sem resposta'}
Latência Internet: ${ult.pex != null ? ult.pex + 'ms' : 'sem resposta'}
DNS: ${ult.dnsOk ? 'OK' : 'FALHOU'}
HTTPS: ${ult.httpsOk ? 'OK' : 'FALHOU'}
Status: ${ult.saude}

O que pode estar causando problemas?`;

      const res = await fetch(`${this.ollamaHost}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.ollamaModel, messages: [{ role: 'user', content: prompt }], stream: false })
      });

      if (!res.ok) throw new Error('Ollama offline');
      const d = await res.json();
      body.innerHTML = `<div style="background:rgba(139,92,246,.1);padding:12px;border-radius:8px;border-left:3px solid #8b5cf6">${d.message.content.replace(/\n/g, '<br>')}</div>`;
      this.log('Análise IA concluída');
    } catch (e) {
      body.innerHTML = `<p style="color:#ff5252">❌ Erro: ${e.message}</p>`;
    }
    body.classList.remove('loading');
  },

  // Log simples
  log(msg, tipo = 'info') {
    console.log(`[RedeDash] ${msg}`);
  }
};

// Inicializar
document.addEventListener('DOMContentLoaded', () => setTimeout(() => RedeDashboard.init(), 800));
window.RedeDashboard = RedeDashboard;
