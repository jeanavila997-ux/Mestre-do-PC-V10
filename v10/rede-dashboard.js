/**
 * Módulo de Diagnóstico de Rede - Mestre do PC V10
 * Integração do Casa5G Dashboard com o painel principal
 * Usa o launcher (mesma origem) para executar diagnósticos via /run
 */

const RedeDashboard = {
  // Estado
  monitoramentoAtivo: false,
  timeoutId: null,         // agendamento do próximo ciclo
  contadorId: null,        // relógio do contador "próxima verificação"
  proximaExecucao: null,   // timestamp da próxima verificação
  historico: [],
  // Intervalo de atualização (padrão 5 min; configurável: 5/15/30 min / 1h)
  intervaloMs: 5 * 60 * 1000,
  chaveIntervalo: 'redeDashIntervaloMin',
  ollamaModel: 'qwen2.5-coder:3b-instruct',
  maxHistorico: 50,
  chaveHistorico: 'redeDashHistorico',

  // Inicialização
  init() {
    this.carregarIntervalo();
    this.criarPainel();
    this.carregarHistorico();
    // Fechar o menu de configuração ao clicar fora dele
    document.addEventListener('click', () => {
      const menu = document.getElementById('rd-cfg-menu');
      if (menu) menu.classList.remove('aberto');
    });
    console.log('📡 Rede Dashboard V3 - Intervalo configurável!');
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
          <div class="rd-cfg-wrap">
            <button id="rd-btn-cfg" class="rd-btn rd-cfg" title="Tempo de atualização" onclick="RedeDashboard.abrirConfig(event)">⚙️ <span id="rd-cfg-label">5min</span></button>
            <div class="rd-cfg-menu" id="rd-cfg-menu">
              <div class="rd-cfg-title">Atualizar a cada:</div>
              <button class="rd-cfg-op" data-ms="300000" onclick="RedeDashboard.selecionarIntervalo(300000)">5 minutos</button>
              <button class="rd-cfg-op" data-ms="900000" onclick="RedeDashboard.selecionarIntervalo(900000)">15 minutos</button>
              <button class="rd-cfg-op" data-ms="1800000" onclick="RedeDashboard.selecionarIntervalo(1800000)">30 minutos</button>
              <button class="rd-cfg-op" data-ms="3600000" onclick="RedeDashboard.selecionarIntervalo(3600000)">1 hora</button>
            </div>
          </div>
        </div>
      </div>
      
      <div class="rd-grid">
        <div class="rd-card" id="rd-wifi">
          <div class="rd-card-icon">📶</div>
          <div class="rd-card-body">
            <div class="rd-card-label">Conexão</div>
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
        <div class="rd-card" id="rd-perda">
          <div class="rd-card-icon">📉</div>
          <div class="rd-card-body">
            <div class="rd-card-label">Perda</div>
            <div class="rd-card-value" id="rd-v-perda">--</div>
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
        <span class="rd-proxima" id="rd-proxima"></span>
      </div>

      <div class="rd-offline" id="rd-offline">⚠️ Sem contato com o launcher — o painel não consegue executar diagnósticos. Verifique se o Mestre do PC está rodando (atalho da Área de Trabalho) e clique em TESTAR.</div>

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

    // Refletir o intervalo persistido no botão de configuração
    const cfgLabel = document.getElementById('rd-cfg-label');
    if (cfgLabel) cfgLabel.textContent = this.formatarIntervalo(this.intervaloMs);
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
      /* Botão/menu de configuração do intervalo de atualização */
      .rd-cfg-wrap { position: relative; display: inline-block; }
      .rd-cfg { background: linear-gradient(135deg,#4b5563,#374151); color: #fff; }
      .rd-cfg-menu { display: none; position: absolute; right: 0; top: calc(100% + 6px); background: #161b22; border: 1px solid var(--border); border-radius: 10px; padding: 8px; min-width: 170px; z-index: 1000; box-shadow: 0 8px 24px rgba(0,0,0,.5); }
      .rd-cfg-menu.aberto { display: block; }
      .rd-cfg-title { font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: .5px; padding: 4px 8px 8px; }
      .rd-cfg-op { display: block; width: 100%; text-align: left; background: transparent; border: none; color: var(--text); padding: 8px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; transition: background .15s; }
      .rd-cfg-op:hover { background: rgba(255,255,255,.08); }
      .rd-cfg-op.ativa { background: rgba(0,212,255,.15); color: #00d4ff; font-weight: 700; }
      /* Contador regressivo da próxima verificação */
      .rd-proxima { margin-left: auto; color: #8b949e; font-size: 12px; }
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
      .rd-badge.offline { background: linear-gradient(135deg,#6b7280,#374151); color: #fff; }
      .rd-offline { display: none; margin-bottom: 16px; padding: 10px 14px; border-radius: 10px; background: rgba(255,82,82,.1); border: 1px solid rgba(255,82,82,.35); color: #ff8a80; font-size: 13px; line-height: 1.5; }
      .rd-offline.on { display: block; }
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

  // Ativar monitoramento.
  // Agendamento em cadeia (setTimeout): o próximo ciclo só é agendado depois
  // que o atual termina — evita sobreposição de ciclos e erros 429 do launcher.
  ativar() {
    if (this.monitoramentoAtivo) return;
    this.monitoramentoAtivo = true;
    this.defBotoes(true);
    this.log('Monitoramento ATIVADO (a cada ' + this.formatarIntervalo(this.intervaloMs) + ')');
    this.ciclo().finally(() => { if (this.monitoramentoAtivo) this.agendar(); });
    this.iniciarContador();
  },

  // Desativar monitoramento
  desativar() {
    if (!this.monitoramentoAtivo) return;
    this.monitoramentoAtivo = false;
    clearTimeout(this.timeoutId);
    this.proximaExecucao = null;
    this.pararContador();
    this.defBotoes(false);
    this.log('Monitoramento PARADO');
  },

  // Agendar próximo ciclo
  agendar() {
    clearTimeout(this.timeoutId);
    this.proximaExecucao = Date.now() + this.intervaloMs;
    this.timeoutId = setTimeout(() => {
      this.ciclo().finally(() => { if (this.monitoramentoAtivo) this.agendar(); });
    }, this.intervaloMs);
  },

  // ==== Configuração do tempo de atualização (5/15/30 min / 1 hora) ====

  opcoesIntervaloMin() {
    return [5, 15, 30, 60];
  },

  carregarIntervalo() {
    try {
      const salvo = parseInt(localStorage.getItem(this.chaveIntervalo), 10);
      if (this.opcoesIntervaloMin().includes(salvo)) this.intervaloMs = salvo * 60 * 1000;
    } catch {}
  },

  salvarIntervalo(min) {
    try { localStorage.setItem(this.chaveIntervalo, String(min)); } catch {}
  },

  formatarIntervalo(ms) {
    const m = Math.round(ms / 60000);
    return m >= 60 ? '1h' : `${m}min`;
  },

  abrirConfig(ev) {
    if (ev) ev.stopPropagation();
    const menu = document.getElementById('rd-cfg-menu');
    if (menu) {
      this.marcarOpcaoAtiva();
      menu.classList.toggle('aberto');
    }
  },

  selecionarIntervalo(ms) {
    this.intervaloMs = ms;
    this.salvarIntervalo(Math.round(ms / 60000));
    const label = document.getElementById('rd-cfg-label');
    if (label) label.textContent = this.formatarIntervalo(ms);
    const menu = document.getElementById('rd-cfg-menu');
    if (menu) menu.classList.remove('aberto');
    // Se o monitoramento estiver ativo, reagendar já com o novo intervalo
    if (this.monitoramentoAtivo) this.agendar();
    this.log('Intervalo de atualização: ' + this.formatarIntervalo(ms));
  },

  marcarOpcaoAtiva() {
    const menu = document.getElementById('rd-cfg-menu');
    if (!menu) return;
    menu.querySelectorAll('.rd-cfg-op').forEach(btn => {
      btn.classList.toggle('ativa', parseInt(btn.dataset.ms, 10) === this.intervaloMs);
    });
  },

  // Contador regressivo "próxima verificação em mm:ss" (apenas visual, a cada 1s)
  iniciarContador() {
    this.pararContador();
    const atualizar = () => {
      const el = document.getElementById('rd-proxima');
      if (!el) return;
      if (!this.monitoramentoAtivo || !this.proximaExecucao) { el.textContent = ''; return; }
      const restante = Math.max(0, this.proximaExecucao - Date.now());
      const m = Math.floor(restante / 60000);
      const s = Math.floor((restante % 60000) / 1000);
      el.textContent = `Próxima verificação em ${m}:${String(s).padStart(2, '0')}`;
    };
    atualizar();
    this.contadorId = setInterval(atualizar, 1000);
  },

  pararContador() {
    clearInterval(this.contadorId);
    const el = document.getElementById('rd-proxima');
    if (el) el.textContent = '';
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
      // Antes de qualquer coisa: verificar contato com o launcher (mesma origem).
      // Se ele estiver fora, avisar na tela em vez de deixar tudo em "--".
      const online = await this.checarLauncher();
      const aviso = document.getElementById('rd-offline');
      if (!online) {
        const badge = document.getElementById('rd-badge');
        if (badge) { badge.textContent = 'LAUNCHER OFF'; badge.className = 'rd-badge offline'; }
        if (aviso) aviso.classList.add('on');
        this.log('Launcher offline', 'err');
        return;
      }
      if (aviso) aviso.classList.remove('on');

      // Obter info básica
      const info = await this.obterInfo();
      this.atualizarInfo(info);

      // Testar conectividade
      const teste = await this.testarRede();
      const resultado = { ...info, ...teste };

      // Classificar
      resultado.saude = this.classificar(resultado);
      resultado.ts = new Date();

      // Histórico (persistido em localStorage)
      this.historico.push(resultado);
      if (this.historico.length > this.maxHistorico) this.historico.shift();
      this.salvarHistorico();

      // UI
      this.atualizarUI(resultado);
    } catch (e) {
      console.error('Erro ciclo:', e);
      this.log('Erro: ' + e.message, 'err');
    }
  },

  // Verificar se o launcher responde (liveness da própria origem)
  async checarLauncher() {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch('/', { method: 'GET', signal: ctrl.signal });
      clearTimeout(timer);
      return r.ok;
    } catch { return false; }
  },

  // Testar agora
  testar() {
    this.log('Teste manual...');
    this.ciclo();
  },

  // Executar operação registrada via /run (polling de job)
  async executarOperacao(id) {
    try {
      const runRes = await fetch('/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Mestre-Client': 'v10-web' },
        body: JSON.stringify({ id })
      });
      const runData = await runRes.json();
      if (!runData.accepted || !runData.jobId) return null;

      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 500));
        const statusRes = await fetch(`/run-status?id=${runData.jobId}`);
        const status = await statusRes.json();
        if (status.done) return status.output || '';
      }
    } catch {}
    return null;
  },

  // Obter informações via operações registradas
  async obterInfo() {
    const info = { tipo: 'DESCONHECIDO', ssid: '—', sinal: 0, canal: 0, gateway: '--', ipv4: '--', dns: '--' };
    try {
      const wifiOut = await this.executarOperacao('rede_info_wifi_completo');
      if (wifiOut) {
        // Estado "conectado" (sem acento no output do netsh) confirma Wi-Fi ativo
        const estadoMatch = wifiOut.match(/Estado\s*:\s*(conectado|desconectado)/i);
        if (estadoMatch && estadoMatch[1].toLowerCase() === 'conectado') info.tipo = 'WIFI';
        const ssidMatch = wifiOut.match(/SSID\s*[:\-]\s*(.+)/i);
        const sinalMatch = wifiOut.match(/Sinal\s*[:\-]\s*(\d+)/i);
        const canalMatch = wifiOut.match(/Canal\s*[:\-]\s*(\d+)/i);
        if (ssidMatch) info.ssid = ssidMatch[1].trim();
        if (sinalMatch) info.sinal = parseInt(sinalMatch[1], 10);
        if (canalMatch) info.canal = parseInt(canalMatch[1], 10);
      }

      const ipOut = await this.executarOperacao('diagnostico_de_rede_completo');
      if (ipOut) {
        const ipv4Match = ipOut.match(/IPv4[\s.]+:\s+([\d.]+)/i);
        // "Padr.?o" aceita tanto "Padrão" quanto "Padr?o" (launcher captura em
        // codepage OEM e perde acentos) — o regex antigo não casava por causa disso.
        const gwMatch = ipOut.match(/(?:Gateway Padr.?o|Default Gateway)[\s.]+:\s+([\d.]+)/i);
        const dnsMatch = ipOut.match(/Servidores DNS[\s.]+:\s+([\d.,\s]+)/i);
        if (ipv4Match) info.ipv4 = ipv4Match[1].trim();
        if (gwMatch) info.gateway = gwMatch[1].trim();
        if (dnsMatch) info.dns = dnsMatch[1].trim();

        // Tipo de conexão pela seção do adaptador ATIVO no ipconfig:
        // a seção que contém o IPv4 revela se é cabo (Ethernet) ou sem fio.
        if (info.tipo !== 'WIFI') {
          const secoesComIp = [];
          let secao = '';
          for (const linha of ipOut.split('\n')) {
            const mSecao = linha.match(/^\s*Adaptador\s+(.+?):?\s*$/i);
            if (mSecao) { secao = mSecao[1]; continue; }
            if (/IPv4[\s.]+:\s+[\d.]+/i.test(linha)) secoesComIp.push(secao);
          }
          if (secoesComIp.some(s => /sem fio|wireless|wi-?fi/i.test(s))) info.tipo = 'WIFI';
          else if (secoesComIp.some(s => /ethernet/i.test(s))) info.tipo = 'ETHERNET';
        }
      }

      // Sem IP e sem Wi-Fi conectado = offline
      if (info.ipv4 === '--' && info.tipo !== 'WIFI') info.tipo = 'OFFLINE';
    } catch {}
    return info;
  },

  // Testar rede via operações registradas
  async testarRede() {
    const res = { pgw: null, pex: null, perda: null, dnsOk: false, httpsOk: false };

    try {
      // Latência do roteador: o PowerShell 5.1 devolve uma tabela em que o tempo
      // é a ÚLTIMA coluna numérica (ex.: "DESKTOP-... 192.168.3.1 32 0") — sem
      // sufixo "ms". O regex antigo /(\d+)ms/ nunca casava e o card vivia em "--".
      const gwOut = await this.executarOperacao('rede_testar_gateway');
      if (gwOut) {
        const respostas = [];
        for (const linha of gwOut.split('\n')) {
          const l = linha.trim();
          if (!l || l.startsWith('-') || /^(Source|Test-Connection|Gateway)/i.test(l)) continue;
          const t = l.split(/\s+/);
          const ultimo = t[t.length - 1];
          if (t.length >= 4 && /^\d+$/.test(ultimo) && t[1] && t[1].includes('.')) {
            respostas.push(parseInt(ultimo, 10));
          }
        }
        if (respostas.length) res.pgw = Math.round(respostas.reduce((a, b) => a + b, 0) / respostas.length);
      }

      // Latência de internet + PERDA REAL: "[8.8.8.8] OK - 72ms" vs "[IP] FALHOU"
      const inetOut = await this.executarOperacao('rede_testar_internet_multiplos');
      if (inetOut) {
        const times = [...inetOut.matchAll(/OK\s+-\s+(\d+)\s?ms/g)].map(m => parseInt(m[1], 10));
        if (times.length) res.pex = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
        const alvos = (inetOut.match(/^\[.*\]/gm) || []).length;
        const falhas = (inetOut.match(/FALHOU/g) || []).length;
        if (alvos > 0) res.perda = Math.round(falhas / alvos * 100);
      }

      const dnsOut = await this.executarOperacao('rede_testar_dns_google_cloudflare');
      if (dnsOut) res.dnsOk = dnsOut.includes('OK');

      const httpsOut = await this.executarOperacao('rede_testar_https443');
      if (httpsOut) res.httpsOk = httpsOut.includes('HTTPS OK');
    } catch {}
    return res;
  },

  // Classificar saúde
  // Obs.: usar "x == null" (e não "!x") — latência 0ms do roteador é PERFEITA,
  // mas o "!r.pgw" antigo tratava 0 como falha e marcava CRÍTICO à toa.
  classificar(r) {
    if (r.pex == null && r.perda != null && r.perda >= 75) return 'CRÍTICO';
    if (r.pgw == null && r.pex == null) return 'CRÍTICO';
    if (!r.dnsOk && !r.httpsOk) return 'CRÍTICO';
    if (r.pex > 200 || (r.pgw != null && r.pgw > 50)) return 'ATENÇÃO';
    if (r.perda > 0 || !r.dnsOk || !r.httpsOk) return 'ATENÇÃO';
    return 'SAUDÁVEL';
  },

  // Atualizar informações básicas (adaptado ao tipo de conexão real)
  atualizarInfo(info) {
    const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    const conEl = document.getElementById('rd-v-wifi');
    const conIcon = document.querySelector('#rd-wifi .rd-card-icon');
    const sinalEl = document.getElementById('rd-v-sinal');
    const setSinal = (txt, cls) => { if (sinalEl) { sinalEl.textContent = txt; sinalEl.className = 'rd-card-value ' + cls; } };

    if (info.tipo === 'ETHERNET') {
      // Conexão por cabo: SSID/sinal não se aplicam
      if (conIcon) conIcon.textContent = '🔌';
      if (conEl) { conEl.textContent = 'ETHERNET'; conEl.className = 'rd-card-value ok'; }
      setSinal('Cabo', 'ok');
      set('rd-ssid', '— (cabo)');
      set('rd-canal', '—');
    } else if (info.tipo === 'WIFI') {
      if (conIcon) conIcon.textContent = '📶';
      if (conEl) { conEl.textContent = 'WI-FI'; conEl.className = 'rd-card-value ok'; }
      setSinal(info.sinal ? info.sinal + '%' : '--', info.sinal >= 70 ? 'ok' : info.sinal >= 40 ? 'warn' : 'err');
      set('rd-ssid', info.ssid);
      set('rd-canal', info.canal || '--');
    } else if (info.ipv4 && info.ipv4 !== '--') {
      // Conectado por outro meio (VPN, USB etc.)
      if (conIcon) conIcon.textContent = '🌐';
      if (conEl) { conEl.textContent = 'CONECTADO'; conEl.className = 'rd-card-value ok'; }
      setSinal('--', '');
      set('rd-ssid', info.ssid);
      set('rd-canal', info.canal || '--');
    } else {
      if (conIcon) conIcon.textContent = '❌';
      if (conEl) { conEl.textContent = 'OFFLINE'; conEl.className = 'rd-card-value err'; }
      setSinal('--', 'err');
      set('rd-ssid', info.ssid);
      set('rd-canal', info.canal || '--');
    }

    set('rd-ipv4', info.ipv4 || '--');
    set('rd-gateway', info.gateway || '--');
    set('rd-dnssrv', info.dns || '--');
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
    setVal('rd-v-rota', r.pgw, r.pgw != null && r.pgw < 50);
    setVal('rd-v-inet', r.pex, r.pex != null && r.pex < 200);

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

    // Perda de pacotes real (medida nos 4 alvos externos)
    const perdaEl = document.getElementById('rd-v-perda');
    if (perdaEl) {
      perdaEl.textContent = r.perda != null ? r.perda + '%' : '--';
      perdaEl.className = 'rd-card-value ' + (r.perda == null ? 'warn' : r.perda === 0 ? 'ok' : r.perda <= 25 ? 'warn' : 'err');
    }

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
        <td>${h.tipo === 'ETHERNET' ? '—' : h.sinal + '%'}</td>
        <td>${h.pgw != null ? h.pgw + 'ms' : '--'}</td>
        <td>${h.pex != null ? h.pex + 'ms' : '--'}</td>
        <td>${h.perda != null ? h.perda + '%' : '--'}</td>
      </tr>
    `).join('');
  },

  // Limpar histórico
  limparHist() {
    this.historico = [];
    try { localStorage.removeItem(this.chaveHistorico); } catch {}
    this.atualizarHist();
    this.log('Histórico limpo');
  },

  // Histórico persistente (localStorage): sobrevive a recarregamentos da página
  carregarHistorico() {
    try {
      const salvo = JSON.parse(localStorage.getItem(this.chaveHistorico) || '[]');
      if (Array.isArray(salvo)) {
        this.historico = salvo
          .map(h => ({ ...h, ts: new Date(h.ts) }))
          .filter(h => h.ts instanceof Date && !isNaN(h.ts.getTime()))
          .slice(-this.maxHistorico);
        this.atualizarHist();
      }
    } catch {}
  },

  salvarHistorico() {
    try {
      localStorage.setItem(this.chaveHistorico, JSON.stringify(this.historico));
    } catch {}
  },

  // Analisar com IA
  async analisarIA() {
    const ult = this.historico[this.historico.length - 1];
    if (!ult) { this.log('Sem dados para analisar'); return; }

    const body = document.getElementById('rd-ai-body');
    body.innerHTML = '<p>🤖 Analisando...</p>';
    body.classList.add('loading');

    try {
      const prompt = `Analise este diagnóstico de rede e explique em português:

Tipo de conexão: ${ult.tipo || '--'}
SSID: ${ult.ssid}
Sinal: ${ult.sinal ? ult.sinal + '%' : '—'}
Gateway: ${ult.gateway}
Latência Roteador: ${ult.pgw != null ? ult.pgw + 'ms' : 'sem resposta'}
Latência Internet: ${ult.pex != null ? ult.pex + 'ms' : 'sem resposta'}
Perda de pacotes: ${ult.perda != null ? ult.perda + '%' : 'não medida'}
DNS: ${ult.dnsOk ? 'OK' : 'FALHOU'}
HTTPS: ${ult.httpsOk ? 'OK' : 'FALHOU'}
Status: ${ult.saude}

O que pode estar causando problemas?`;

      // Vai pelo proxy do launcher (mesma origem), nunca direto no Ollama: é lá
      // que roda o checkPromptInjection(). O prompt embute dados não confiáveis
      // (o SSID vem de redes Wi-Fi vizinhas), então precisa passar pelo guard.
      const res = await fetch('/ollama/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Mestre-Client': 'v10-web' },
        body: JSON.stringify({ model: this.ollamaModel, messages: [{ role: 'user', content: prompt }], stream: false })
      });

      if (!res.ok) {
        const motivo = await res.json().catch(() => null);
        throw new Error(motivo && motivo.error ? motivo.error : 'Ollama offline');
      }
      const d = await res.json();
      const texto = (d && d.message && typeof d.message.content === 'string') ? d.message.content : '';
      // Renderizado como texto puro (textContent), nunca como HTML: a resposta do
      // modelo pode ter sido influenciada por dados não confiáveis (ex.: SSID de
      // uma rede Wi-Fi próxima) e não deve ser interpretada como markup/JS.
      body.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'background:rgba(139,92,246,.1);padding:12px;border-radius:8px;border-left:3px solid #8b5cf6;white-space:pre-wrap';
      wrap.textContent = texto;
      body.appendChild(wrap);
      this.log('Análise IA concluída');
    } catch (e) {
      body.innerHTML = '';
      const err = document.createElement('p');
      err.style.color = '#ff5252';
      err.textContent = '❌ Erro: ' + (e && e.message ? e.message : String(e));
      body.appendChild(err);
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
