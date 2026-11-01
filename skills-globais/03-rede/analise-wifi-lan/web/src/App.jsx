import { useMemo, useState } from 'react';
import data from './dados.json';

const SECTIONS = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'wifi', label: 'Wi-Fi antes/depois' },
  { id: 'speed', label: 'Speed & latência' },
  { id: 'lan', label: 'LAN / máquinas' },
  { id: 'usuarios', label: 'Usuários' },
  { id: 'vizinhanca', label: 'Vizinhança Wi-Fi' },
  { id: 'codigos', label: 'Códigos usados' },
  { id: 'scripts', label: 'Scripts da pasta' },
];

function Kpi({ item }) {
  return (
    <div className="kpi">
      <div className="label">{item.label}</div>
      <div className="value">
        {item.value}
        <small>{item.unit}</small>
      </div>
      {item.delta ? <div className="delta">{item.delta}</div> : null}
    </div>
  );
}

function WifiCard({ title, w }) {
  const keys = ['ssid', 'banda', 'canal', 'bssid', 'sinal', 'rssi', 'rxMbps', 'txMbps', 'ip', 'auth'];
  return (
    <div className="card">
      <h3>{title}</h3>
      <table>
        <tbody>
          {keys.map((k) => (
            <tr key={k}>
              <th>{k}</th>
              <td className="mono">{String(w[k] ?? '—')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SpeedBars({ rows, max }) {
  return (
    <div className="bars">
      {rows.map((r) => (
        <div key={r.alvo} className="bar-row">
          <div>
            <div className="muted" style={{ fontSize: '0.78rem', marginBottom: 4 }}>
              {r.alvo}
            </div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${Math.min(100, (r.mbps / max) * 100)}%` }} />
            </div>
          </div>
          <span className="mono">{r.mbps}</span>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [section, setSection] = useState('resumo');
  const maxSpeed = useMemo(() => {
    const all = [...data.speed.antes24, ...data.speed.depois5g].map((x) => x.mbps);
    return Math.max(100, ...all) * 1.1;
  }, []);

  let body = null;

  if (section === 'resumo') {
    body = (
      <>
        <div className="kpis">
          {data.resumo.kpis.map((k) => (
            <Kpi key={k.label} item={k} />
          ))}
        </div>
        <div className="card">
          <h2>Conclusão</h2>
          <p>{data.resumo.conclusao}</p>
          <p className="muted">{data.resumo.recomendacao}</p>
        </div>
        <div className="card">
          <h2>Contexto</h2>
          <table>
            <tbody>
              <tr><th>Host</th><td className="mono">{data.meta.host}</td></tr>
              <tr><th>Usuário</th><td>{data.meta.usuario}</td></tr>
              <tr><th>Coletado em</th><td>{data.meta.coletadoEm}</td></tr>
              <tr><th>Ferramentas</th><td>{data.meta.ferramentas.join(' · ')}</td></tr>
            </tbody>
          </table>
        </div>
      </>
    );
  }

  if (section === 'wifi') {
    body = (
      <>
        <div className="compare">
          <WifiCard title="Antes — REDE-24 (2,4 GHz)" w={data.wifi.antes} />
          <div className="vs">VS</div>
          <WifiCard title="Depois — REDE-5G" w={data.wifi.depois} />
        </div>
        <div className="card">
          <h2>Gateway / DNS / perfis</h2>
          <table>
            <tbody>
              <tr>
                <th>Gateway</th>
                <td className="mono">
                  {data.wifi.gateway.ip} (~{data.wifi.gateway.latenciaMs} ms) — {data.wifi.gateway.vendor}
                </td>
              </tr>
              <tr><th>DNS</th><td className="mono">{data.wifi.dns.join(', ')}</td></tr>
              <tr><th>Perfis salvos</th><td>{data.wifi.perfisSalvos.join(', ')}</td></tr>
            </tbody>
          </table>
        </div>
      </>
    );
  }

  if (section === 'speed') {
    body = (
      <>
        <div className="grid2">
          <div className="card">
            <h2>Download/Upload — 2,4 GHz</h2>
            <SpeedBars rows={data.speed.antes24} max={maxSpeed} />
          </div>
          <div className="card">
            <h2>Download/Upload — 5 GHz</h2>
            <SpeedBars rows={data.speed.depois5g} max={maxSpeed} />
          </div>
        </div>
        <div className="card">
          <h2>Latência</h2>
          <table>
            <thead>
              <tr><th>Host</th><th>avg ms</th></tr>
            </thead>
            <tbody>
              {data.speed.latencia.map((l) => (
                <tr key={l.host}>
                  <td className="mono">{l.host}</td>
                  <td>{l.avgMs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>ISP / IP público</h2>
          <table>
            <tbody>
              {Object.entries(data.speed.isp).map(([k, v]) => (
                <tr key={k}>
                  <th>{k}</th>
                  <td className="mono">{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: '0.8rem' }}>
            <span className="pill bad">Mestre speedtest mini</span>{' '}
            {data.speed.mestreSpeedtestMini.status} — {data.speed.mestreSpeedtestMini.motivo} (
            {data.speed.mestreSpeedtestMini.valorEnganoso})
          </p>
        </div>
      </>
    );
  }

  if (section === 'lan') {
    body = (
      <>
        <div className="card">
          <h2>Dispositivos em {data.lan.rede}</h2>
          <table>
            <thead>
              <tr>
                <th>IP</th><th>MAC</th><th>Vendor</th><th>Papel</th><th>ms</th>
              </tr>
            </thead>
            <tbody>
              {data.lan.dispositivos.map((d) => (
                <tr key={d.ip}>
                  <td className="mono">{d.ip}</td>
                  <td className="mono">{d.mac}</td>
                  <td>{d.vendor}</td>
                  <td>{d.papel}</td>
                  <td>{d.latMs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Adaptadores ativos</h2>
          <table>
            <thead>
              <tr><th>Nome</th><th>Descrição</th><th>Link</th></tr>
            </thead>
            <tbody>
              {data.lan.adaptadoresAtivos.map((a) => (
                <tr key={a.nome}>
                  <td>{a.nome}</td>
                  <td>{a.desc}</td>
                  <td className="mono">{a.link}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  if (section === 'usuarios') {
    body = (
      <>
        <div className="card">
          <h2>Sessão</h2>
          <p>
            <span className="pill ok">ativo</span> {data.usuarios.sessao} · {data.usuarios.dominio}
          </p>
        </div>
        <div className="grid2">
          <div className="card">
            <h2>Contas locais</h2>
            <table>
              <thead>
                <tr><th>Nome</th><th>Enabled</th><th>LastLogon</th></tr>
              </thead>
              <tbody>
                {data.usuarios.contasLocais.map((u) => (
                  <tr key={u.nome}>
                    <td>{u.nome}</td>
                    <td>
                      {u.enabled ? <span className="pill ok">sim</span> : <span className="pill warn">não</span>}
                    </td>
                    <td className="mono">{u.lastLogon || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h2>Processos por usuário</h2>
            <table>
              <thead>
                <tr><th>User</th><th>Count</th></tr>
              </thead>
              <tbody>
                {data.usuarios.processosPorUsuario.map((p) => (
                  <tr key={p.user}>
                    <td className="mono">{p.user}</td>
                    <td>{p.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  }

  if (section === 'vizinhanca') {
    body = (
      <div className="card">
        <h2>SSIDs visíveis (amostra)</h2>
        <table>
          <thead>
            <tr>
              <th>SSID</th><th>Banda</th><th>Canal</th><th>Sinal</th><th>Nota</th>
            </tr>
          </thead>
          <tbody>
            {data.vizinhanca.map((v) => (
              <tr key={v.ssid + v.banda}>
                <td>{v.ssid}</td>
                <td>{v.banda}</td>
                <td className="mono">{String(v.canal)}</td>
                <td>{v.sinal}</td>
                <td className="muted">{v.nota || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (section === 'codigos') {
    body = (
      <div className="cmd-list">
        {data.comandos.map((c) => (
          <div key={c.id} className="cmd-item">
            <details open={c.id === 'analise-script'}>
              <summary>
                {c.titulo} <span className="pill warn">{c.shell}</span>
              </summary>
              <div className="body">
                <pre className="code">{c.codigo}</pre>
              </div>
            </details>
          </div>
        ))}
      </div>
    );
  }

  if (section === 'scripts') {
    body = (
      <>
        <div className="card">
          <h2>Arquivos desta pasta</h2>
          <pre className="code">{`analisar-rede-mestre.ps1     → coleta ao vivo + JSON live
dados-coletados.json         → snapshot da sessão
dashboard-rede.html          → HTML React CDN (repartir)
web/                         → este app Vite
scripts/gerar-escaping-ips.sh → híbrido ipset/iptables (Linux)`}</pre>
        </div>
        <div className="card">
          <h2>Rodar a análise</h2>
          <pre className="code">{`cd ..
pwsh -NoProfile -File .\\analisar-rede-mestre.ps1`}</pre>
        </div>
        <div className="card">
          <h2>Dev server</h2>
          <pre className="code">{`npm install
npm run dev`}</pre>
        </div>
      </>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>Mestre · Rede</strong>
          <span>Vite + React · análise Wi-Fi / LAN</span>
        </div>
        <nav className="nav">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={section === s.id ? 'active' : ''}
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="main">
        <div className="hero">
          <div>
            <h1>{SECTIONS.find((s) => s.id === section)?.label || 'Dashboard'}</h1>
            <p>Seções para repartir o relatório da sessão Nitro + REDE-5G.</p>
          </div>
          <div className="badge">
            {data.meta.coletadoEm} · {data.wifi.depois.ssid}
          </div>
        </div>
        {body}
        <p className="footnote">
          Throughput = (bytes × 8) / segundos / 1e6. Link PHY do netsh não é a velocidade do provedor.
        </p>
      </main>
    </div>
  );
}
