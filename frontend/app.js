/* App bệnh nhân – Supabase (Auth + RLS) gọi trực tiếp từ trình duyệt */
'use strict';

let sb, cfg, profile, chart;
const $ = (id) => document.getElementById(id);

function showView(name) {
  for (const v of ['loading', 'login', 'change-pw', 'app']) show($('view-' + v), v === name);
}

/* --- QUẢN LÝ CỠ CHỮ TOÀN ỨNG DỤNG (ACCESSIBILITY FONT SIZE) --- */
const FONT_LABELS = {
  normal: 'Vừa',
  large: 'Lớn',
  xlarge: 'Rất lớn',
};

function getSavedFontSize() {
  return localStorage.getItem('dtd_font_size') || 'normal';
}

function applyFontSize(size) {
  if (!['normal', 'large', 'xlarge'].includes(size)) size = 'normal';
  document.documentElement.setAttribute('data-font-size', size);
  localStorage.setItem('dtd_font_size', size);
  document.querySelectorAll('.current-font-label').forEach((el) => {
    el.textContent = FONT_LABELS[size];
  });
  document.querySelectorAll('.font-size-choice').forEach((btn) => {
    const isCurrent = btn.dataset.size === size;
    btn.classList.toggle('border-teal-600', isCurrent);
    btn.classList.toggle('bg-teal-50', isCurrent);
    btn.classList.toggle('border-slate-200', !isCurrent);
    const check = btn.querySelector('.choice-check');
    if (check) show(check, isCurrent);
  });
}

function initFontSizeControls() {
  applyFontSize(getSavedFontSize());

  document.querySelectorAll('.btn-open-font-size').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyFontSize(getSavedFontSize());
      $('dlg-font-size').showModal();
    });
  });

  document.querySelectorAll('.font-size-choice').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyFontSize(btn.dataset.size);
    });
  });

  $('font-size-close').addEventListener('click', () => $('dlg-font-size').close());
  $('font-size-done').addEventListener('click', () => {
    $('dlg-font-size').close();
    toast('Đã cập nhật cỡ chữ');
  });
}

/* --- HIỆU ỨNG PHÁO HOA CHÚC MỪNG (CONFETTI CELEBRATION) --- */
function triggerConfetti() {
  const canvas = $('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#10b981', '#0d9488', '#34d399', '#f59e0b', '#06b6d4', '#ec4899', '#fbbf24'];
  for (let i = 0; i < 90; i++) {
    particles.push({
      x: canvas.width * 0.5 + (Math.random() - 0.5) * 160,
      y: canvas.height * 0.4 + (Math.random() - 0.5) * 80,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 1.3) * 16,
      size: Math.random() * 9 + 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 10,
      life: 1,
    });
  }

  let animId;
  const start = Date.now();
  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const elapsed = Date.now() - start;
    let active = 0;
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.38; // trọng lực
      p.rotation += p.rotSpeed;
      p.life = Math.max(0, 1 - elapsed / 3300);
      if (p.life > 0 && p.y < canvas.height + 60) {
        active++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
    }
    if (active > 0 && elapsed < 3500) {
      animId = requestAnimationFrame(loop);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cancelAnimationFrame(animId);
    }
  }
  loop();
}

/* ---------------------------------------------------------------- khởi động */
async function boot() {
  initFontSizeControls();
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
  document.querySelectorAll('.tab-panel').forEach((p) => {
    const isCurrent = p.id === 'tab-' + tab;
    show(p, isCurrent);
    if (isCurrent) p.classList.add('fade-in');
  });
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
  toast('Đã đổi mật khẩu thành công');
  if (first) enterApp();
}

/* ---------------------------------------------------------------- thuốc hôm nay */
function getCurrentSlot() {
  const h = new Date().getHours();
  if (h >= 5 && h < 10) return 'sang';
  if (h >= 10 && h < 14) return 'trua';
  if (h >= 14 && h < 18) return 'chieu';
  if (h >= 18 && h < 21) return 'toi';
  return 'truoc_ngu';
}

let _prevTakenCount = -1;

async function loadToday() {
  const today = vnToday();
  const [presc, logs] = await Promise.all([
    sb.from('prescriptions').select('*').eq('is_active', true).order('created_at'),
    sb.from('daily_logs').select('prescription_id,time_slot,status').eq('date', today),
  ]);
  const list = $('med-list');
  list.replaceChildren();
  if (presc.error || logs.error) {
    list.append(h('p', { class: 'text-rose-600 text-center font-bold' }, 'Không tải được dữ liệu. Kiểm tra kết nối mạng.'));
    return;
  }

  const done = new Map(logs.data.map((l) => [`${l.prescription_id}|${l.time_slot}`, l.status]));
  const items = [];
  for (const p of presc.data) for (const slot of p.frequency) items.push({ p, slot });
  items.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));

  if (!items.length) {
    list.append(h('div', { class: 'card p-8 text-center text-slate-500 space-y-2' },
      h('div', { class: 'text-4xl' }, '🩺'),
      h('p', { class: 'font-bold text-slate-700' }, 'Bác sĩ chưa kê đơn thuốc cho bạn'),
      h('p', { class: 'text-xs text-slate-400' }, 'Khi bác sĩ kê đơn trên hệ thống, lịch thuốc sẽ hiển thị ở đây.')));
    $('progress-label').textContent = '0/0';
    $('progress-bar').style.width = '0%';
    show($('celebration-box'), false);
    return;
  }

  const curSlot = getCurrentSlot();
  let taken = 0;
  for (const { p, slot } of items) {
    const status = done.get(`${p.id}|${slot}`);
    if (status === 'taken') taken++;
    const isCurrent = slot === curSlot && !status;
    list.append(medCard(p, slot, status, isCurrent));
  }

  const total = items.length;
  $('progress-label').textContent = `${taken}/${total} đã dùng`;
  const pct = Math.round((taken / total) * 100);
  $('progress-bar').style.width = `${pct}%`;
  if (pct === 100) $('progress-bar').classList.add('progress-glow');
  else $('progress-bar').classList.remove('progress-glow');

  const allDone = taken === total && total > 0;
  show($('celebration-box'), allDone);

  // Kích hoạt pháo hoa chúc mừng nếu vừa hoàn thành cữ cuối cùng
  if (allDone && _prevTakenCount !== -1 && _prevTakenCount < total) {
    triggerConfetti();
  }
  _prevTakenCount = taken;
}

function medCard(p, slot, status, isCurrent) {
  const verbDone = p.is_insulin ? 'Đã tiêm' : 'Đã uống';
  let cardClass = 'card p-5 fade-in transition-all relative overflow-hidden';
  if (status === 'taken') cardClass += ' card-taken';
  else if (status === 'missed') cardClass += ' card-missed';
  else if (isCurrent) cardClass += ' card-current-slot';

  const statusBadge = () => {
    if (status === 'taken') {
      return h('span', { class: 'inline-flex items-center gap-1 text-xs font-black bg-emerald-100 text-emerald-800 rounded-full px-3 py-1 shadow-sm' },
        h('span', {}, '✓'), h('span', {}, verbDone));
    }
    if (status === 'missed') {
      return h('span', { class: 'inline-flex items-center gap-1 text-xs font-black bg-rose-100 text-rose-800 rounded-full px-3 py-1 shadow-sm' },
        h('span', {}, '✕'), h('span', {}, 'Bỏ lỡ'));
    }
    if (isCurrent) {
      return h('span', { class: 'inline-flex items-center gap-1 text-xs font-black bg-teal-600 text-white rounded-full px-3 py-1 shadow-md shadow-teal-600/30 animate-pulse' },
        h('span', {}, '⚡'), h('span', {}, 'Đến giờ uống'));
    }
    return h('span', { class: 'text-xs font-bold text-slate-400 bg-slate-100 rounded-full px-2.5 py-0.5' }, 'Chưa đến');
  };

  const btnTake = h('button', {
    type: 'button',
    class: `btn py-3.5 px-4 text-base font-extrabold flex-1 gap-2 shadow-sm transition-all ${
      status === 'taken' 
        ? 'bg-emerald-600 text-white shadow-emerald-600/25 ring-2 ring-emerald-400' 
        : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20'
    }`,
    onclick: (ev) => markDose(p, slot, 'taken', ev.currentTarget),
  }, h('span', { class: 'text-lg' }, '✓'), h('span', {}, verbDone));

  const btnMiss = h('button', {
    type: 'button',
    class: `btn py-3.5 px-3 text-sm font-bold border transition-all ${
      status === 'missed'
        ? 'bg-rose-50 text-rose-700 border-rose-300 ring-2 ring-rose-400'
        : 'bg-white hover:bg-rose-50/50 text-slate-600 border-slate-200'
    }`,
    onclick: (ev) => markDose(p, slot, 'missed', ev.currentTarget),
  }, 'Bỏ lỡ');

  return h('article', { class: cardClass },
    h('div', { class: 'flex items-start justify-between gap-3 mb-2' },
      h('div', {},
        h('span', { class: 'text-xs font-black uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-100' }, SLOTS[slot]),
        h('h3', { class: 'text-xl font-black text-slate-900 mt-1.5' }, p.drug_name),
        h('p', { class: 'text-slate-600 font-bold text-sm mt-0.5' }, `Liều dùng: ${p.dosage}`)),
      h('div', { class: 'flex flex-col items-end gap-1.5 shrink-0' },
        statusBadge(),
        p.is_insulin && h('span', { class: 'text-[11px] font-bold bg-amber-100 text-amber-900 rounded-full px-2.5 py-0.5 border border-amber-200' }, '💉 Insulin'))),
    p.instruction && h('p', { class: 'text-xs text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100 mt-2 font-medium' },
      h('strong', { class: 'text-slate-700' }, 'Hướng dẫn: '), p.instruction),
    h('div', { class: 'flex items-center gap-2.5 mt-4' },
      btnTake,
      btnMiss));
}

async function markDose(p, slot, status, btn) {
  btn.disabled = true;
  const { error } = await sb.from('daily_logs').upsert(
    { patient_id: profile.id, prescription_id: p.id, date: vnToday(), time_slot: slot, status },
    { onConflict: 'prescription_id,date,time_slot' });
  if (error) { toast('Không lưu được, vui lòng thử lại', 'error'); btn.disabled = false; return; }
  toast(status === 'taken' ? '✓ Đã ghi nhận dùng thuốc' : 'Đã ghi nhận bỏ lỡ');
  loadToday();
}

/* ---------------------------------------------------------------- đường huyết */
function classifySugar(level, tod) {
  if (level < 3.9) return ['⚠️ Thấp (dưới 3.9 mmol/L): Có nguy cơ hạ đường huyết! Bổ sung ngay nước ngọt/kẹo và liên hệ bác sĩ nếu chóng mặt.', 'bg-rose-50 border-2 border-rose-200 text-rose-800'];
  const high = tod === 'fasting' ? 7.0 : 10.0;
  if (level > high) return [`⚠️ Cao hơn mục tiêu (${tod === 'fasting' ? '> 7.0' : '> 10.0'} mmol/L). Hãy theo dõi sát và uống nhiều nước.`, 'bg-amber-50 border-2 border-amber-200 text-amber-800'];
  return ['✓ Chỉ số an toàn: Nằm trong ngưỡng mục tiêu. Tiếp tục duy trì phong độ!', 'bg-emerald-50 border-2 border-emerald-200 text-emerald-800'];
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
  hint.textContent = text; hint.className = `text-xs font-bold p-3.5 rounded-2xl ${cls}`;
  show(hint, true);
  $('sugar-level').value = '';
  toast('Đã lưu chỉ số đường huyết');
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
  const ds = (label, tod, color) => ({
    label, data: avg(tod), borderColor: color, backgroundColor: color, tension: 0.35, spanGaps: true, pointRadius: 5, pointHoverRadius: 7,
  });
  if (chart) chart.destroy();
  chart = new Chart($('sugar-chart'), {
    type: 'line',
    data: { labels: days.map((d) => d.slice(8) + '/' + d.slice(5, 7)), datasets: [ds('Lúc đói', 'fasting', '#0d9488'), ds('Sau ăn', 'after_meal', '#f59e0b')] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { title: { display: true, text: 'mmol/L' }, suggestedMin: 3, suggestedMax: 12 } },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 14, font: { weight: 600 } } } },
    },
  });

  const ul = $('sugar-recent');
  ul.replaceChildren();
  if (!data.length) ul.append(h('li', { class: 'py-3 text-center text-slate-400 text-xs' }, 'Chưa có dữ liệu đo trong 7 ngày qua.'));
  for (const r of data.slice(0, 8)) {
    ul.append(h('li', { class: 'py-2.5 flex justify-between items-center' },
      h('span', { class: 'font-semibold text-slate-700' }, `${fmtDate(r.date)} · ${TOD[r.time_of_day]}`),
      h('span', { class: 'font-black text-teal-800 bg-teal-50 px-2.5 py-1 rounded-xl border border-teal-100 text-sm' }, `${r.level} mmol/L`)));
  }
}

/* ---------------------------------------------------------------- ADR */
function buildAdrForm() {
  const box = $('adr-symptoms');
  SYMPTOMS.forEach((s, i) => {
    box.append(h('label', { class: 'flex items-center gap-2.5 border-2 border-slate-200 rounded-2xl p-3 has-[:checked]:bg-teal-50 has-[:checked]:border-teal-600 cursor-pointer transition-all' },
      h('input', { type: 'checkbox', name: 'symptom', value: s, id: 'sym-' + i, class: 'w-5 h-5 rounded-lg accent-teal-600' }),
      h('span', { class: 'font-bold text-sm text-slate-800' }, s)));
  });
  const sev = $('adr-severity');
  Object.entries(SEVERITY).forEach(([v, label], i) => {
    sev.append(h('label', { class: 'text-center border-2 border-slate-200 rounded-2xl py-3 font-bold text-sm cursor-pointer transition-all has-[:checked]:bg-teal-700 has-[:checked]:text-white has-[:checked]:border-teal-700' },
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
  if (error) { ul.append(h('li', { class: 'py-2 text-rose-600 font-bold' }, 'Không tải được dữ liệu')); return; }
  if (!data.length) ul.append(h('li', { class: 'py-3 text-center text-slate-400 text-xs' }, 'Chưa có báo cáo tác dụng phụ nào.'));
  for (const r of data) {
    const sevCls = r.severity === 'nang' ? 'bg-rose-100 text-rose-800' : r.severity === 'vua' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800';
    ul.append(h('li', { class: 'py-3 border-b border-slate-100 last:border-0' },
      h('div', { class: 'flex justify-between items-center mb-1' },
        h('span', { class: 'font-bold text-slate-800 text-sm' }, fmtDate(r.date)),
        h('span', { class: `text-xs font-black rounded-full px-2.5 py-0.5 ${sevCls}` }, SEVERITY[r.severity])),
      h('p', { class: 'text-slate-700 text-sm font-medium' }, r.symptoms.join(', ')),
      h('p', { class: 'text-xs text-slate-400 mt-0.5' }, r.is_reviewed ? '✓ Bác sĩ đã xem xét' : '⏳ Đang chờ bác sĩ xem')));
  }
}

boot();
