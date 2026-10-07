/* App bệnh nhân – Supabase (Auth + RLS) gọi trực tiếp từ trình duyệt */
'use strict';

let sb, cfg, profile, chart;
const $ = (id) => document.getElementById(id);

function showView(name) {
  for (const v of ['loading', 'login', 'change-pw', 'app']) show($('view-' + v), v === name);
}

/* ---------------------------------------------------------------- khởi động */
async function boot() {
  registerServiceWorker();
  try {
    cfg = await loadConfig();
  } catch (e) {
    $('view-loading').textContent = e.message;
    return;
  }
  sb = supabase.createClient(cfg.supabase_url, cfg.supabase_key);
  buildAdrForm();
  bindEvents();
  const { data } = await sb.auth.getSession();
  if (data.session) await afterLogin(); else showView('login');
}

async function afterLogin() {
  const { data: u } = await sb.auth.getUser();
  const { data, error } = await sb.from('profiles').select('*').eq('id', u && u.user ? u.user.id : '').maybeSingle();
  if (error || !data) { await sb.auth.signOut(); showView('login'); return; }
  profile = data;
  if (profile.role === 'admin') {
    await sb.auth.signOut();
    showView('login');
    setError($('login-error'), 'Tài khoản bác sĩ/dược sĩ vui lòng đăng nhập ở trang quản trị.');
    return;
  }
  if (profile.must_change_password) { showView('change-pw'); return; }
  enterApp();
}

function enterApp() {
  $('hello-name').textContent = profile.full_name || profile.patient_code;
  $('today-label').textContent = fmtLongToday();
  $('acc-code').textContent = profile.patient_code || '';
  $('acc-name').textContent = profile.full_name || '';
  showView('app');
  switchTab('today');
}

/* ---------------------------------------------------------------- sự kiện */
function bindEvents() {
  $('login-form').addEventListener('submit', onLogin);
  $('force-pw-form').addEventListener('submit', (e) => onChangePassword(e, 'force-new-pw', 'force-new-pw2', 'force-pw-error', 'force-pw-submit', true));
  $('pw-form').addEventListener('submit', (e) => onChangePassword(e, 'pw-new', 'pw-new2', 'pw-error', 'pw-submit', false));
  $('sugar-form').addEventListener('submit', onSaveSugar);
  $('adr-form').addEventListener('submit', onSubmitAdr);
  $('logout-btn').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
  document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  document.querySelectorAll('.tab-panel').forEach((p) => show(p, p.id === 'tab-' + tab));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (tab === 'today') loadToday();
  if (tab === 'sugar') loadSugar();
  if (tab === 'adr') loadAdrRecent();
}

/* ---------------------------------------------------------------- đăng nhập */
async function onLogin(e) {
  e.preventDefault();
  const code = $('login-code').value.trim().toLowerCase();
  const password = $('login-password').value;
  setError($('login-error'), '');
  if (!/^[a-z0-9_-]{3,32}$/.test(code) || !password) {
    setError($('login-error'), 'Vui lòng nhập mã bệnh nhân và mật khẩu');
    return;
  }
  const btn = $('login-submit');
  btn.disabled = true; btn.textContent = 'Đang đăng nhập…';
  const { error } = await sb.auth.signInWithPassword({ email: `${code}@${cfg.email_domain}`, password });
  btn.disabled = false; btn.textContent = 'Đăng nhập';
  if (error) { setError($('login-error'), 'Mã bệnh nhân hoặc mật khẩu không đúng'); return; }
  $('login-password').value = '';
  await afterLogin();
}

async function onChangePassword(e, id1, id2, errId, btnId, first) {
  e.preventDefault();
  const p1 = $(id1).value, p2 = $(id2).value;
  const msg = validateNewPassword(p1, p2);
  setError($(errId), msg);
  if (msg) return;
  const btn = $(btnId); btn.disabled = true;
  const { error } = await sb.auth.updateUser({ password: p1 });
  if (error) {
    btn.disabled = false;
    setError($(errId), 'Không đổi được mật khẩu. Hãy thử mật khẩu khác.');
    return;
  }
  const { error: e2 } = await sb.from('profiles').update({ must_change_password: false }).eq('id', profile.id);
  btn.disabled = false;
  if (e2) { setError($(errId), 'Đã đổi mật khẩu nhưng chưa cập nhật hồ sơ, vui lòng thử lại'); return; }
  profile.must_change_password = false;
  $(id1).value = ''; $(id2).value = '';
  toast('Đã đổi mật khẩu');
  if (first) enterApp();
}

/* ---------------------------------------------------------------- thuốc hôm nay */
async function loadToday() {
  const today = vnToday();
  const [presc, logs] = await Promise.all([
    sb.from('prescriptions').select('*').eq('is_active', true).order('created_at'),
    sb.from('daily_logs').select('prescription_id,time_slot,status').eq('date', today),
  ]);
  const list = $('med-list');
  list.replaceChildren();
  if (presc.error || logs.error) { list.append(h('p', { class: 'text-red-600 text-center' }, 'Không tải được dữ liệu. Kiểm tra kết nối mạng.')); return; }

  const done = new Map(logs.data.map((l) => [`${l.prescription_id}|${l.time_slot}`, l.status]));
  const items = [];
  for (const p of presc.data) for (const slot of p.frequency) items.push({ p, slot });
  items.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));

  if (!items.length) {
    list.append(h('div', { class: 'card p-6 text-center text-slate-500' }, 'Bác sĩ chưa kê thuốc cho bạn.'));
  }
  let taken = 0;
  for (const { p, slot } of items) {
    const status = done.get(`${p.id}|${slot}`);
    if (status === 'taken') taken++;
    list.append(medCard(p, slot, status));
  }
  const total = items.length;
  $('progress-label').textContent = total ? `${taken}/${total} đã dùng` : '';
  $('progress-bar').style.width = total ? `${Math.round((taken / total) * 100)}%` : '0%';
}

function medCard(p, slot, status) {
  const verbDone = p.is_insulin ? 'Đã tiêm' : 'Đã uống';
  const border = status === 'taken' ? 'border-emerald-400' : status === 'missed' ? 'border-red-400' : 'border-transparent';
  const btn = (label, value, cls) => h('button', {
    type: 'button',
    class: `btn py-3.5 text-lg ${cls} ${status && status !== value ? 'opacity-40' : ''}`,
    'aria-pressed': String(status === value),
    onclick: (ev) => markDose(p, slot, value, ev.currentTarget),
  }, status === value ? `✓ ${label}` : label);

  return h('article', { class: `card p-4 border-2 ${border} fade-in` },
    h('div', { class: 'flex items-start justify-between gap-2' },
      h('div', {},
        h('p', { class: 'text-xs font-bold uppercase tracking-wide text-teal-700' }, SLOTS[slot]),
        h('h3', { class: 'text-xl font-extrabold' }, p.drug_name),
        h('p', { class: 'text-slate-600' }, p.dosage)),
      p.is_insulin && h('span', { class: 'shrink-0 text-xs font-bold bg-amber-100 text-amber-800 rounded-full px-2.5 py-1' }, '💉 Insulin')),
    p.instruction && h('p', { class: 'text-sm text-slate-500 mt-1' }, p.instruction),
    h('div', { class: 'grid grid-cols-2 gap-3 mt-3' },
      btn(verbDone, 'taken', 'bg-emerald-500 text-white'),
      btn('Bỏ lỡ', 'missed', 'bg-red-50 text-red-600 border border-red-200')));
}

async function markDose(p, slot, status, btn) {
  btn.disabled = true;
  const { error } = await sb.from('daily_logs').upsert(
    { patient_id: profile.id, prescription_id: p.id, date: vnToday(), time_slot: slot, status },
    { onConflict: 'prescription_id,date,time_slot' });
  if (error) { toast('Không lưu được, vui lòng thử lại', 'error'); btn.disabled = false; return; }
  toast(status === 'taken' ? 'Đã ghi nhận' : 'Đã ghi nhận bỏ lỡ');
  loadToday();
}

/* ---------------------------------------------------------------- đường huyết */
function classifySugar(level, tod) {
  if (level < 3.9) return ['Thấp (dưới 3.9). Hãy bổ sung đường nhanh và báo bác sĩ nếu có triệu chứng.', 'text-red-600'];
  const high = tod === 'fasting' ? 7.0 : 10.0;
  if (level > high) return ['Cao hơn mục tiêu thông thường. Hãy theo dõi và trao đổi với bác sĩ.', 'text-amber-600'];
  return ['Trong ngưỡng thường gặp. Tiếp tục duy trì!', 'text-emerald-600'];
}

async function onSaveSugar(e) {
  e.preventDefault();
  const level = parseFloat($('sugar-level').value);
  if (!(level > 0 && level <= 50)) { toast('Chỉ số không hợp lệ', 'error'); return; }
  const tod = $('sugar-time').value;
  const btn = $('sugar-submit'); btn.disabled = true;
  const { error } = await sb.from('blood_sugar_logs').insert({ patient_id: profile.id, date: vnToday(), level, time_of_day: tod });
  btn.disabled = false;
  if (error) { toast('Không lưu được, vui lòng thử lại', 'error'); return; }
  const [text, cls] = classifySugar(level, tod);
  const hint = $('sugar-hint');
  hint.textContent = text; hint.className = `text-sm font-semibold ${cls}`;
  $('sugar-level').value = '';
  toast('Đã lưu chỉ số');
  loadSugar();
}

async function loadSugar() {
  const since = addDays(vnToday(), -6);
  const { data, error } = await sb.from('blood_sugar_logs').select('date,level,time_of_day,created_at')
    .gte('date', since).order('created_at', { ascending: false }).limit(200);
  if (error) { toast('Không tải được đường huyết', 'error'); return; }

  const days = Array.from({ length: 7 }, (_, i) => addDays(since, i));
  const avg = (tod) => days.map((d) => {
    const v = data.filter((r) => r.date === d && r.time_of_day === tod).map((r) => Number(r.level));
    return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null;
  });
  const ds = (label, tod, color) => ({ label, data: avg(tod), borderColor: color, backgroundColor: color, tension: .3, spanGaps: true, pointRadius: 4 });
  if (chart) chart.destroy();
  chart = new Chart($('sugar-chart'), {
    type: 'line',
    data: { labels: days.map((d) => d.slice(8) + '/' + d.slice(5, 7)), datasets: [ds('Lúc đói', 'fasting', '#0d9488'), ds('Sau ăn', 'after_meal', '#f59e0b')] },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { title: { display: true, text: 'mmol/L' }, suggestedMin: 3, suggestedMax: 12 } }, plugins: { legend: { position: 'bottom' } } },
  });

  const ul = $('sugar-recent');
  ul.replaceChildren();
  if (!data.length) ul.append(h('li', { class: 'py-2 text-slate-500' }, 'Chưa có dữ liệu trong 7 ngày qua.'));
  for (const r of data.slice(0, 8)) {
    ul.append(h('li', { class: 'py-2 flex justify-between' },
      h('span', {}, `${fmtDate(r.date)} · ${TOD[r.time_of_day]}`),
      h('strong', {}, `${r.level} mmol/L`)));
  }
}

/* ---------------------------------------------------------------- ADR */
function buildAdrForm() {
  const box = $('adr-symptoms');
  SYMPTOMS.forEach((s, i) => {
    box.append(h('label', { class: 'flex items-center gap-2 border border-slate-300 rounded-xl px-3 py-3 has-[:checked]:bg-teal-50 has-[:checked]:border-teal-500 cursor-pointer' },
      h('input', { type: 'checkbox', name: 'symptom', value: s, id: 'sym-' + i, class: 'w-5 h-5 accent-teal-600' }),
      h('span', { class: 'font-medium' }, s)));
  });
  const sev = $('adr-severity');
  Object.entries(SEVERITY).forEach(([v, label], i) => {
    sev.append(h('label', { class: 'text-center border border-slate-300 rounded-xl py-3 font-semibold cursor-pointer has-[:checked]:bg-teal-600 has-[:checked]:text-white has-[:checked]:border-teal-600' },
      h('input', { type: 'radio', name: 'severity', value: v, class: 'sr-only', checked: i === 0 }), label));
  });
  sev.addEventListener('change', () => {
    show($('adr-severe-note'), document.querySelector('input[name=severity]:checked').value === 'nang');
  });
}

async function onSubmitAdr(e) {
  e.preventDefault();
  const symptoms = [...document.querySelectorAll('input[name=symptom]:checked')].map((i) => i.value);
  const severity = document.querySelector('input[name=severity]:checked').value;
  const description = $('adr-desc').value.trim();
  setError($('adr-error'), '');
  if (!symptoms.length) { setError($('adr-error'), 'Hãy chọn ít nhất một triệu chứng'); return; }
  if (symptoms.includes('Khác') && !description) { setError($('adr-error'), 'Vui lòng mô tả triệu chứng “Khác”'); return; }
  const btn = $('adr-submit'); btn.disabled = true;
  const { error } = await sb.from('adr_reports').insert({
    patient_id: profile.id, date: vnToday(), symptoms, severity, description: description || null,
  });
  btn.disabled = false;
  if (error) { toast('Không gửi được báo cáo, vui lòng thử lại', 'error'); return; }
  toast('Đã gửi báo cáo tới bác sĩ');
  $('adr-form').reset();
  show($('adr-severe-note'), false);
  loadAdrRecent();
}

async function loadAdrRecent() {
  const { data, error } = await sb.from('adr_reports').select('date,symptoms,severity,is_reviewed')
    .order('created_at', { ascending: false }).limit(10);
  const ul = $('adr-recent');
  ul.replaceChildren();
  if (error) { ul.append(h('li', { class: 'py-2 text-red-600' }, 'Không tải được dữ liệu')); return; }
  if (!data.length) ul.append(h('li', { class: 'py-2 text-slate-500' }, 'Chưa có báo cáo nào.'));
  for (const r of data) {
    const sevCls = r.severity === 'nang' ? 'bg-red-100 text-red-700' : r.severity === 'vua' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700';
    ul.append(h('li', { class: 'py-2' },
      h('div', { class: 'flex justify-between items-center' },
        h('span', { class: 'font-semibold' }, fmtDate(r.date)),
        h('span', { class: `text-xs font-bold rounded-full px-2 py-0.5 ${sevCls}` }, SEVERITY[r.severity])),
      h('p', { class: 'text-slate-600' }, r.symptoms.join(', ')),
      h('p', { class: 'text-xs text-slate-400' }, r.is_reviewed ? 'Bác sĩ đã xem' : 'Đang chờ bác sĩ xem')));
  }
}

boot();
