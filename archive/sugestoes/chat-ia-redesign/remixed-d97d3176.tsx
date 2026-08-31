import { useState, useRef } from "react";

const LANGS = ["JavaScript","Python","TypeScript","Java","C++","C#","C","Go","Rust","Swift","Kotlin","PHP","Ruby","Dart","R","Scala","Haskell","Lua","Elixir","Perl","Bash","SQL"];

function esc(s) {
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

async function callClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompt }] })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return (data.content || []).filter(function(b){ return b.type === "text"; }).map(function(b){ return b.text; }).join("\n");
}

export default function App() {
  const [tab, setTab] = useState("input");
  const [code, setCode] = useState("");
  const [report, setReport] = useState(null);
  const [converted, setConverted] = useState("");
  const [convLang, setConvLang] = useState("");
  const [targetLang, setTargetLang] = useState("JavaScript");
  const [detectedLang, setDetectedLang] = useState(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingC, setLoadingC] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  function switchTab(t) { setTab(t); setError(""); }

  async function analyze() {
    if (!code.trim()) { setError("Cole seu código primeiro."); return; }
    setLoadingA(true); setError("");
    try {
      const prompt = 'Analise o código abaixo e retorne APENAS JSON válido sem markdown:\n{"language":"lang","score":0,"summary":"resumo","errors":[{"line":null,"title":"t","description":"d","fix":"f"}],"suggestions":["s"],"complexity":{"linhas":0,"funcoes":0,"complexidade":"Baixa"}}\nCódigo:\n' + code;
      const raw = await callClaude(prompt);
      const clean = raw.replace(/```json/g,"").replace(/```/g,"").trim();
      const r = JSON.parse(clean);
      setDetectedLang(r.language || "?");
      setReport(r);
      switchTab("report");
    } catch(e) { setError("Erro: " + e.message); }
    setLoadingA(false);
  }

  async function convert() {
    if (!code.trim()) { setError("Cole seu código primeiro."); return; }
    setLoadingC(true); setError("");
    try {
      const src = detectedLang || "código";
      const prompt = "Converta de " + src + " para " + targetLang + ". Retorne APENAS o código convertido, sem markdown nem explicações.\nCódigo:\n" + code;
      const raw = await callClaude(prompt);
      const result = raw.replace(/```[\w]*/g,"").replace(/```/g,"").trim();
      setConverted(result);
      setConvLang(targetLang);
      switchTab("convert");
    } catch(e) { setError("Erro: " + e.message); }
    setLoadingC(false);
  }

  function clearAll() {
    setCode(""); setReport(null); setConverted(""); setDetectedLang(null); setError(""); switchTab("input");
  }

  function copyCode() {
    navigator.clipboard.writeText(converted).then(function() {
      setCopied(true);
      setTimeout(function(){ setCopied(false); }, 1500);
    });
  }

  const scoreColor = report ? (report.score >= 80 ? "#22c55e" : report.score >= 50 ? "#f59e0b" : "#ef4444") : "#22c55e";
  const circ = 175.9;
  const offset = report ? circ - (report.score / 100) * circ : circ;

  return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",maxWidth:"480px",margin:"0 auto",background:"#0d1117",color:"#f0f6fc",fontFamily:"monospace"}}>

      <div style={{background:"#161b22",borderBottom:"1px solid #21262d",padding:"12px 16px",display:"flex",alignItems:"center",gap:"12px",flexShrink:0}}>
        <div style={{width:"36px",height:"36px",background:"#16a34a",borderRadius:"10px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"18px"}}>💻</div>
        <div style={{flex:1}}>
          <div style={{fontSize:"15px",fontWeight:700}}>CodeTerminal</div>
          <div style={{fontSize:"11px",color:"#6e7681"}}>
            {detectedLang ? detectedLang + (report ? " · Score " + report.score + "/100" : "") : "Pronto · 24 linguagens"}
          </div>
        </div>
        {detectedLang && (
          <span style={{fontSize:"11px",fontWeight:600,padding:"3px 8px",borderRadius:"50px",border:"1px solid #388bfd",background:"#0d1a3a",color:"#388bfd"}}>{detectedLang}</span>
        )}
      </div>

      <div style={{display:"flex",background:"#161b22",borderBottom:"1px solid #21262d",flexShrink:0}}>
        {[["input","📄 Código"],["report","📊 Relatório"],["convert","🔄 Converter"]].map(function(pair){
          return (
            <button key={pair[0]} onClick={function(){ switchTab(pair[0]); }}
              style={{flex:1,padding:"10px 4px",fontSize:"11px",fontWeight:600,border:"none",cursor:"pointer",background:"transparent",color:tab===pair[0]?"#22c55e":"#6e7681",borderBottom:tab===pair[0]?"2px solid #22c55e":"2px solid transparent"}}>
              {pair[1]}
            </button>
          );
        })}
      </div>

      <div style={{flex:1,overflow:"hidden",position:"relative"}}>

        <div style={{height:"100%",display:tab==="input"?"flex":"none",flexDirection:"column"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 16px",background:"#0d1117",borderBottom:"1px solid #21262d",flexShrink:0}}>
            <span style={{fontSize:"11px",color:"#6e7681"}}>// cole ou escreva seu código</span>
            <button onClick={clearAll} style={{fontSize:"11px",color:"#6e7681",background:"none",border:"none",cursor:"pointer",padding:"4px 8px"}}>✕ Limpar</button>
          </div>
          <textarea value={code} onChange={function(e){ setCode(e.target.value); }} spellCheck={false}
            placeholder={"# Cole seu código aqui...\n\ndef fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)"}
            style={{flex:1,background:"#0d1117",color:"#22c55e",border:"none",outline:"none",resize:"none",width:"100%",fontFamily:"monospace",fontSize:"13px",lineHeight:1.6,padding:"16px"}} />
        </div>

        <div style={{height:"100%",display:tab==="report"?"block":"none",overflowY:"auto",padding:"16px"}}>
          {!report ? (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"50vh",gap:"12px",textAlign:"center",color:"#6e7681"}}>
              <div style={{fontSize:"48px"}}>📊</div>
              <p style={{fontSize:"14px",color:"#8b949e"}}>Nenhum relatório ainda.</p>
              <small style={{fontSize:"12px"}}>Insira código e toque em Analisar.</small>
            </div>
          ) : (
            <div>
              <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:"12px",padding:"14px",marginBottom:"10px",display:"flex",alignItems:"center",gap:"16px"}}>
                <svg width="72" height="72" style={{flexShrink:0,transform:"rotate(-90deg)"}}>
                  <circle cx="36" cy="36" r="28" fill="none" stroke="#1f2937" strokeWidth="6"/>
                  <circle cx="36" cy="36" r="28" fill="none" stroke={scoreColor} strokeWidth="6" strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"/>
                </svg>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"8px"}}>
                    <span style={{fontSize:"11px",fontWeight:600,padding:"3px 8px",borderRadius:"50px",border:"1px solid #388bfd",background:"#0d1a3a",color:"#388bfd"}}>{report.language}</span>
                    <span style={{fontSize:"11px",fontWeight:600,padding:"3px 8px",borderRadius:"50px",border:"1px solid "+scoreColor,background:"#111",color:scoreColor}}>{report.score}/100</span>
                  </div>
                  <p style={{fontSize:"13px",color:"#c9d1d9",lineHeight:1.5}}>{report.summary}</p>
                </div>
              </div>

              {report.errors && report.errors.length > 0 ? (
                <div style={{marginBottom:"10px"}}>
                  <p style={{fontSize:"11px",color:"#8b949e",fontWeight:700,textTransform:"uppercase",marginBottom:"8px"}}>Erros ({report.errors.length})</p>
                  {report.errors.map(function(e,i){
                    return (
                      <div key={i} style={{background:"#2d1b1b",border:"1px solid #6e2020",borderRadius:"12px",padding:"12px",marginBottom:"8px"}}>
                        <div style={{display:"flex",gap:"8px"}}>
                          <span style={{color:"#f87171",fontSize:"11px",fontWeight:700,flexShrink:0}}>{e.line ? "L"+e.line : "!"}</span>
                          <div>
                            <p style={{color:"#fca5a5",fontSize:"13px",fontWeight:600,marginBottom:"2px"}}>{e.title}</p>
                            <p style={{color:"#f87171",fontSize:"12px",marginBottom:"4px"}}>{e.description}</p>
                            {e.fix && <p style={{color:"#4ade80",fontSize:"12px"}}>💡 {e.fix}</p>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{background:"#0d2d0d",border:"1px solid #16a34a",borderRadius:"12px",padding:"12px",textAlign:"center",marginBottom:"10px"}}>
                  <p style={{color:"#4ade80",fontSize:"13px"}}>✅ Nenhum erro detectado!</p>
                </div>
              )}

              {report.suggestions && report.suggestions.length > 0 && (
                <div style={{marginBottom:"10px"}}>
                  <p style={{fontSize:"11px",color:"#8b949e",fontWeight:700,textTransform:"uppercase",marginBottom:"8px"}}>💡 Sugestões</p>
                  {report.suggestions.map(function(s,i){
                    return <div key={i} style={{background:"#1c1407",border:"1px solid #44280a",borderRadius:"10px",padding:"10px 12px",marginBottom:"6px",fontSize:"12px",color:"#fbbf24"}}>• {s}</div>;
                  })}
                </div>
              )}

              {report.complexity && (
                <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:"12px",padding:"14px"}}>
                  <p style={{fontSize:"11px",color:"#8b949e",fontWeight:700,textTransform:"uppercase",marginBottom:"10px"}}>📐 Métricas</p>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px",textAlign:"center"}}>
                    {Object.keys(report.complexity).map(function(k){
                      return (
                        <div key={k} style={{background:"#0d1117",borderRadius:"8px",padding:"8px"}}>
                          <p style={{fontSize:"18px",fontWeight:700,color:"#60a5fa"}}>{String(report.complexity[k])}</p>
                          <p style={{fontSize:"10px",color:"#6e7681"}}>{k}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{height:"100%",display:tab==="convert"?"flex":"none",flexDirection:"column"}}>
          <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"10px 16px",background:"#161b22",borderBottom:"1px solid #21262d",flexShrink:0}}>
            <span style={{fontSize:"11px",fontWeight:600,padding:"3px 8px",borderRadius:"50px",border:"1px solid #30363d",background:"#21262d",color:"#8b949e",whiteSpace:"nowrap"}}>{detectedLang || "Auto"}</span>
            <span style={{color:"#6e7681"}}>→</span>
            <select value={targetLang} onChange={function(e){ setTargetLang(e.target.value); }}
              style={{flex:1,background:"#21262d",border:"1px solid #30363d",color:"#f0f6fc",fontSize:"13px",padding:"6px 10px",borderRadius:"8px",outline:"none",fontFamily:"monospace"}}>
              {LANGS.map(function(l){ return <option key={l}>{l}</option>; })}
            </select>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"16px"}}>
            {!converted ? (
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"50vh",gap:"12px",textAlign:"center",color:"#6e7681"}}>
                <div style={{fontSize:"48px"}}>🔄</div>
                <p style={{fontSize:"14px",color:"#8b949e"}}>Nenhuma conversão ainda.</p>
                <small style={{fontSize:"12px"}}>Escolha o idioma e toque em Converter.</small>
              </div>
            ) : (
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
                  <span style={{fontSize:"11px",fontWeight:600,padding:"3px 8px",borderRadius:"50px",border:"1px solid #16a34a",background:"#0d2d0d",color:"#4ade80"}}>✓ {convLang}</span>
                  <button onClick={copyCode} style={{background:"#21262d",border:"1px solid #30363d",color:copied?"#4ade80":"#8b949e",fontSize:"12px",padding:"5px 12px",borderRadius:"8px",cursor:"pointer",fontFamily:"monospace"}}>
                    {copied ? "✓ Copiado!" : "📋 Copiar"}
                  </button>
                </div>
                <pre style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:"12px",padding:"14px",fontSize:"12px",color:"#22c55e",lineHeight:1.6,overflowX:"auto",whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
                  {converted}
                </pre>
              </div>
            )}
          </div>
        </div>

      </div>

      {error && (
        <div style={{margin:"0 12px 6px",background:"#2d1b1b",border:"1px solid #6e2020",color:"#fca5a5",padding:"10px 14px",borderRadius:"12px",fontSize:"12px"}}>
          ⚠ {error}
        </div>
      )}

      <div style={{background:"#161b22",borderTop:"1px solid #21262d",padding:"12px",flexShrink:0}}>
        {tab !== "convert" ? (
          <div style={{display:"flex",gap:"8px"}}>
            <button onClick={analyze} disabled={loadingA||loadingC}
              style={{flex:1,border:"none",cursor:"pointer",fontFamily:"monospace",fontWeight:700,fontSize:"14px",borderRadius:"14px",padding:"14px",background:"#16a34a",color:"#fff",opacity:(loadingA||loadingC)?0.5:1}}>
              {loadingA ? "Analisando..." : "▶ Analisar"}
            </button>
            <button onClick={function(){ switchTab("convert"); }} disabled={loadingA||loadingC}
              style={{flex:1,border:"none",cursor:"pointer",fontFamily:"monospace",fontWeight:700,fontSize:"14px",borderRadius:"14px",padding:"14px",background:"#1d4ed8",color:"#fff",opacity:(loadingA||loadingC)?0.5:1}}>
              🔄 Converter
            </button>
          </div>
        ) : (
          <div style={{display:"flex",gap:"8px"}}>
            <button onClick={function(){ switchTab("input"); }}
              style={{flex:1,border:"1px solid #30363d",cursor:"pointer",fontFamily:"monospace",fontWeight:700,fontSize:"14px",borderRadius:"14px",padding:"14px",background:"#21262d",color:"#f0f6fc"}}>
              ← Código
            </button>
            <button onClick={convert} disabled={loadingA||loadingC}
              style={{flex:1,border:"none",cursor:"pointer",fontFamily:"monospace",fontWeight:700,fontSize:"14px",borderRadius:"14px",padding:"14px",background:"#1d4ed8",color:"#fff",opacity:(loadingA||loadingC)?0.5:1}}>
              {loadingC ? "Convertendo..." : "🔄 Converter"}
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
