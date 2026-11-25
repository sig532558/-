# =====================================================================
#  혜성물류 운영 ERP 설치 프로그램
#  Windows PowerShell 5.1 이상 (Windows 10/11 기본 포함)
#  - 시연 모드 실행
#  - 운영 설치: Supabase(안성센터와 같은 프로젝트)에 ERP 테이블·권한 설치, 연결 정보 자동 입력
#  - Cloudflare Pages 배포 (Node.js 있으면 자동, 없으면 업로드용 압축파일 생성)
#  - 설치 점검
#  토큰(비밀키)은 파일에 저장하지 않습니다.
# =====================================================================
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }

$Root      = Split-Path -Parent $PSScriptRoot
$SiteDir   = Join-Path $Root 'site'
$SqlDir    = Join-Path $Root 'sql'
$CfgFile   = Join-Path $SiteDir 'js\config.js'
$StateFile = Join-Path $PSScriptRoot 'settings.json'
$LogFile   = Join-Path $PSScriptRoot 'install.log'
$SbApi     = if ($env:HS_SB_API) { $env:HS_SB_API } else { 'https://api.supabase.com' }
$Utf8NoBom = New-Object Text.UTF8Encoding $false

function Log([string]$m) { try { [IO.File]::AppendAllText($LogFile, ('[{0}] {1}{2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m, [Environment]::NewLine), $Utf8NoBom) } catch { } }
function Title([string]$t) { Write-Host ''; Write-Host ('━' * 64) -ForegroundColor DarkYellow; Write-Host ('  ' + $t) -ForegroundColor Yellow; Write-Host ('━' * 64) -ForegroundColor DarkYellow }
function Ok([string]$m)   { Write-Host ('  ✔ ' + $m) -ForegroundColor Green; Log ('OK ' + $m) }
function Info([string]$m) { Write-Host ('  · ' + $m) -ForegroundColor Gray }
function Warn([string]$m) { Write-Host ('  ! ' + $m) -ForegroundColor Yellow; Log ('WARN ' + $m) }
function Fail([string]$m) { Write-Host ('  ✖ ' + $m) -ForegroundColor Red; Log ('FAIL ' + $m) }
function Ask([string]$q, [string]$def) {
  $p = if ($def) { "  ? $q [$def]" } else { "  ? $q" }
  $a = Read-Host $p
  if ([string]::IsNullOrWhiteSpace($a)) { return $def } else { return $a.Trim() }
}
function YesNo([string]$q, [bool]$def) {
  $d = if ($def) { 'Y/n' } else { 'y/N' }
  $a = Read-Host "  ? $q ($d)"
  if ([string]::IsNullOrWhiteSpace($a)) { return $def }
  return ($a.Trim() -match '^(y|yes|예|네|ㅇ)$')
}
function AskSecret([string]$q) {
  if ($env:HS_TEST_SECRET) { return $env:HS_TEST_SECRET }
  $s = Read-Host "  ? $q" -AsSecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}
function Open([string]$target, [string]$argList) { try { if ($argList) { Start-Process $target -ArgumentList $argList } else { Start-Process $target } } catch { Warn ('열기 실패: ' + $target) } }
function Pause1 { [void](Read-Host '  Enter 키를 누르면 메뉴로 돌아갑니다') }
function LoadState { if (Test-Path $StateFile) { try { return (Get-Content $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json) } catch { } } return (New-Object psobject) }
function SaveState($s) { [IO.File]::WriteAllText($StateFile, ($s | ConvertTo-Json), $Utf8NoBom) }
function SetProp($o, [string]$k, $v) { if ($o.PSObject.Properties[$k]) { $o.$k = $v } else { $o | Add-Member -NotePropertyName $k -NotePropertyValue $v } }

# ---------- Supabase Management API ----------
function Sb([string]$method, [string]$path, $body, [string]$token) {
  $h = @{ Authorization = "Bearer $token"; Accept = 'application/json' }
  $req = @{ Method = $method; Uri = ($SbApi + $path); Headers = $h; TimeoutSec = 180 }
  if ($null -ne $body) { $req.Body = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 10 -Compress)); $req.ContentType = 'application/json; charset=utf-8' }
  try { return Invoke-RestMethod @req }
  catch {
    $msg = $_.Exception.Message
    try { $r = $_.ErrorDetails.Message; if ($r) { $msg = $msg + ' / ' + $r } } catch { }
    throw "Supabase API 오류 ($method $path): $msg"
  }
}
function Arr($x) { return ,@($x | ForEach-Object { $_ }) }
function SbQuery([string]$ref, [string]$sql, [string]$token) { return (Arr (Sb 'POST' "/v1/projects/$ref/database/query" @{ query = $sql } $token)) }
function RefFromUrl([string]$u) {
  $u = $u.Trim().TrimEnd('/')
  if ($u -match '^https?://([a-z0-9]{10,40})\.supabase\.(co|in)') { return $Matches[1] }
  if ($u -match 'supabase\.com/dashboard/project/([a-z0-9]{10,40})') { return $Matches[1] }
  if ($u -match '^[a-z0-9]{10,40}$') { return $u }
  return $null
}
# 안성 프로그램 화면 주소에서 Supabase 주소 자동 찾기 (화면 파일을 읽기만 함)
function FindSupabaseFromSite([string]$site) {
  $site = $site.Trim().TrimEnd('/')
  if ($site -notmatch '^https?://') { $site = 'https://' + $site }
  $re = 'https://([a-z0-9]{20})\.supabase\.(co|in)'
  $seen = @{}; $queue = New-Object System.Collections.ArrayList; [void]$queue.Add($site + '/')
  $base = [Uri]($site + '/')
  $n = 0
  while ($queue.Count -gt 0 -and $n -lt 40) {
    $u = $queue[0]; $queue.RemoveAt(0)
    if ($seen.ContainsKey($u)) { continue }; $seen[$u] = 1; $n++
    try { $txt = (Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 20 -Headers @{ 'Cache-Control' = 'no-cache' }).Content } catch { continue }
    if ($txt -is [byte[]]) { $txt = [Text.Encoding]::UTF8.GetString($txt) }
    $m = [regex]::Match($txt, $re)
    if ($m.Success) { return ('https://' + $m.Groups[1].Value + '.supabase.co') }
    # 화면이 불러오는 js 파일 따라가기
    foreach ($mm in [regex]::Matches($txt, '(?:src=|import\(|from|href=)\s*["'']([^"'']+?\.m?js)(?:\?[^"'']*)?["'']')) {
      try { $abs = (New-Object Uri(([Uri]$u), $mm.Groups[1].Value)).AbsoluteUri; if ($abs.StartsWith($base.GetLeftPart('Authority'))) { [void]$queue.Add($abs) } } catch { }
    }
    foreach ($mm in [regex]::Matches($txt, '["''](/?(?:assets|js|static|_next/static)/[^"'']+?\.js)["'']')) {
      try { [void]$queue.Add((New-Object Uri($base, $mm.Groups[1].Value)).AbsoluteUri) } catch { }
    }
  }
  return $null
}

# ---------- 1. 시연 모드 ----------
function Demo {
  Title '시연 모드로 열기 (이 PC의 브라우저에만 저장)'
  $idx = Join-Path $SiteDir 'index.html'
  if (-not (Test-Path $idx)) { Fail "site\index.html 을 찾을 수 없습니다: $idx"; Pause1; return }
  Info '시연 계정: admin / admin1234 · support · leader · staff (비밀번호 1234)'
  Info '운영 연결 정보가 들어 있으면 운영 DB로 접속합니다.'
  $chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LocalAppData\Google\Chrome\Application\chrome.exe") | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if ($chrome) { Open $chrome ('"' + $idx + '"') } else { Open $idx }
  Ok '브라우저에서 ERP를 열었습니다.'
  Pause1
}

# ---------- 2. 운영 설치 (Supabase) ----------
function InstallSupabase {
  Title '운영 설치 ① Supabase에 ERP 설치'
  Info 'Supabase 프로젝트에 ERP 테이블(erp_ 로 시작)을 만듭니다. 다른 테이블 · 자료는 바꾸지 않습니다.'
  Info '같은 설치를 여러 번 실행해도 안전합니다.'
  $st = LoadState
  $defUrl = if ($st.PSObject.Properties['url']) { $st.url } else { '' }
  $url = $defUrl
  if (-not $url) {
    Info 'Supabase에서 새로 만든 프로젝트의 주소를 넣으세요. (Project Settings > Data API > Project URL)'
    Info '형식: https://영문소문자20자.supabase.co · 안성센터와 같은 곳에 설치하려면 안성 프로그램 주소를 넣어도 됩니다'
    $site = Ask 'Supabase Project URL' ''
    if (-not $site) { Fail '주소가 없습니다.'; Pause1; return }
    if (RefFromUrl $site) { $url = $site }
    else {
      Info '입력한 주소의 화면 파일에서 DB 주소를 찾는 중...'
      $url = FindSupabaseFromSite $site
      if ($url) { Ok ('DB 주소를 찾았습니다: ' + $url) }
      else { Fail 'DB 주소를 찾지 못했습니다. supabase.com → 프로젝트 → Project Settings → Data API → Project URL 을 넣으세요.'; Pause1; return }
    }
  } else {
    $url = Ask 'Supabase Project URL (그냥 Enter = 지난번 값)' $defUrl
  }
  $ref = RefFromUrl $url
  if (-not $ref) {
    if ($url -match 'pages\.') { Fail '입력한 주소는 안성 프로그램 화면 주소입니다. DB 주소(https://영문20자.supabase.co)가 필요합니다.' }
    else { Fail '주소 형식이 맞지 않습니다. 형식: https://영문소문자20자.supabase.co' }
    Pause1; return
  }
  Write-Host ''
  Info 'Supabase 개인 액세스 토큰이 필요합니다 (설치에만 쓰고 저장하지 않음).'
  Info '발급: https://supabase.com/dashboard/account/tokens → Generate new token'
  if (YesNo '토큰 발급 페이지를 브라우저로 열까요?' $false) { Open 'https://supabase.com/dashboard/account/tokens' }
  $tok = AskSecret '액세스 토큰 (sbp_ 로 시작, 입력해도 화면에 안 보임)'
  if (-not $tok) { Fail '토큰이 없습니다.'; Pause1; return }

  try {
    $proj = Sb 'GET' "/v1/projects/$ref" $null $tok
    Ok ("프로젝트 확인: " + $proj.name + " (" + $ref + ", " + $proj.region + ")")
  } catch { Fail $_.Exception.Message; Fail '토큰 권한 또는 주소를 확인하세요.'; Pause1; return }

  # 기존 안성 테이블 / ERP 설치 여부
  try {
    $t = SbQuery $ref "select count(*) filter (where table_name not like 'erp\_%') as other, count(*) filter (where table_name like 'erp\_%') as erp from information_schema.tables where table_schema = 'public'" $tok
    $row = $t[0]
    Info ("현재 public 테이블: 기존 " + $row.other + "개 · ERP " + $row.erp + "개")
  } catch { Warn ('테이블 확인 실패: ' + $_.Exception.Message) }

  if (-not (YesNo ("'" + $proj.name + "' 프로젝트에 ERP를 설치할까요?") $true)) { Warn '취소했습니다.'; Pause1; return }

  foreach ($f in @('01_schema.sql', '02_security.sql', '03_extend.sql', '04_views.sql', '05_firewall.sql', '06_count_season.sql', '07_returns.sql', '08_meeting.sql', '09_anseong.sql', '10_storage.sql', '11_notice_pl.sql', '12_speed.sql', '13_csdata.sql', '14_csmerge.sql', '15_cnt_trash.sql', '16_cs_alloc.sql', '17_cs_alloc_close.sql', '18_np_raw.sql', '19_alloc_year.sql', '20_item_map.sql', '21_alloc_nostore.sql', '22_meet_book.sql', '23_cost_open.sql', '24_purge.sql', '25_cost_admin.sql', '26_team_year_cost.sql', '29_ceo.sql', '30_pl_json.sql', '31_audit_trim.sql', '32_add_user.sql', '33_iwol.sql', '34_user_admin.sql', '35_iwol_term.sql', '36_tlmeet.sql')) {
    $p = Join-Path $SqlDir $f
    if (-not (Test-Path $p)) { Fail "SQL 파일이 없습니다: $p"; Pause1; return }
    $sql = [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8)
    Info ("실행 중: " + $f + " (" + [Math]::Round($sql.Length / 1024) + "KB)")
    try { [void](SbQuery $ref $sql $tok); Ok ($f + ' 실행 완료') }
    catch { Fail $_.Exception.Message; Fail '설치를 멈췄습니다. install.log 를 확인하거나 Claude에게 오류 내용을 보내주세요.'; Pause1; return }
  }

  # 인증 설정
  Write-Host ''
  Info '로그인 설정: ERP는 아이디 방식이라 "이메일 확인(Confirm email)"을 꺼야 합니다.'
  Info '이 설정은 이 Supabase 프로젝트 전체에 적용됩니다.'
  if (YesNo '이메일 확인을 끌까요?' $true) {
    $allowSignup = YesNo '직원이 화면에서 직접 "사용 신청"을 할 수 있게 할까요? (아니오: 관리자가 Supabase에서 계정 생성)' $true
    try { [void](Sb 'PATCH' "/v1/projects/$ref/config/auth" @{ mailer_autoconfirm = $true; external_email_enabled = $true; disable_signup = (-not $allowSignup) } $tok); Ok ('로그인 설정 완료 (사용 신청 ' + $(if ($allowSignup) { '허용' } else { '차단' }) + ')') }
    catch { Warn ('로그인 설정 실패: ' + $_.Exception.Message); Warn 'Supabase > Authentication > Providers > Email 에서 Confirm email 을 직접 끄세요.' }
  }

  # 공개 키 → config.js
  $anon = $null
  try {
    $keys = Arr (Sb 'GET' "/v1/projects/$ref/api-keys" $null $tok)
    $k = $keys | Where-Object { $_.name -eq 'anon' } | Select-Object -First 1
    if (-not $k) { $k = $keys | Where-Object { $_.type -eq 'publishable' } | Select-Object -First 1 }
    if ($k) { $anon = $k.api_key }
  } catch { Warn ('공개 키 조회 실패: ' + $_.Exception.Message) }
  if (-not $anon) { $anon = Ask 'anon public 키를 직접 붙여넣으세요 (Project Settings > API)' '' }
  if (-not $anon) { Fail '공개 키가 없어 연결 정보를 쓰지 못했습니다.'; Pause1; return }
  if ($anon -match 'service_role' -or $anon -like 'sb_secret_*') { Fail 'service_role / secret 키는 넣으면 안 됩니다.'; Pause1; return }
  $projUrl = "https://$ref.supabase.co"
  $cfg = @"
/* 운영 연결 정보 — 설치 프로그램이 자동으로 작성 ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))
 * anon(공개) 키만 사용합니다. service_role 키는 절대 넣지 마세요.
 */
window.HS_CONFIG = {
  supabaseUrl: '$projUrl',
  supabaseKey: '$anon',
  // 방화벽 ② 로그인 자동 공격 차단 (Cloudflare Turnstile 사이트 키 · 비우면 사용 안 함)
  turnstileSiteKey: '',
};
"@
  [IO.File]::WriteAllText($CfgFile, $cfg, $Utf8NoBom)
  Ok ('연결 정보 저장: site\js\config.js')

  # 점검
  try {
    $c = (SbQuery $ref "select (select count(*) from erp_roles) as roles, (select count(*) from erp_teams) as teams, (select count(*) from erp_brands) as brands, (select count(*) from information_schema.tables where table_schema='public' and table_name like 'erp\_%') as tables" $tok)[0]
    Ok ("설치 확인: ERP 테이블 " + $c.tables + "개 · 등급 " + $c.roles + " · 팀 " + $c.teams + " · 브랜드 " + $c.brands)
  } catch { Warn ('설치 확인 실패: ' + $_.Exception.Message) }

  SetProp $st 'url' $projUrl; SetProp $st 'ref' $ref; SetProp $st 'project' $proj.name; SetProp $st 'installedAt' (Get-Date -Format 'yyyy-MM-dd HH:mm')
  SaveState $st
  Write-Host ''
  Ok 'Supabase 설치가 끝났습니다. 다음은 메뉴 3 (인터넷 배포) 입니다.'
  Pause1
}

# ---------- 3. Cloudflare Pages 배포 ----------
function RunNative([scriptblock]$sb) {
  # 외부 프로그램(npm · winget)이 경고를 stderr로 내보내면 Windows PowerShell 5.1은 오류로 멈춤 → 경고는 글자로만 받기
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & $sb 2>&1 | ForEach-Object { if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.Exception.Message } else { [string]$_ } } }
  finally { $ErrorActionPreference = $old }
}
function EnsureNode {
  $n = Get-Command node -ErrorAction SilentlyContinue
  if ($n) {
    $ver = (& node -v); Ok ('Node.js 확인: ' + $ver)
    if ([int](($ver -replace '^v', '') -split '\.')[0] -lt 22) { Fail 'Node.js 22 이상이 필요합니다. 열리는 화면에서 LTS 버전을 내려받아 설치한 뒤 다시 실행하세요.'; Open 'https://nodejs.org/'; return $false }
    return $true
  }
  Warn 'Node.js(자동 업로드 도구)가 없습니다. 자동으로 설치합니다 (1~3분).'
  $wg = Get-Command winget -ErrorAction SilentlyContinue
  if ($wg) {
    try {
      RunNative { winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements } | ForEach-Object { Log ('winget ' + $_) }
    } catch { Log ('winget 실패 ' + $_.Exception.Message) }
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
    foreach ($d in @("$env:ProgramFiles\nodejs", "${env:ProgramFiles(x86)}\nodejs")) { if ($d -and (Test-Path $d) -and ($env:Path -notlike "*$d*")) { $env:Path = $d + ';' + $env:Path } }
    $n = Get-Command node -ErrorAction SilentlyContinue
    if ($n) { Ok ('Node.js 설치 완료: ' + (& node -v)); return $true }
  }
  Fail '자동 설치가 안 됐습니다. 열리는 화면에서 초록색 LTS 버튼으로 내려받아 설치(계속 Next)한 뒤, 이 창을 닫고 설치하기.bat 을 다시 실행하세요.'
  Open 'https://nodejs.org/'
  return $false
}
function CfApi([string]$path, [string]$tok) {
  $base = if ($env:HS_CF_API) { $env:HS_CF_API } else { 'https://api.cloudflare.com/client/v4' }
  return Invoke-RestMethod -Method GET -Uri ($base + $path) -Headers @{ Authorization = 'Bearer ' + $tok } -TimeoutSec 30
}
function GetSavedToken($st, [string]$key = 'cfToken') {
  if (-not $st.PSObject.Properties[$key]) { return $null }
  try { $ss = ConvertTo-SecureString $st.$key -ErrorAction Stop; $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss); try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) } } catch { return $null }
}
function Deploy([switch]$Auto) {
  Title '운영 설치 ② 인터넷에 올리기 (Cloudflare Pages · 자동)'
  $cfgText = if (Test-Path $CfgFile) { [IO.File]::ReadAllText($CfgFile, [Text.Encoding]::UTF8) } else { '' }
  if ($cfgText -notmatch "supabaseUrl:\s*'https://") { Warn '아직 연결 정보가 없습니다. 이대로 올리면 시연(로컬) 모드로 열립니다. 먼저 메뉴 2를 실행하세요.'; if ($Auto) { return $false }; if (-not (YesNo '그래도 계속할까요?' $false)) { return } }
  $st = LoadState
  Info '설치 프로그램이 Cloudflare에 직접 올립니다. (Cloudflare 화면의 끌어다 놓기는 쓰지 않음)'
  if (-not $Auto) { if (-not (YesNo '자동으로 올릴까요? (아니오 = 끌어다 놓기용 압축파일만 만들기)' $true)) { ManualUpload; Pause1; return } }
  if (-not (EnsureNode)) { if ($Auto) { return $false }; Pause1; return }

  # 토큰: 저장된 것(이 PC · 이 Windows 사용자만 풀 수 있게 암호화)이 있으면 사용
  $cft = GetSavedToken $st
  $verified = $false
  if ($cft) {
    try { $v = CfApi '/user/tokens/verify' $cft; if ($v.success) { $verified = $true; Ok '저장된 Cloudflare 열쇠(토큰)를 사용합니다.' } } catch { Warn '저장된 토큰이 만료됐거나 지워졌습니다. 새로 만듭니다.' }
  }
  if (-not $verified) {
    Info 'Cloudflare 업로드 열쇠(API 토큰)가 필요합니다. 권한이 미리 채워진 화면이 열립니다.'
    Info '열린 화면 맨 아래 [Continue to summary] → [Create Token] → 나온 글자 [Copy]'
    $tplUrl = 'https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22page%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%5D&accountId=%2A&zoneId=all&name=HyeSeong%20ERP%20deploy'
    if (YesNo '토큰 만들기 화면을 열까요?' $true) { Open $tplUrl }
    Info '권한 칸이 비어 있으면: [Edit Cloudflare Workers] 템플릿의 [Use template] 을 써도 됩니다.'
    $cft = AskSecret 'Cloudflare API 토큰 붙여넣기 (마우스 오른쪽 클릭 · 화면에 안 보임)'
    if (-not $cft) { Fail '토큰이 없습니다.'; if ($Auto) { return $false }; Pause1; return }
    try { $v = CfApi '/user/tokens/verify' $cft; if (-not $v.success) { throw '확인 실패' }; Ok '토큰 확인' }
    catch { Fail ('토큰이 맞지 않습니다: ' + $_.Exception.Message); Fail '토큰 글자 전체를 복사했는지 확인하세요.'; if ($Auto) { return $false }; Pause1; return }
  }

  # 계정 ID 자동 찾기
  $acc = if ($st.PSObject.Properties['cfAccount']) { $st.cfAccount } else { '' }
  try {
    $r = CfApi '/accounts?per_page=50' $cft; $list = Arr $r.result
    if ($list.Count -eq 1) { $acc = $list[0].id; Ok ('Cloudflare 계정: ' + $list[0].name) }
    elseif ($list.Count -gt 1) {
      for ($i = 0; $i -lt $list.Count; $i++) { Info (($i + 1).ToString() + '. ' + $list[$i].name) }
      $k = Ask '사용할 계정 번호' '1'; $acc = $list[[int]$k - 1].id
    }
  } catch { Warn ('계정 자동 찾기 실패: ' + $_.Exception.Message) }
  if (-not $acc) { Info '계정 ID: Cloudflare 화면 주소창 dash.cloudflare.com/ 바로 뒤의 영어·숫자 32자리'; $acc = Ask 'Cloudflare 계정 ID' '' }
  if (-not $acc) { Fail '계정 ID가 없습니다.'; if ($Auto) { return $false }; Pause1; return }

  $defName = if ($st.PSObject.Properties['cfProject']) { $st.cfProject } else { 'hyeseong-erp' }
  $name = if ($Auto -and $st.PSObject.Properties['cfProject']) { $defName } else { (Ask '프로젝트 이름 (그냥 Enter)' $defName).ToLower() }
  if ($name -notmatch '^[a-z0-9][a-z0-9-]{0,56}$') { Fail '프로젝트 이름 형식이 맞지 않습니다.'; if ($Auto) { return $false }; Pause1; return }

  $env:CLOUDFLARE_API_TOKEN = $cft; $env:CLOUDFLARE_ACCOUNT_ID = $acc; $env:WRANGLER_SEND_METRICS = 'false'; $env:FORCE_COLOR = '0'; $env:NO_COLOR = '1'
  try {
    Info '프로젝트 확인 중 (처음 한 번은 업로드 도구를 받느라 1~2분 걸립니다)…'
    RunNative { npx --yes wrangler@4.154.0 pages project create $name --production-branch main } | ForEach-Object { Log ('wrangler ' + $_) }
    Info '올리는 중…'
    $out = RunNative { npx --yes wrangler@4.154.0 pages deploy $SiteDir --project-name $name --branch main --commit-dirty=true }
    $out | ForEach-Object { Log ('wrangler ' + $_) }
    $txt = ($out | Out-String)
    if ($LASTEXITCODE -ne 0) { throw ('배포 실패:' + "`n" + ((($txt -split "`n") | Where-Object { $_.Trim() -and $_ -notmatch 'npm warn' } | Select-Object -Last 12) -join "`n")) }
    Ok ("배포 완료: https://$name.pages.dev")
    Info '처음 만든 주소는 켜지기까지 5~10분 걸릴 수 있습니다. 열리면 Ctrl + F5'
    SetProp $st 'cfAccount' $acc; SetProp $st 'cfProject' $name; SetProp $st 'siteUrl' ("https://$name.pages.dev")
    if (-not $verified -and $env:OS -eq 'Windows_NT') { # Windows 암호화(DPAPI)일 때만 저장
      if (YesNo '다음에 다시 올릴 때 토큰을 묻지 않도록 이 PC에 암호화해 저장할까요? (이 Windows 사용자만 풀 수 있음)' $true) {
        try { SetProp $st 'cfToken' (ConvertTo-SecureString $cft -AsPlainText -Force | ConvertFrom-SecureString -ErrorAction Stop); Ok '토큰을 암호화해 저장했습니다.' } catch { Warn '이 PC에서는 암호화 저장을 쓸 수 없어 저장하지 않았습니다.' }
      }
    }
    SaveState $st
    if ($Auto) { return $true }
    if (YesNo '사이트를 열까요?' $true) { Open ("https://$name.pages.dev") }
  } catch {
    Fail $_.Exception.Message
    Warn '자세한 내용은 installer 폴더의 install.log 에 있습니다. 화면을 찍어 Claude에게 보내주세요.'
    if ($Auto) { return $false }
  } finally { Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue; Remove-Item Env:CLOUDFLARE_ACCOUNT_ID -ErrorAction SilentlyContinue }
  Pause1
}
function ManualUpload {
  $zip = Join-Path $Root '업로드용_site.zip'
  if (Test-Path $zip) { Remove-Item $zip -Force }
  # Windows PowerShell 5.1의 Compress-Archive는 경로를 \ 로 저장해 웹 업로드가 깨질 수 있어 직접 압축
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $fs = [IO.File]::Open($zip, [IO.FileMode]::Create)
  $za = New-Object IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Create)
  try {
    $base = (Resolve-Path $SiteDir).Path.TrimEnd('\', '/')
    Get-ChildItem -Path $SiteDir -Recurse -File | ForEach-Object {
      $rel = $_.FullName.Substring($base.Length + 1).Replace('\', '/')
      [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($za, $_.FullName, $rel)
    }
  } finally { $za.Dispose(); $fs.Dispose() }
  Ok ('업로드용 파일 생성: ' + $zip)
  Write-Host ''
  Info '1) 열리는 Cloudflare 화면에서 (처음이면 가입 · 로그인) Workers & Pages > 만들기 > Pages > "에셋 업로드(Upload assets)"'
  Info '2) 프로젝트 이름 hyeseong-erp 입력 → 프로젝트 만들기 → 열린 폴더의 업로드용_site.zip 을 끌어다 놓기 → 사이트 배포'
  Info '3) 나온 주소(https://hyeseong-erp.pages.dev)를 메모 — 직원들에게 공지할 주소'
  Info '※ 프로그램을 고쳐서 다시 올릴 때: 같은 프로젝트 > 새 배포 만들기 > 새 압축파일 끌어다 놓기'
  Open 'https://dash.cloudflare.com/?to=/:account/workers-and-pages/create/pages'
  Open 'explorer.exe' ('/select,"' + $zip + '"')
}

# ---------- 6. 수정 파일 한 번에 적용 (업데이트) ----------
# Claude가 보낸 ERP_수정파일_*.zip 을 찾아 → 덮어쓰기(연결 정보는 그대로) → 바뀐 SQL만 실행 → 인터넷에 올리기
function FindUpdateZip {
  $dirs = New-Object System.Collections.ArrayList
  try { $dl = (New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path; if ($dl) { [void]$dirs.Add($dl) } } catch { }
  foreach ($d in @((Join-Path $HOME 'Downloads'), [Environment]::GetFolderPath('Desktop'), $(if ($env:OneDrive) { Join-Path $env:OneDrive '바탕 화면' }), $(if ($env:OneDrive) { Join-Path $env:OneDrive 'Desktop' }), $Root)) { if ($d) { [void]$dirs.Add($d) } }
  if ($env:HS_UPDATE_DIR) { $dirs.Clear(); [void]$dirs.Add($env:HS_UPDATE_DIR) }
  $all = foreach ($d in ($dirs | Select-Object -Unique)) { if (Test-Path $d) { Get-ChildItem -Path $d -Filter 'ERP_수정파일*.zip' -File -ErrorAction SilentlyContinue } }
  return ($all | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
}
function SupabaseRef {
  $st = LoadState
  if ($st.PSObject.Properties['ref'] -and $st.ref) { return $st.ref }
  $cfgText = if (Test-Path $CfgFile) { [IO.File]::ReadAllText($CfgFile, [Text.Encoding]::UTF8) } else { '' }
  $m = [regex]::Match($cfgText, "supabaseUrl:\s*'(https://[^']+)'")
  if ($m.Success) { return (RefFromUrl $m.Groups[1].Value) }
  return $null
}
function SqlHash([string]$p) { return (Get-FileHash -Algorithm SHA256 -Path $p).Hash }
function Update {
  Title '수정 파일 한 번에 적용 (덮어쓰기 → DB → 인터넷에 올리기)'
  $st = LoadState
  # ① 수정 파일 찾기
  $zip = FindUpdateZip
  if (-not $zip) { Fail '다운로드 폴더 · 바탕화면에서 ERP_수정파일 압축 파일을 찾지 못했습니다.'; Info 'Claude 대화창에서 압축 파일을 내려받은 뒤 다시 실행하세요.'; return $false }
  Ok ('수정 파일: ' + $zip.Name + '  (' + $zip.LastWriteTime.ToString('MM-dd HH:mm') + ')')
  $sig = $zip.Name + '|' + $zip.Length
  if ($st.PSObject.Properties['lastZip'] -and $st.lastZip -eq $sig) {
    Warn '이 파일은 이미 적용했습니다.'
    if (-not (YesNo '그래도 다시 적용할까요?' $false)) { return $true }
  } elseif (-not (YesNo '이 파일을 적용할까요?' $true)) { Warn '취소했습니다.'; return $true }

  # ② 풀어서 덮어쓰기 (연결 정보 config.js · 설치 기록 settings.json 은 그대로)
  $selfPath = Join-Path $PSScriptRoot 'install.ps1'; $selfHash = SqlHash $selfPath
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('hs-erp-upd-' + [guid]::NewGuid().ToString('N'))
  try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($zip.FullName, $tmp)
    if (-not (Test-Path (Join-Path $tmp 'site\index.html'))) { if (-not (Test-Path (Join-Path $tmp 'site/index.html'))) { Fail 'ERP 수정 파일이 아닙니다 (site 폴더가 없음).'; return $false } }
    $keep = @('site/js/config.js', 'installer/settings.json', 'installer/install.log')
    $n = 0; $base = (Resolve-Path $tmp).Path.TrimEnd('\', '/')
    Get-ChildItem -Path $tmp -Recurse -File | ForEach-Object {
      $rel = $_.FullName.Substring($base.Length + 1).Replace('\', '/')
      if ($keep -contains $rel -or $rel -eq '읽어보기.txt') { return }
      $dst = Join-Path $Root $rel
      $dd = Split-Path -Parent $dst; if (-not (Test-Path $dd)) { [void](New-Item -ItemType Directory -Path $dd -Force) }
      Copy-Item -LiteralPath $_.FullName -Destination $dst -Force; $n++
    }
    Ok ('파일 ' + $n + '개 덮어쓰기 완료 (연결 정보는 그대로)')
  } catch { Fail ('압축 풀기 · 덮어쓰기 실패: ' + $_.Exception.Message); Info 'ERP 폴더의 파일이 열려 있으면 닫고 다시 실행하세요.'; return $false }
  finally { if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue } }
  if ((SqlHash $selfPath) -ne $selfHash) {
    Info '설치 프로그램도 새것으로 바뀌어, 새 설치 프로그램으로 이어서 진행합니다.'
    $env:HS_UPD_SIG = $sig
    $exe = (Get-Process -Id $PID).Path
    & $exe -NoProfile -ExecutionPolicy Bypass -File $selfPath 'update-rest' | Out-Host
    $code = $LASTEXITCODE; Remove-Item Env:HS_UPD_SIG -ErrorAction SilentlyContinue
    return ($code -eq 0)
  }
  UpdateRest $sig
}
function UpdateRest([string]$sig) {
  $st = LoadState

  # ③ 바뀐 SQL만 Supabase에 실행 (여러 번 실행해도 안전한 파일들)
  $done = @{}
  if ($st.PSObject.Properties['sqlDone'] -and $st.sqlDone) { foreach ($p in $st.sqlDone.PSObject.Properties) { $done[$p.Name] = $p.Value } }
  $todo = @(Get-ChildItem -Path $SqlDir -Filter '*.sql' -File | Where-Object { $_.Name -match '^\d\d_' } | Sort-Object Name | Where-Object { $done[$_.Name] -ne (SqlHash $_.FullName) })
  if ($todo.Count -eq 0) { Ok 'DB(Supabase): 바뀐 것 없음' }
  else {
    Info ('DB(Supabase)에 적용할 파일: ' + (($todo | ForEach-Object { $_.Name }) -join ', '))
    $ref = SupabaseRef
    if (-not $ref) { Fail 'Supabase 주소를 찾지 못했습니다. 메뉴 2(운영 설치 ①)를 먼저 실행하세요.'; return $false }
    $tok = GetSavedToken $st 'sbToken'; $ok = $false
    if ($tok) { try { [void](Sb 'GET' "/v1/projects/$ref" $null $tok); $ok = $true; Ok '저장된 Supabase 열쇠(토큰)를 사용합니다.' } catch { Warn '저장된 Supabase 토큰이 만료됐습니다. 새로 넣어주세요.' } }
    if (-not $ok) {
      Info 'Supabase 열쇠(개인 액세스 토큰)가 필요합니다 — 처음 한 번만.'
      Info '열리는 화면에서 [Generate new token] → 이름 HyeSeong ERP → 만료 기간은 가장 길게 → 나온 글자(sbp_…) [Copy]'
      if (YesNo '토큰 만들기 화면을 열까요?' $true) { Open 'https://supabase.com/dashboard/account/tokens' }
      $tok = AskSecret 'Supabase 토큰 붙여넣기 (마우스 오른쪽 클릭 · 화면에 안 보임)'
      if (-not $tok) { Fail '토큰이 없습니다.'; return $false }
      try { $proj = Sb 'GET' "/v1/projects/$ref" $null $tok; Ok ('프로젝트 확인: ' + $proj.name) } catch { Fail $_.Exception.Message; Fail '토큰 글자 전체를 복사했는지 확인하세요.'; return $false }
      if ($env:OS -eq 'Windows_NT' -and (YesNo '다음부터 묻지 않도록 이 PC에 암호화해 저장할까요? (이 Windows 사용자만 풀 수 있음)' $true)) {
        try { SetProp $st 'sbToken' (ConvertTo-SecureString $tok -AsPlainText -Force | ConvertFrom-SecureString -ErrorAction Stop); SaveState $st; Ok '토큰을 암호화해 저장했습니다.' } catch { Warn '이 PC에서는 암호화 저장을 쓸 수 없어 저장하지 않았습니다.' }
      }
    }
    foreach ($f in $todo) {
      $sql = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8)
      Info ('실행 중: ' + $f.Name)
      try { [void](SbQuery $ref $sql $tok); $done[$f.Name] = (SqlHash $f.FullName); Ok ($f.Name + ' 완료') }
      catch { Fail $_.Exception.Message; Fail 'DB 적용을 멈췄습니다 (인터넷에는 아직 안 올림). 이 화면을 찍어 Claude에게 보내주세요.'; SetProp $st 'sqlDone' ([pscustomobject]$done); SaveState $st; return $false }
    }
    SetProp $st 'sqlDone' ([pscustomobject]$done); SaveState $st
  }

  # ④ 인터넷에 올리기
  $r = @(Deploy -Auto)[-1]
  if ($r -ne $true) { Fail '인터넷에 올리지 못했습니다. 위 내용을 찍어 Claude에게 보내주세요.'; return $false }
  $st = LoadState; SetProp $st 'lastZip' $sig; SetProp $st 'updatedAt' (Get-Date -Format 'yyyy-MM-dd HH:mm'); SaveState $st
  Write-Host ''
  Ok '업데이트가 모두 끝났습니다.'
  Info 'ERP 화면에서 Ctrl + F5 를 한 번 누르면 바뀐 화면이 보입니다. (직원 PC도 처음 한 번 Ctrl + F5)'
  if ($st.PSObject.Properties['siteUrl']) { Open $st.siteUrl }
  return $true
}

# ---------- 4. 설치 점검 ----------
function Check {
  Title '설치 점검'
  $ok = $true
  foreach ($p in @('site\index.html', 'site\js\app.js', 'site\js\parsers.js', 'site\vendor\xlsx.full.min.js', 'site\vendor\supabase.js', 'sql\01_schema.sql', 'sql\02_security.sql', 'sql\03_extend.sql', 'sql\04_views.sql', 'sql\05_firewall.sql', 'sql\06_count_season.sql', 'sql\07_returns.sql', 'sql\08_meeting.sql', 'sql\09_anseong.sql', 'sql\10_storage.sql', 'sql\11_notice_pl.sql', 'sql\12_speed.sql', 'sql\13_csdata.sql', 'sql\14_csmerge.sql', 'sql\15_cnt_trash.sql', 'sql\16_cs_alloc.sql', 'sql\17_cs_alloc_close.sql', 'sql\18_np_raw.sql', 'sql\19_alloc_year.sql', 'sql\20_item_map.sql', 'sql\21_alloc_nostore.sql', 'sql\22_meet_book.sql', 'sql\23_cost_open.sql', 'sql\24_purge.sql', 'sql\29_ceo.sql', 'sql\30_pl_json.sql', 'sql\31_audit_trim.sql', 'sql\32_add_user.sql', 'sql\33_iwol.sql', 'sql\34_user_admin.sql', 'sql\35_iwol_term.sql', 'sql\36_tlmeet.sql')) {
    if (Test-Path (Join-Path $Root $p)) { Ok ('파일 ' + $p) } else { Fail ('파일 없음: ' + $p); $ok = $false }
  }
  $cfgText = if (Test-Path $CfgFile) { [IO.File]::ReadAllText($CfgFile, [Text.Encoding]::UTF8) } else { '' }
  $m = [regex]::Match($cfgText, "supabaseUrl:\s*'(https://[^']+)'")
  $k = [regex]::Match($cfgText, "supabaseKey:\s*'([^']+)'")
  if ($m.Success -and $k.Success) {
    Ok ('연결 정보: ' + $m.Groups[1].Value)
    try {
      $r = Invoke-WebRequest -UseBasicParsing -Uri ($m.Groups[1].Value + '/rest/v1/erp_roles?select=id&limit=1') -Headers @{ apikey = $k.Groups[1].Value; Authorization = ('Bearer ' + $k.Groups[1].Value) } -TimeoutSec 20
      Ok ('Supabase 접속 정상 (HTTP ' + $r.StatusCode + ')')
    } catch {
      $code = $null; try { $code = [int]$_.Exception.Response.StatusCode } catch { }
      if ($code -eq 404) { Fail 'ERP 테이블이 없습니다 → 메뉴 2 실행'; $ok = $false }
      elseif ($code) { Ok ('Supabase 응답 HTTP ' + $code + ' (로그인 전 읽기 제한은 정상)') }
      else { Fail ('Supabase 접속 실패: ' + $_.Exception.Message); $ok = $false }
    }
  } else { Warn '연결 정보 없음 → 지금은 시연(로컬) 모드로 열립니다. 운영하려면 메뉴 2 실행' }
  $st = LoadState
  if ($st.PSObject.Properties['siteUrl']) {
    try { $r = Invoke-WebRequest -UseBasicParsing -Uri $st.siteUrl -TimeoutSec 20; Ok ('운영 사이트 열림: ' + $st.siteUrl + ' (HTTP ' + $r.StatusCode + ')') } catch { Fail ('운영 사이트 접속 실패: ' + $st.siteUrl) ; $ok = $false }
  } else { Info '배포 기록 없음 (메뉴 3)' }
  if ($ok) { Write-Host ''; Ok '점검 완료' }
  Pause1
}

# ---------- 메뉴 ----------
function Menu {
  while ($true) {
    Clear-Host
    Write-Host ''
    Write-Host ('   ' + ('━' * 46)) -ForegroundColor DarkYellow
    Write-Host '     혜성물류 운영 ERP  설치 프로그램  v1.6' -ForegroundColor Yellow
    Write-Host '     고백리센터 · 안성센터 통합 업무관리' -ForegroundColor Gray
    Write-Host ('   ' + ('━' * 46)) -ForegroundColor DarkYellow
    $st = LoadState
    if ($st.PSObject.Properties['project']) { Write-Host ('     Supabase: ' + $st.project + ' · 설치 ' + $st.installedAt) -ForegroundColor DarkGray }
    if ($st.PSObject.Properties['siteUrl']) { Write-Host ('     운영 주소: ' + $st.siteUrl) -ForegroundColor DarkGray }
    Write-Host ''
    Write-Host '     1. 시연 모드로 바로 열기            (설치 없이 화면 확인)'
    Write-Host '     2. 운영 설치 ① Supabase 연결·DB 설치 (데이터 저장 장소)'
    Write-Host '     3. 운영 설치 ② 인터넷에 올리기 (자동 · 수정할 때마다)'
    Write-Host '     4. 설치 점검'
    Write-Host '     5. 설치 매뉴얼 열기'
    Write-Host '     6. 수정 파일 한 번에 적용 (업데이트)  ← Claude가 보낸 압축 파일'
    Write-Host '     0. 종료'
    Write-Host ''
    $c = Read-Host '   번호 선택'
    try {
      switch ($c) {
        '1' { Demo }
        '2' { InstallSupabase }
        '3' { Deploy }
        '4' { Check }
        '5' { $m = Get-ChildItem -Path $Root -Filter '*설치*매뉴얼*.pptx' -ErrorAction SilentlyContinue | Select-Object -First 1; if ($m) { Open $m.FullName } else { Open (Join-Path $Root 'README.md') } }
        '6' { [void](@(Update)); Pause1 }
        '0' { return }
        default { }
      }
    } catch { Fail $_.Exception.Message; Pause1 }
  }
}

Log '설치 프로그램 시작'
if ($args.Count -gt 0) {
  switch ($args[0]) {
    'demo' { Demo } 'supabase' { InstallSupabase } 'deploy' { Deploy } 'check' { Check }
    'update-rest' { $r = $false; try { $r = @(UpdateRest $env:HS_UPD_SIG)[-1] } catch { Fail $_.Exception.Message }; if ($r -ne $true) { exit 1 } else { exit 0 } }
    'update' { $r = $false; try { $r = @(Update)[-1] } catch { Fail $_.Exception.Message }; Write-Host ''; [void](Read-Host '  Enter 키를 누르면 창이 닫힙니다'); if ($r -ne $true) { exit 1 } }
    default { Menu }
  }
} else { Menu }
