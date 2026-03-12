// ============================================================
// PayPulse - Google Apps Script バックエンド
// 使い方：
//   1. このコードをGASエディタに貼り付けて保存する
//   2. setupConfig() を一度だけ実行して ID・パスワードを設定する
//   3. 「デプロイ」→「新しいデプロイ」→「ウェブアプリ」
//   4. 「アクセスできるユーザー」を「全員」に設定
//   5. デプロイ後のURLをHTMLファイルの GAS_URL に貼り付ける
// ============================================================

// ── 定数（変更不要）──
const MIN_DATA    = 5;   // パーセンタイル表示の最低件数
const MIN_DATA_99 = 50;  // 99%ile 解放の最低件数

// ────────────────────────────────────────────────────────────
// 設定管理（PropertiesService）
// ★ スプレッドシートIDとパスワードはソースに直書きしない
//   下の setupConfig() を一度だけ実行して登録してください
// ────────────────────────────────────────────────────────────

/**
 * 初回セットアップ用関数。
 * GASエディタで値を書き換えてから「実行」ボタンで一度だけ呼び出す。
 * 設定後はこの関数を再度実行する必要はない。
 */
function setupConfig() {
  const props = PropertiesService.getScriptProperties();
  // ↓↓↓ 実際の値に書き換えてから実行してください ↓↓↓
  props.setProperty('SPREADSHEET_ID', 'YOUR_SPREADSHEET_ID_HERE');
  props.setProperty('ADMIN_PASSWORD',  'YOUR_SECURE_PASSWORD_HERE');
  // ↑↑↑
  Logger.log('✅ 設定完了：SPREADSHEET_ID と ADMIN_PASSWORD を登録しました');
}

function getSpreadsheetId() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID が未設定です。setupConfig() を実行してください。');
  return id;
}

function getAdminPassword() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD') || '';
}

// ────────────────────────────────────────────────────────────
// GET ハンドラ（結果取得・管理者データ）
// ────────────────────────────────────────────────────────────
function doGet(e) {
  const p        = e.parameter;
  const action   = p.action;
  const callback = p.callback; // JSONP用

  let result;
  if (action === 'result') {
    result = getResult(p.id);
  } else if (action === 'admin') {
    result = p.password === getAdminPassword()
      ? getAllData()
      : { success: false, error: 'Unauthorized' };
  } else if (action === 'count') {
    result = getResponseCount();
  } else if (action === 'ping') {
    result = { success: true, message: 'PayPulse API OK' };
  } else {
    result = { success: false, error: 'Unknown action' };
  }

  const json = JSON.stringify(result);
  // JSONP対応（クロスオリジン回避）
  return ContentService
    .createTextOutput(callback ? `${callback}(${json})` : json)
    .setMimeType(callback
      ? ContentService.MimeType.JAVASCRIPT
      : ContentService.MimeType.JSON);
}

// ────────────────────────────────────────────────────────────
// POST ハンドラ（回答保存）
// ────────────────────────────────────────────────────────────
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'submit') {
      saveResponse(body.id, body.payload);
      return respond({ success: true, id: body.id });
    }
    return respond({ success: false, error: 'Unknown action' });
  } catch (err) {
    return respond({ success: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ────────────────────────────────────────────────────────────
// 回答を保存
// ────────────────────────────────────────────────────────────
function saveResponse(id, d) {
  const ss = SpreadsheetApp.openById(getSpreadsheetId());
  let sheet = ss.getSheetByName('Responses');

  if (!sheet) {
    sheet = ss.insertSheet('Responses');
    const headers = [
      'ID', '送信日時', 'メール',
      '案件1_工事分類', '案件1_役職', '案件1_建物用途',
      '案件1_受注金額_億円', '案件1_受注金額_万円',
      '案件1_地上階', '案件1_地下階', '案件1_延床面積',
      '案件1_経験業務', '案件1_構造種別',
      '案件2_工事分類', '案件2_役職', '案件2_建物用途',
      '案件2_受注金額_億円', '案件2_受注金額_万円',
      '案件2_地上階', '案件2_地下階', '案件2_延床面積',
      '案件2_経験業務', '案件2_構造種別',
      '年収_総支給年収', '年収_賞与', '年収_手当',
      '年収_残業代制度', '年収_実残業時間',
      '基本_年齢', '基本_性別', '基本_最終学歴',
      '基本_勤務地', '基本_保有資格'
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#1a5fad').setFontColor('#fff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  const c1  = d.case1  || {};
  const c2  = d.case2  || {};
  const inc = d.income || {};
  const bas = d.basic  || {};

  sheet.appendRow([
    id,
    new Date().toLocaleString('ja-JP'),
    d.email || '',
    c1.type || '', c1.role || '', c1.bldg || '',
    parseFloat(c1.oku) || 0, parseFloat(c1.man) || 0,
    parseFloat(c1.fab) || 0, parseFloat(c1.fbl) || 0, parseFloat(c1.area) || 0,
    (c1.scope || []).join('|'), c1.struct || '',
    c2.type || '', c2.role || '', c2.bldg || '',
    parseFloat(c2.oku) || 0, parseFloat(c2.man) || 0,
    parseFloat(c2.fab) || 0, parseFloat(c2.fbl) || 0, parseFloat(c2.area) || 0,
    (c2.scope || []).join('|'), c2.struct || '',
    parseFloat(inc.total) || 0,
    parseFloat(inc.bonus) || 0,
    parseFloat(inc.allow) || 0,
    inc.ottype || '',
    parseFloat(inc.othrs) || 0,
    parseInt(bas.age)   || 0,
    bas.gender || '', bas.edu || '', bas.pref || '',
    (bas.quals || []).join('|')
  ]);
}

// ────────────────────────────────────────────────────────────
// 診断結果を計算して返す
// ────────────────────────────────────────────────────────────
function getResult(id) {
  if (!id) return { success: false, error: 'ID required' };

  const ss    = SpreadsheetApp.openById(getSpreadsheetId());
  const sheet = ss.getSheetByName('Responses');
  if (!sheet || sheet.getLastRow() < 2)
    return { success: false, error: 'No data yet' };

  const all     = sheet.getDataRange().getValues();
  const headers = all[0];
  const rows    = all.slice(1);
  const h       = col => headers.indexOf(col);

  // ユーザー行を検索
  const userRow = rows.find(r => r[0] === id);
  if (!userRow) return { success: false, error: 'ID not found' };

  const userIncome = parseFloat(userRow[h('年収_総支給年収')]) || 0;
  const userAge    = parseInt(userRow[h('基本_年齢')])          || 0;
  const userRole   = userRow[h('案件1_役職')];
  const userType   = userRow[h('案件1_工事分類')];
  const userPref   = userRow[h('基本_勤務地')];

  const ageBand = age => {
    if (age < 30) return '20代';
    if (age < 40) return '30代';
    if (age < 50) return '40代';
    return '50代以上';
  };
  const userBand = ageBand(userAge);

  // 全有効エントリ
  const entries = rows
    .filter(r => parseFloat(r[h('年収_総支給年収')]) > 0)
    .map(r => ({
      income : parseFloat(r[h('年収_総支給年収')]),
      role   : r[h('案件1_役職')],
      type   : r[h('案件1_工事分類')],
      pref   : r[h('基本_勤務地')],
      age    : parseInt(r[h('基本_年齢')]) || 0,
      band   : ageBand(parseInt(r[h('基本_年齢')]) || 0),
      date   : r[h('送信日時')] ? new Date(r[h('送信日時')]) : null
    }));

  // ── 自動緩和ロジック ──
  const stages = [
    { desc: null,                    fn: e => e.role===userRole && e.type===userType && e.pref===userPref && e.band===userBand },
    { desc: 'position条件を除去',     fn: e => e.type===userType && e.pref===userPref && e.band===userBand },
    { desc: 'constructionType条件を除去', fn: e => e.pref===userPref && e.band===userBand },
    { desc: 'prefecture条件を除去',   fn: e => e.band===userBand },
    { desc: 'age_bandを拡大',         fn: e => e.age>=20 && e.age<=49 },
    { desc: '全データで比較',          fn: () => true }
  ];

  let peerGroup = [], relaxApplied = [];
  for (let i = 0; i < stages.length; i++) {
    const g = entries.filter(stages[i].fn);
    if (stages[i].desc) relaxApplied.push(stages[i].desc);
    if (g.length >= MIN_DATA || i === stages.length - 1) { peerGroup = g; break; }
  }

  const peerIncomes = peerGroup.map(e => e.income).sort((a, b) => a - b);

  // ── パーセンタイル計算 ──
  function pct(arr, p) {
    if (!arr || arr.length === 0) return null;
    const s   = [...arr].sort((a, b) => a - b);
    const idx = (p / 100) * (s.length - 1);
    const lo  = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
  }

  const below      = peerIncomes.filter(v => v < userIncome).length;
  const userPctile = peerIncomes.length
    ? Math.round((below / peerIncomes.length) * 1000) / 10
    : 0;

  // パーセンタイルテーブル
  const pctTable = [
    { pct: 99, label: 'TOP 1%',  crown: true  },
    { pct: 90, label: 'TOP 10%', crown: true  },
    { pct: 75, label: 'TOP 25%', crown: true  },
    { pct: 50, label: '中央値',  crown: false },
    { pct: 25, label: '25%ile',  crown: false },
    { pct: 10, label: '10%ile',  crown: false }
  ].map(row => {
    const val      = pct(peerIncomes, row.pct);
    const unlocked = row.pct === 99
      ? entries.length >= MIN_DATA_99
      : peerIncomes.length >= MIN_DATA;
    const needed   = row.pct === 99
      ? Math.max(0, MIN_DATA_99 - entries.length)
      : Math.max(0, MIN_DATA - peerIncomes.length);
    return { ...row, value: val ? Math.round(val) : null, unlocked, needed };
  });

  // ヒストグラム
  const histRanges = [
    ['〜299',0,299],['300-399',300,399],['400-499',400,499],
    ['500-599',500,599],['600-699',600,699],['700-799',700,799],
    ['800-899',800,899],['900-999',900,999],['1000-1099',1000,1099],
    ['1100-1199',1100,1199],['1200-1299',1200,1299],
    ['1300-1399',1300,1399],['1400-1499',1400,1499],['1500+',1500,99999]
  ];
  const histogram = histRanges.map(([label,min,max]) => ({
    label,
    count  : peerIncomes.filter(v => v >= min && v <= max).length,
    isUser : userIncome >= min && userIncome <= max
  }));

  // キャリア年次別（全データ使用）
  const careerBands = [
    ['5-9年',5,9],['10-14年',10,14],['15-19年',15,19],
    ['20-24年',20,24],['25年以上',25,99]
  ];
  const careerTrend = careerBands.map(([label,minY,maxY]) => {
    const inc = entries
      .filter(e => { const cy = e.age - 22; return cy >= minY && cy <= maxY; })
      .map(e => e.income).sort((a,b) => a-b);
    const r = v => v ? Math.round(v) : null;
    return {
      label, count: inc.length,
      p10: r(pct(inc,10)), p25: r(pct(inc,25)), p50: r(pct(inc,50)),
      p75: r(pct(inc,75)), p90: r(pct(inc,90))
    };
  });

  // ── データ鮮度ラベルを算出 ──
  const now         = new Date();
  const ago6m       = new Date(now.getFullYear(), now.getMonth() - 6,  now.getDate());
  const ago12m      = new Date(now.getFullYear() - 1, now.getMonth(),  now.getDate());
  const ago24m      = new Date(now.getFullYear() - 2, now.getMonth(),  now.getDate());

  const validDates  = peerGroup.map(e => e.date).filter(d => d && !isNaN(d.getTime()));
  const count6m     = validDates.filter(d => d >= ago6m).length;
  const count12m    = validDates.filter(d => d >= ago12m).length;
  const count24m    = validDates.filter(d => d >= ago24m).length;
  const total       = peerGroup.length;

  const fmtYM = d => `${d.getFullYear()}年${d.getMonth() + 1}月`;
  let freshnessLabel = null;
  if (total >= MIN_DATA) {
    if      (count6m  / total >= 0.8) freshnessLabel = '直近6ヶ月';
    else if (count12m / total >= 0.8) freshnessLabel = '直近1年';
    else if (count24m / total >= 0.8) freshnessLabel = '直近2年';
    else if (validDates.length >= 2) {
      const oldest = validDates.slice().sort((a,b) => a-b)[0];
      freshnessLabel = fmtYM(oldest) + '〜';
    }
  }

  return {
    success      : true,
    userIncome, userPctile,
    peerCount    : peerIncomes.length,
    totalCount   : entries.length,
    relaxApplied,
    freshnessLabel,
    median       : peerIncomes.length ? Math.round(pct(peerIncomes,50)) : null,
    pctTable, histogram, careerTrend,
    userCareerYears: userAge - 22,
    userAge, userRole, userType, userPref
  };
}

// ────────────────────────────────────────────────────────────
// 回答数を返す（HOMEページのカウンター表示用）
// ────────────────────────────────────────────────────────────
function getResponseCount() {
  try {
    const ss    = SpreadsheetApp.openById(getSpreadsheetId());
    const sheet = ss.getSheetByName('Responses');
    if (!sheet || sheet.getLastRow() < 2) return { success: true, count: 0 };
    return { success: true, count: sheet.getLastRow() - 1 }; // ヘッダー行を除く
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────────────────────────────────────────────────────────
// 全データを返す（管理者用）
// ────────────────────────────────────────────────────────────
function getAllData() {
  const ss    = SpreadsheetApp.openById(getSpreadsheetId());
  const sheet = ss.getSheetByName('Responses');
  if (!sheet || sheet.getLastRow() < 1)
    return { success: true, headers: [], rows: [] };
  const data = sheet.getDataRange().getValues();
  return { success: true, headers: data[0], rows: data.slice(1) };
}
