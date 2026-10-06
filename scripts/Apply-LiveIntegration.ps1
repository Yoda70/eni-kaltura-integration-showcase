param(
    [Parameter(Mandatory = $true)]
    [string]$RepoPath,

    [string]$ApiBaseUrl = "https://metadata-extraction-factory-api-preview.onrender.com"
)

$ErrorActionPreference = "Stop"

$IndexPath = Join-Path $RepoPath "src\index.html"
$BackupPath = "$IndexPath.bak-live"

if (-not (Test-Path -LiteralPath $IndexPath)) {
    throw "File non trovato: $IndexPath"
}

if ($ApiBaseUrl -notmatch '^https://[a-zA-Z0-9.-]+(?:/.*)?$') {
    throw "ApiBaseUrl non valido. Usare un URL HTTPS semplice, senza tag HTML."
}

$ApiBaseUrl = $ApiBaseUrl.TrimEnd('/')
$Html = Get-Content -LiteralPath $IndexPath -Raw -Encoding UTF8

if (-not (Test-Path -LiteralPath $BackupPath)) {
    Copy-Item -LiteralPath $IndexPath -Destination $BackupPath -Force
}

# 1. Aggiunge la voce Real Test alla navigazione.
if (-not $Html.Contains("['realtest','Real Test']")) {
    $OldNav = "['errors','Error catalog'],['guide','Integration guide']"
    $NewNav = "['errors','Error catalog'],['realtest','Real Test'],['guide','Integration guide']"

    if (-not $Html.Contains($OldNav)) {
        throw "Punto di inserimento della voce Real Test non trovato."
    }

    $Html = $Html.Replace($OldNav, $NewNav)
}

# 2. Aggiunge gli stili del Catalogo e della pagina Real Test.
$StyleMarker = "/* LIVE-INTEGRATION-STYLES */"
if (-not $Html.Contains($StyleMarker)) {
    $AdditionalCss = @'
/* LIVE-INTEGRATION-STYLES */
.catalog-count{font-weight:600;color:var(--navy)}
.language-list{display:flex;flex-wrap:wrap;gap:5px;min-width:120px}
.language-badge{display:inline-flex;align-items:center;padding:3px 7px;border-radius:999px;background:#e9f2fb;color:#075b9b;font-size:11px;font-weight:600}
.catalog-actions{display:flex;gap:6px;align-items:center}
.action-cell{position:sticky;right:0;background:#fff;box-shadow:-8px 0 12px -12px #000;z-index:2}
.action-head{position:sticky;right:0;background:#eaf1f7;z-index:4}
tr:hover td.action-cell{background:#f7fbff}
.entry-cell{font-family:Consolas,monospace;font-size:12px;color:#315777}
.real-status{display:inline-flex;gap:7px;align-items:center}
.live-dot{width:8px;height:8px;border-radius:50%;background:#16a34a}
.real-controls{display:flex;gap:8px;flex-wrap:wrap}
.real-empty{padding:30px;text-align:center;color:var(--muted)}
.real-api-url{word-break:break-all}
@media(max-width:600px){.catalog-summary{align-items:flex-start;flex-direction:column}.catalog-actions{flex-direction:column;align-items:stretch}}
'@

    $Html = $Html.Replace('</style>', "$AdditionalCss</style>")
}

# 3. Aggiunge conteggio e reset filtri sopra il Catalogo.
if (-not $Html.Contains('id="catalogCount"')) {
    $OldCatalogStart = '<section id="catalog"><h2>Catalogo entry</h2><div class="toolbar">'
    $NewCatalogStart = '<section id="catalog"><h2>Catalogo entry</h2><div class="catalog-summary"><span id="catalogCount" class="catalog-count"></span><button class="secondary" id="resetCatalog">Reset filtri</button></div><div class="toolbar">'

    if (-not $Html.Contains($OldCatalogStart)) {
        throw "Intestazione della sezione Catalogo non trovata."
    }

    $Html = $Html.Replace($OldCatalogStart, $NewCatalogStart)
}

# 4. Rende esplicita la colonna Azioni.
$Html = $Html.Replace(
    '<th>Versioni multiple</th><th>Eleggibile</th><th></th>',
    '<th>Versioni</th><th>Eleggibile</th><th class="action-head">Azioni</th>'
)

# 5. Inserisce la sezione Real Test prima della guida.
$RealSectionMarker = '<section id="realtest">'
if (-not $Html.Contains($RealSectionMarker)) {
    $RealSection = @'
<section id="realtest"><h2>Real Test KMC</h2><div class="notice"><b>Ambiente reale controllato.</b> Le operazioni sono in sola lettura e limitate alla categoria <code>TEST_METADATA_EXTRACTION</code>.</div><div class="card"><div class="real-controls"><button class="primary" id="loadRealScope">Carica categoria e entry</button><button class="secondary" id="clearRealScope">Svuota risultati</button></div><p id="realScopeStatus" class="muted">Backend non ancora interrogato.</p><p class="muted real-api-url">API: <span id="realApiUrl"></span></p></div><div id="realScopeKpis" class="grid" style="margin-top:14px"></div><div class="tablewrap" style="margin-top:14px"><table><thead><tr><th>Entry ID</th><th>Titolo</th><th>Tipo</th><th>Stato</th><th>Lingue SRT</th><th>Asset</th><th>Eleggibile</th><th class="action-head">Azioni</th></tr></thead><tbody id="realRows"><tr><td colspan="8" class="real-empty">Caricare la categoria di test per visualizzare le entry reali.</td></tr></tbody></table></div><h3>Risposta API</h3><div class="codeactions"><button class="secondary" onclick="copyText('realResponse')">Copia JSON</button></div><pre id="realResponse">{}</pre></section>
'@

    $GuideMarker = '<section id="guide">'
    if (-not $Html.Contains($GuideMarker)) {
        throw "Sezione Integration guide non trovata."
    }

    $Html = $Html.Replace($GuideMarker, "$RealSection$GuideMarker")
}

# 6. Inserisce JavaScript aggiuntivo. La nuova filterCatalog ridefinisce quella demo.
$ScriptMarker = '/* LIVE-INTEGRATION-SCRIPT */'
if (-not $Html.Contains($ScriptMarker)) {
    $LiveJs = @'
/* LIVE-INTEGRATION-SCRIPT */
const LIVE_API = "__API_BASE_URL__";
let REAL_ENTRIES = [];

async function liveFetch(path, options = {}) {
  const response = await fetch(LIVE_API + path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Il backend non ha restituito JSON valido.");
  }

  if (!response.ok) {
    throw new Error(data?.errors?.[0]?.message || `Errore API HTTP ${response.status}`);
  }

  return data;
}

function filterCatalog() {
  const q = $("q").value.toLowerCase();
  const channel = $("channelFilter").value;
  const language = $("langFilter").value;
  const eligible = $("eligFilter").value;
  const versions = $("versionFilter").value;

  const rows = DATA.entries.filter(entry =>
    (!q || `${entry.entryId} ${entry.title}`.toLowerCase().includes(q)) &&
    (!channel || entry.channel === channel) &&
    (!language || langs(entry).includes(language)) &&
    (!eligible || String(entry.eligible) === eligible) &&
    (!versions || multi(entry))
  );

  $("catalogCount").textContent = `${rows.length} risultati`;

  $("catalogRows").innerHTML = rows.map(entry => {
    const readyCount = entry.srtAssets.filter(asset => asset.status === "READY").length;
    const languageBadges = langs(entry)
      .map(languageCode => `<span class="language-badge">${esc(languageCode)}</span>`)
      .join("") || "-";

    return `<tr>
      <td class="entry-cell">${esc(entry.entryId)}</td>
      <td class="wrap">${esc(entry.title)}</td>
      <td>${esc(entry.mediaType)}</td>
      <td>${esc(entry.channel)}</td>
      <td><div class="srt-summary"><strong>${entry.srtAssets.length} asset</strong><span class="muted">${readyCount} READY</span></div></td>
      <td><div class="language-list">${languageBadges}</div></td>
      <td>${multi(entry) ? '<span class="badge">Multiple</span>' : "Singola"}</td>
      <td><span class="badge ${entry.eligible ? "ready" : "no"}">${entry.eligible ? "Sì" : "No"}</span></td>
      <td class="action-cell"><div class="catalog-actions"><button class="secondary" onclick="openEntry('${entry.entryId}')">Dettaglio</button><button class="secondary" onclick="openDemoVerify('${entry.entryId}')">Verify</button></div></td>
    </tr>`;
  }).join("");
}

function openDemoVerify(entryId) {
  showPage("verify");
  $("verifyMode").value = "single";
  $("verifyInput").value = entryId;
  runVerify();
}

async function loadRealScope() {
  const status = $("realScopeStatus");
  status.textContent = "Caricamento categoria e entry reali...";

  try {
    const scopeResponse = await liveFetch("/api/v1/test-scope");
    const entriesResponse = await liveFetch("/api/v1/test-scope/entries");

    REAL_ENTRIES = entriesResponse.data?.entries || [];
    $("realResponse").textContent = JSON.stringify(entriesResponse, null, 2);
    status.innerHTML = `<span class="real-status"><span class="live-dot"></span>LIVE · ${esc(scopeResponse.data.category.name)} · ${REAL_ENTRIES.length} entry · sola lettura</span>`;
    renderRealRows();
  } catch (error) {
    status.textContent = `Errore: ${error.message}`;
    $("realResponse").textContent = JSON.stringify({
      status: "LIVE_API_ERROR",
      message: error.message,
      apiBaseUrl: LIVE_API
    }, null, 2);
  }
}

function renderRealRows() {
  const assetCount = REAL_ENTRIES.reduce((total, entry) => total + (entry.transcripts || []).length, 0);
  const languageCount = new Set(REAL_ENTRIES.flatMap(entry => entry.availableLanguages || [])).size;
  const eligibleCount = REAL_ENTRIES.filter(entry => entry.eligibleForChatbot).length;

  $("realScopeKpis").innerHTML = [
    ["Entry reali", REAL_ENTRIES.length],
    ["Asset caption", assetCount],
    ["Lingue READY", languageCount],
    ["Eleggibili", eligibleCount]
  ].map(item => `<div class="card kpi"><b>${item[1]}</b><span class="muted">${item[0]}</span></div>`).join("");

  $("realRows").innerHTML = REAL_ENTRIES.map(entry => {
    const languages = (entry.availableLanguages || [])
      .map(languageCode => `<span class="language-badge">${esc(languageCode)}</span>`)
      .join("") || "-";

    return `<tr>
      <td class="entry-cell">${esc(entry.entryId)}</td>
      <td class="wrap">${esc(entry.title || "")}</td>
      <td>${esc(entry.mediaType || "-")}</td>
      <td><span class="badge ${entry.status === "READY_FOR_INDEXING" ? "ready" : "wait"}">${esc(entry.status)}</span></td>
      <td><div class="language-list">${languages}</div></td>
      <td>${(entry.transcripts || []).length}</td>
      <td>${entry.eligibleForChatbot ? "Sì" : "No"}</td>
      <td class="action-cell"><button class="secondary" onclick="liveVerify('${entry.entryId}')">Verify live</button></td>
    </tr>`;
  }).join("") || '<tr><td colspan="8" class="real-empty">Nessuna entry nella categoria.</td></tr>';
}

async function liveVerify(entryId) {
  try {
    const response = await liveFetch("/api/v1/transcripts/verify", {
      method: "POST",
      body: JSON.stringify({ entryId })
    });
    $("realResponse").textContent = JSON.stringify(response, null, 2);
  } catch (error) {
    $("realResponse").textContent = JSON.stringify({
      status: "VERIFY_ERROR",
      entryId,
      message: error.message
    }, null, 2);
  }
}

function clearRealScope() {
  REAL_ENTRIES = [];
  $("realRows").innerHTML = '<tr><td colspan="8" class="real-empty">Risultati rimossi.</td></tr>';
  $("realScopeKpis").innerHTML = "";
  $("realResponse").textContent = "{}";
  $("realScopeStatus").textContent = "Backend non ancora interrogato.";
}

function resetCatalogFilters() {
  $("q").value = "";
  $("channelFilter").value = "";
  $("langFilter").value = "";
  $("eligFilter").value = "";
  $("versionFilter").value = "";
  filterCatalog();
}

$("realApiUrl").textContent = LIVE_API;
$("loadRealScope").onclick = loadRealScope;
$("clearRealScope").onclick = clearRealScope;
$("resetCatalog").onclick = resetCatalogFilters;
'@

    $LiveJs = $LiveJs.Replace('__API_BASE_URL__', $ApiBaseUrl)
    $InitMarker = 'nav();renderOverview();'

    if (-not $Html.Contains($InitMarker)) {
        throw "Punto di inizializzazione JavaScript non trovato."
    }

    $Html = $Html.Replace($InitMarker, "$LiveJs$InitMarker")
}

Set-Content -LiteralPath $IndexPath -Value $Html -Encoding UTF8 -NoNewline

Write-Host "SPA aggiornata correttamente." -ForegroundColor Green
Write-Host "Backup: $BackupPath" -ForegroundColor Cyan
Write-Host "API: $ApiBaseUrl" -ForegroundColor Cyan
