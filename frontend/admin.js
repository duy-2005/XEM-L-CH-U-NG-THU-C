/* Trang quản trị – bác sĩ / dược sĩ */
'use strict';

let sb, me, patients = [], currentPatient = null, pollTimer;
const $ = (id) => document.getElementById(id);

function showView(name) {
  for (const v of ['loading', 'login', 'app']) show($('view-' + v), v === name);
}

/* ---------------------------------------------------------------- khởi động */
async function boot() {
  try {
    const cfg = await loadConfig();
    sb = supabase.createClient(cfg.supabase_url, cfg.supabase_key);
  } catch (e) { $('view-loading').textContent = e.message; return; }

  buildSlotChoices();
  bindEvents();
  const { data } = await sb.auth.getSession();
  if (data.session) await afterLogin(); else showView('login');
}

async function afterLogin() {
  const { data: u } = await sb.auth.getUser();
  const id = u && u.user ? u.user.id : '';
  const { data, error } = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
  if (error || !data || data.role !== 'admin') {
    await sb.auth.signOut();
    showView('login');
    setError($('login-error'), 'Tài khoản này không có quyền quản trị.');
    return;
  }
  me = data;
  $('admin-name').textContent = me.full_name || 'Quản trị viên';
  showView('app');
  switchView('alerts');
  clearInterval(pollTimer);
  pollTimer = setInterval(() => { if (!document.hidden && !$('v-alerts').classList.contains('hidden-view')) loadAlerts(true); }, 60000);
}

function bindEvents() {
  $('login-form').addEventListener('submit', onLogin);
  $('logout-btn').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
  document.querySelectorAll('.nav-btn').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));
  $('refresh-alerts').addEventListener('click', () => loadAlerts());
  $('patient-search').addEventListener('input', renderPatients);
  $('stats-days').addEventListener('change', loadStats);
  $('add-patient-btn').addEventListener('click', () => { $('add-patient-form').reset(); setError($('np-error'), ''); $('dlg-add-patient').showModal(); });
  $('np-cancel').addEventListener('click', () => $('dlg-add-patient').close());
  $('add-patient-form').addEventListener('submit', onAddPatient);
  $('pd-close').addEventListener('click', () => $('dlg-patient').close());
  $('presc-form').addEventListener('submit', onAddPrescription);
  $('refresh-reminders').addEventListener('click', () => loadReminderSettings());
  $('slot-times-form').addEventListener('submit', onSaveSlotTimes);
  $('test-email-form').addEventListener('submit', onTestEmail);
  $('trigger-reminders-btn').addEventListener('click', onTriggerReminders);
}

function switchView(view) {
  document.querySelectorAll('.nav-btn').forEach((b) => {
    const on = b.dataset.view === view;
    b.setAttribute('aria-selected', String(on));
    b.classList.toggle('bg-white/20', on);
  });
  for (const v of ['alerts', 'patients', 'stats', 'reminders']) show($('v-' + v), v === view);
  if (view === 'alerts') loadAlerts();
  if (view === 'patients') loadPatients();
  if (view === 'stats') loadStats();
  if (view === 'reminders') loadReminderSettings();
}

/* ---------------------------------------------------------------- API */
async function api(path, opts = {}) {
  const { data } = await sb.auth.getSession();
  if (!data.session) { location.reload(); throw new Error('Hết phiên đăng nhập'); }
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof body.detail === 'string' ? body.detail : 'Dữ liệu không hợp lệ hoặc lỗi máy chủ');
  }
  return body;
}

/* ---------------------------------------------------------------- đăng nhập */
async function onLogin(e) {
  e.preventDefault();
  setError($('login-error'), '');
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  if (!email || !password) { setError($('login-error'), 'Vui lòng nhập email và mật khẩu'); return; }
  const btn = $('login-submit'); btn.disabled = true; btn.textContent = 'Đang đăng nhập…';
  const { error } = await sb.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = 'Đăng nhập';
  if (error) { setError($('login-error'), 'Email hoặc mật khẩu không đúng'); return; }
  $('login-password').value = '';
  await afterLogin();
}

/* ---------------------------------------------------------------- cảnh báo */
function who(p) { return p ? `${p.full_name || '—'} (${p.patient_code || '—'})` : '—'; }

async function loadAlerts(silent) {
  let data;
  try { data = await api('/api/admin/alerts'); }
  catch (e) { if (!silent) toast(e.message, 'error'); return; }

  const adrUl = $('adr-list');
  adrUl.replaceChildren();
  const severe = data.adr.filter((a) => a.severity === 'nang').length;
  const badge = $('alert-count');
  badge.textContent = String(data.adr.length);
  show(badge, data.adr.length > 0);
  if (!data.adr.length) adrUl.append(h('li', { class: 'text-slate-500 text-sm' }, 'Không có báo cáo chưa xem. 👍'));
  for (const a of data.adr) {
    const isSevere = a.severity === 'nang';
    adrUl.append(h('li', { class: `rounded-xl p-3 border ${isSevere ? 'bg-red-50 border-red-300' : 'bg-slate-50 border-slate-200'}` },
      h('div', { class: 'flex justify-between items-start gap-2' },
        h('div', {},
          h('p', { class: 'font-bold' }, who(a.profiles)),
          h('p', { class: 'text-xs text-slate-500' }, fmtDate(a.date))),
        h('span', { class: `text-xs font-bold rounded-full px-2.5 py-1 ${isSevere ? 'bg-red-600 text-white' : a.severity === 'vua' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}` },
          (isSevere ? '🚨 ' : '') + SEVERITY[a.severity])),
      h('p', { class: 'text-sm mt-1 font-medium' }, a.symptoms.join(', ')),
      a.description && h('p', { class: 'text-sm text-slate-600 mt-1' }, a.description),
      h('button', { class: 'btn mt-2 px-3 py-1.5 text-sm bg-teal-600 text-white', onclick: (ev) => markReviewed(a.id, ev.currentTarget) }, 'Đánh dấu đã xem')));
  }
  if (severe && !silent) toast(`Có ${severe} báo cáo ADR NẶNG chưa xem`, 'error');

  const ul = $('missed-list');
  ul.replaceChildren();
  if (!data.missed.length) ul.append(h('li', { class: 'py-2 text-slate-500' }, 'Không có thuốc bỏ lỡ.'));
  for (const m of data.missed) {
    ul.append(h('li', { class: 'py-2 flex justify-between gap-2' },
      h('span', {}, h('strong', {}, who(m.profiles)), ' – ', m.prescriptions ? m.prescriptions.drug_name : '—'),
      h('span', { class: 'text-slate-500 shrink-0' }, `${fmtDate(m.date)} · ${SLOTS[m.time_slot] || ''}`)));
  }
}

async function markReviewed(id, btn) {
  btn.disabled = true;
  const { error } = await sb.from('adr_reports').update({ is_reviewed: true, reviewed_by: me.id }).eq('id', id);
  if (error) { toast('Không cập nhật được', 'error'); btn.disabled = false; return; }
  toast('Đã đánh dấu đã xem');
  loadAlerts(true);
}

/* ---------------------------------------------------------------- bệnh nhân */
async function loadPatients() {
  const { data, error } = await sb.from('profiles')
    .select('id,patient_code,full_name,phone,email,must_change_password,created_at')
    .eq('role', 'patient').order('patient_code').limit(2000);
  if (error) { toast('Không tải được danh sách bệnh nhân', 'error'); return; }
  patients = data;
  renderPatients();
}

function renderPatients() {
  const q = $('patient-search').value.trim().toLowerCase();
  const rows = $('patient-rows');
  rows.replaceChildren();
  const list = patients.filter((p) => !q || (p.patient_code || '').toLowerCase().includes(q) || (p.full_name || '').toLowerCase().includes(q));
  if (!list.length) rows.append(h('tr', {}, h('td', { class: 'p-4 text-slate-500', colspan: '5' }, 'Chưa có bệnh nhân.')));
  for (const p of list) {
    rows.append(h('tr', { class: 'hover:bg-teal-50/50' },
      h('td', { class: 'p-3 font-bold' }, p.patient_code),
      h('td', { class: 'p-3' }, p.full_name),
      h('td', { class: 'p-3' }, p.phone || '—'),
      h('td', { class: 'p-3' }, p.must_change_password
        ? h('span', { class: 'text-xs bg-amber-100 text-amber-800 rounded-full px-2 py-0.5 font-semibold' }, 'Chưa đổi mật khẩu')
        : h('span', { class: 'text-xs bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 font-semibold' }, 'Đang dùng')),
      h('td', { class: 'p-3 text-right whitespace-nowrap' },
        h('button', { class: 'btn px-3 py-1.5 bg-teal-600 text-white text-xs mr-1', onclick: () => openPatient(p) }, 'Chi tiết / Kê đơn'),
        h('button', { class: 'btn px-3 py-1.5 border border-slate-300 bg-white text-xs', onclick: () => resetPassword(p) }, 'Đặt lại MK'))));
  }
}

async function onAddPatient(e) {
  e.preventDefault();
  setError($('np-error'), '');
  const body = {
    patient_code: $('np-code').value.trim(),
    full_name: $('np-name').value.trim(),
    phone: $('np-phone').value.trim() || null,
    email: $('np-email').value.trim() || null,
  };
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(body.patient_code)) { setError($('np-error'), 'Mã BN gồm 3–32 ký tự chữ, số, - hoặc _'); return; }
  if (!body.full_name) { setError($('np-error'), 'Vui lòng nhập họ tên'); return; }
  const btn = $('np-submit'); btn.disabled = true;
  try {
    const r = await api('/api/admin/patients', { method: 'POST', body: JSON.stringify(body) });
    $('dlg-add-patient').close();
    toast(`Đã tạo ${r.patient_code}. Mật khẩu mặc định: ${r.default_password}`);
    loadPatients();
  } catch (err) { setError($('np-error'), err.message); }
  btn.disabled = false;
}

async function resetPassword(p) {
  if (!confirm(`Đặt lại mật khẩu của ${p.patient_code} về mặc định?\nBệnh nhân sẽ phải đổi mật khẩu khi đăng nhập.`)) return;
  try {
    const r = await api(`/api/admin/patients/${encodeURIComponent(p.id)}/reset-password`, { method: 'POST' });
    toast(`Đã đặt lại. Mật khẩu: ${r.default_password}`);
    loadPatients();
  } catch (err) { toast(err.message, 'error'); }
}

/* ---------------------------------------------------------------- chi tiết + kê đơn */
function buildSlotChoices() {
  const box = $('rx-slots');
  for (const s of SLOT_ORDER) {
    box.append(h('label', { class: 'flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-sm cursor-pointer has-[:checked]:bg-teal-600 has-[:checked]:text-white has-[:checked]:border-teal-600' },
      h('input', { type: 'checkbox', name: 'rx-slot', value: s, class: 'sr-only', checked: s === 'sang' }), SLOTS[s]));
  }
}

async function openPatient(p) {
  currentPatient = p;
  $('pd-title').textContent = `${p.full_name} (${p.patient_code})`;
  $('pd-sub').textContent = [p.phone, p.email].filter(Boolean).join(' · ') || 'Chưa có thông tin liên hệ';
  setError($('rx-error'), '');
  $('presc-form').reset();
  document.querySelector('input[name=rx-slot][value=sang]').checked = true;
  $('dlg-patient').showModal();
  await loadPatientDetail();
}

async function loadPatientDetail() {
  const p = currentPatient;
  const since = addDays(vnToday(), -6);
  const [presc, logs, sugar] = await Promise.all([
    sb.from('prescriptions').select('*').eq('patient_id', p.id).order('is_active', { ascending: false }).order('created_at', { ascending: false }),
    sb.from('daily_logs').select('status').eq('patient_id', p.id).gte('date', since),
    sb.from('blood_sugar_logs').select('date,level,time_of_day').eq('patient_id', p.id).order('created_at', { ascending: false }).limit(8),
  ]);

  const taken = (logs.data || []).filter((l) => l.status === 'taken').length;
  const missed = (logs.data || []).filter((l) => l.status === 'missed').length;
  const rate = taken + missed ? Math.round((taken / (taken + missed)) * 100) + '%' : '—';
  const stat = (label, val, cls) => h('div', { class: `rounded-xl p-3 ${cls}` }, h('p', { class: 'text-2xl font-extrabold' }, val), h('p', { class: 'text-xs font-semibold' }, label));
  $('pd-adherence').replaceChildren(
    stat('Đã dùng (7 ngày)', taken, 'bg-emerald-50 text-emerald-800'),
    stat('Bỏ lỡ (7 ngày)', missed, 'bg-red-50 text-red-700'),
    stat('Tuân thủ', rate, 'bg-teal-50 text-teal-800'));

  const ul = $('pd-presc');
  ul.replaceChildren();
  if (!(presc.data || []).length) ul.append(h('li', { class: 'text-slate-500' }, 'Chưa có đơn thuốc.'));
  for (const r of presc.data || []) {
    ul.append(h('li', { class: `flex justify-between items-center gap-2 rounded-xl border p-3 ${r.is_active ? 'border-slate-200' : 'opacity-50 border-slate-200'}` },
      h('div', {},
        h('p', { class: 'font-bold' }, r.drug_name, r.is_insulin ? ' 💉' : '', r.is_active ? '' : ' (đã ngừng)'),
        h('p', { class: 'text-slate-600' }, [r.dosage, r.frequency.map((s) => SLOTS[s]).join(', ')].filter(Boolean).join(' · ')),
        r.instruction && h('p', { class: 'text-xs text-slate-400' }, r.instruction)),
      r.is_active && h('button', { class: 'btn px-3 py-1.5 text-xs border border-red-200 text-red-600 bg-red-50 shrink-0', onclick: () => stopPrescription(r.id) }, 'Ngừng thuốc')));
  }

  const su = $('pd-sugar');
  su.replaceChildren();
  if (!(sugar.data || []).length) su.append(h('li', { class: 'py-2 text-slate-500' }, 'Chưa có dữ liệu.'));
  for (const r of sugar.data || []) {
    su.append(h('li', { class: 'py-1.5 flex justify-between' }, h('span', {}, `${fmtDate(r.date)} · ${TOD[r.time_of_day]}`), h('strong', {}, `${r.level} mmol/L`)));
  }
}

async function onAddPrescription(e) {
  e.preventDefault();
  setError($('rx-error'), '');
  const drug_name = $('rx-name').value.trim();
  const frequency = [...document.querySelectorAll('input[name=rx-slot]:checked')].map((i) => i.value);
  if (!drug_name) { setError($('rx-error'), 'Vui lòng nhập tên thuốc'); return; }
  if (!frequency.length) { setError($('rx-error'), 'Chọn ít nhất một khung giờ'); return; }
  const btn = $('rx-submit'); btn.disabled = true;
  const { error } = await sb.from('prescriptions').insert({
    patient_id: currentPatient.id,
    drug_name,
    dosage: $('rx-dose').value.trim(),
    instruction: $('rx-inst').value.trim(),
    is_insulin: $('rx-insulin').checked,
    frequency,
    created_by: me.id,
  });
  btn.disabled = false;
  if (error) { setError($('rx-error'), 'Không lưu được đơn thuốc'); return; }
  toast('Đã thêm đơn thuốc');
  $('presc-form').reset();
  document.querySelector('input[name=rx-slot][value=sang]').checked = true;
  loadPatientDetail();
}

async function stopPrescription(id) {
  if (!confirm('Ngừng đơn thuốc này? Bệnh nhân sẽ không còn thấy nhắc.')) return;
  const { error } = await sb.from('prescriptions').update({ is_active: false }).eq('id', id);
  if (error) { toast('Không cập nhật được', 'error'); return; }
  loadPatientDetail();
}

/* ---------------------------------------------------------------- thống kê */
async function loadStats() {
  let s;
  try { s = await api('/api/admin/stats/adr?days=' + encodeURIComponent($('stats-days').value)); }
  catch (e) { toast(e.message, 'error'); return; }

  const body = $('stats-body');
  const bars = (obj, colorFn) => {
    const entries = Object.entries(obj);
    const max = Math.max(1, ...entries.map(([, v]) => v));
    if (!entries.length) return [h('p', { class: 'text-slate-500 text-sm' }, 'Chưa có dữ liệu.')];
    return entries.map(([k, v]) => h('div', { class: 'mb-2' },
      h('div', { class: 'flex justify-between text-sm' }, h('span', {}, k), h('strong', {}, v)),
      h('div', { class: 'h-2.5 bg-slate-100 rounded-full overflow-hidden' },
        h('div', { class: `h-full rounded-full ${colorFn(k)}`, style: `width:${Math.round((v / max) * 100)}%` }))));
  };
  const sevColor = (k) => (k === 'nang' ? 'bg-red-500' : k === 'vua' ? 'bg-amber-400' : 'bg-emerald-500');
  const sevRaw = Object.entries(s.by_severity);

  body.replaceChildren(
    h('div', { class: 'card p-5' },
      h('p', { class: 'text-sm text-slate-500' }, `Tổng báo cáo (${s.days} ngày)`),
      h('p', { class: 'text-4xl font-extrabold text-teal-800' }, s.total),
      h('p', { class: 'text-sm mt-2' }, h('strong', { class: 'text-red-600' }, s.unreviewed), ' chưa được xem')),
    h('div', { class: 'card p-5' }, h('h2', { class: 'font-bold mb-3' }, 'Theo mức độ'),
      ...sevRaw.map(([k, v]) => bars({ [SEVERITY[k] || k]: v }, () => sevColor(k))[0]),
      !sevRaw.length && h('p', { class: 'text-slate-500 text-sm' }, 'Chưa có dữ liệu.')),
    h('div', { class: 'card p-5' }, h('h2', { class: 'font-bold mb-3' }, 'Theo triệu chứng'), ...bars(s.by_symptom, () => 'bg-teal-500')));
}

/* ---------------------------------------------------------------- nhắc thuốc & email */
async function loadReminderSettings() {
  let s;
  try { s = await api('/api/admin/reminder-settings'); }
  catch (e) { toast(e.message, 'error'); return; }

  const box = $('smtp-status-box');
  if (s.gmail_configured) {
    box.className = 'p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900';
    box.replaceChildren(
      h('p', { class: 'font-bold' }, '✓ Đã cấu hình Gmail SMTP'),
      h('p', { class: 'text-xs text-emerald-700 mt-1' }, `Tài khoản gửi: ${s.gmail_user}`),
      h('p', { class: 'text-xs text-emerald-600 mt-1' }, 'Hệ thống tự động chạy ngầm gửi email đúng khung giờ mỗi ngày.')
    );
  } else {
    box.className = 'p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900';
    box.replaceChildren(
      h('p', { class: 'font-bold' }, '⚠️ Chưa cấu hình Gmail SMTP trong file .env'),
      h('p', { class: 'text-xs text-amber-800 mt-1' }, 'Vui lòng điền GMAIL_USER và GMAIL_APP_PASSWORD trong file .env để kích hoạt tính năng gửi email.')
    );
  }

  const container = $('slot-times-inputs');
  container.replaceChildren();
  for (const [slot, timeStr] of Object.entries(s.slot_times || {})) {
    const slotLabel = SLOTS[slot] || slot;
    container.append(
      h('div', { class: 'flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl' },
        h('label', { for: 'input-time-' + slot, class: 'font-semibold text-slate-700 text-sm flex items-center gap-2' },
          h('span', { class: 'w-2 h-2 rounded-full bg-teal-500' }),
          slotLabel
        ),
        h('input', {
          type: 'time',
          id: 'input-time-' + slot,
          name: slot,
          value: timeStr,
          required: true,
          class: 'border border-slate-300 rounded-lg px-2.5 py-1 text-sm font-mono font-bold bg-white text-teal-800'
        })
      )
    );
  }
}

async function onSaveSlotTimes(e) {
  e.preventDefault();
  const inputs = document.querySelectorAll('#slot-times-inputs input[type=time]');
  const newSlots = {};
  inputs.forEach((inp) => {
    if (inp.name && inp.value) newSlots[inp.name] = inp.value;
  });
  const btn = $('save-slots-btn');
  btn.disabled = true; btn.textContent = 'Đang lưu…';
  try {
    const res = await api('/api/admin/reminder-settings', {
      method: 'PUT',
      body: JSON.stringify({ slot_times: newSlots }),
    });
    toast('Đã lưu khung giờ thành công!');
  } catch (err) {
    toast(err.message, 'error');
  }
  btn.disabled = false; btn.textContent = '💾 Lưu khung giờ';
}

async function onTestEmail(e) {
  e.preventDefault();
  const to_email = $('test-email-input').value.trim();
  const msg = $('test-email-msg');
  setError(msg, '');
  if (!to_email) { setError(msg, 'Vui lòng nhập email'); return; }

  const btn = $('test-email-btn');
  btn.disabled = true; btn.textContent = 'Đang gửi kiểm tra…';
  try {
    const res = await api('/api/admin/test-email', {
      method: 'POST',
      body: JSON.stringify({ to_email }),
    });
    msg.className = 'text-sm font-semibold text-emerald-700';
    msg.textContent = res.message || 'Đã gửi thành công!';
    show(msg, true);
    toast('Đã gửi email thử nghiệm thành công');
  } catch (err) {
    msg.className = 'text-sm font-semibold text-red-600';
    msg.textContent = err.message;
    show(msg, true);
    toast(err.message, 'error');
  }
  btn.disabled = false; btn.textContent = 'Gửi email thử nghiệm';
}

async function onTriggerReminders() {
  const slot = $('manual-slot-select').value || null;
  const resBox = $('trigger-result');
  const btn = $('trigger-reminders-btn');
  btn.disabled = true; btn.textContent = 'Đang gửi…';
  try {
    const res = await api('/api/admin/reminders/trigger', {
      method: 'POST',
      body: JSON.stringify({ slot, force: true }),
    });
    resBox.className = 'text-xs p-3 bg-teal-50 border border-teal-200 rounded-xl space-y-1 text-teal-900';
    resBox.replaceChildren(
      h('p', { class: 'font-bold' }, `Kết quả gửi: ${res.sent} email đã gửi thành công`),
      h('p', {}, `Đã bỏ qua: ${res.skipped_already_taken_or_sent} (do đã uống hoặc đã gửi hôm nay)`),
      (res.details || []).length > 0 && h('ul', { class: 'list-disc pl-4 mt-1' },
        res.details.map((d) => h('li', {}, `${d.patient} – ${d.drug} (${SLOTS[d.slot] || d.slot})`))
      )
    );
    show(resBox, true);
    toast(`Đã gửi ${res.sent} email nhắc`);
  } catch (err) {
    resBox.className = 'text-xs p-3 bg-red-50 border border-red-200 rounded-xl text-red-700';
    resBox.textContent = err.message;
    show(resBox, true);
    toast(err.message, 'error');
  }
  btn.disabled = false; btn.textContent = 'Gửi nhắc ngay';
}

boot();
