/* Trang quản trị – bác sĩ / dược sĩ */
'use strict';

let sb, cfg, me, patients = [], currentPatient = null, pollTimer;
const $ = (id) => document.getElementById(id);

function showView(name) {
  for (const v of ['loading', 'login', 'app', 'approval']) show($('view-' + v), v === name);
}

/* ---------------------------------------------------------------- khởi động */
async function boot() {
  registerServiceWorker();
  try {
    if (typeof supabase === 'undefined') {
      throw new Error('Chưa tải được thư viện Supabase (CDN). Vui lòng kiểm tra kết nối mạng.');
    }
    cfg = await loadConfig();
    sb = supabase.createClient(cfg.supabase_url, cfg.supabase_key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
      },
    });

    buildSlotChoices();
    bindEvents();
    checkAndInitPushStatus();

    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    if (data && data.session) {
      await afterLogin();
    } else {
      showView('login');
    }
  } catch (err) {
    console.error('Lỗi khởi động admin:', err);
    renderLoadingError(err.message || 'Không thể khởi động trang quản trị', err.stack);
  }
}

async function afterLogin() {
  try {
    const { data: u, error: uErr } = await sb.auth.getUser();
    if (uErr) throw uErr;
    const user = u && u.user;
    if (!user) {
      await sb.auth.signOut();
      showView('login');
      return;
    }

    const id = user.id;
    let { data, error } = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
    if (!data) {
      // Có thể profile đang được tạo bởi database trigger khi tài khoản Google đăng nhập lần đầu
      await new Promise((r) => setTimeout(r, 800));
      const retry = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
      data = retry.data;
    }

    // Bắt buộc tài khoản phải có quyền Admin VÀ đã được phê duyệt
    const isApprovedAdmin = data && data.role === 'admin' && (data.is_approved === true || data.is_approved === undefined);
    if (!isApprovedAdmin) {
      showView('approval');
      renderApprovalView(user, data);
      return;
    }

    me = data;
    $('admin-name').textContent = me.full_name || 'Quản trị viên';
    showView('app');
    switchView('alerts');
    loadApprovalsBadge();
    clearInterval(pollTimer);
    pollTimer = setInterval(() => { if (!document.hidden && !$('v-alerts').classList.contains('hidden-view')) loadAlerts(true); }, 60000);
  } catch (err) {
    console.error('Lỗi sau khi đăng nhập:', err);
    showView('login');
    setError($('login-error'), 'Lỗi xác thực hồ sơ: ' + (err.message || 'Vui lòng đăng nhập lại'));
  }
}

function bindEvents() {
  if ($('google-login-btn')) {
    $('google-login-btn').addEventListener('click', onGoogleLogin);
  }
  if ($('approval-refresh-btn')) $('approval-refresh-btn').addEventListener('click', () => afterLogin());
  if ($('approval-logout-btn')) $('approval-logout-btn').addEventListener('click', async () => { await sb.auth.signOut(); showView('login'); });
  if ($('refresh-approvals')) $('refresh-approvals').addEventListener('click', () => loadApprovals());

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
  if ($('btn-push-toggle')) $('btn-push-toggle').addEventListener('click', onTogglePush);
}

/* ---------------------------------------------------------------- Web Push Notifications */
function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function checkAndInitPushStatus() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    const btn = $('btn-push-toggle');
    if (btn) btn.classList.add('hidden-view');
    return;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    updatePushBtnUI(!!sub);
  } catch (e) {
    console.error('Lỗi kiểm tra push status:', e);
  }
}

function updatePushBtnUI(isSubscribed) {
  const btn = $('btn-push-toggle');
  const txt = $('push-btn-text');
  if (!btn || !txt) return;
  if (isSubscribed) {
    txt.textContent = '✓ Đã nhận thông báo';
    btn.className = 'btn w-full text-xs px-3 py-2 bg-emerald-600 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm';
  } else {
    txt.textContent = 'Bật thông báo đẩy';
    btn.className = 'btn w-full text-xs px-3 py-2 bg-white/20 hover:bg-white/30 text-white font-bold rounded-xl flex items-center justify-center gap-1.5';
  }
}

async function onTogglePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    toast('Trình duyệt không hỗ trợ Web Push', 'error');
    return;
  }
  const reg = await navigator.serviceWorker.ready;
  const existingSub = await reg.pushManager.getSubscription();

  if (existingSub) {
    toast('Thiết bị này đã được kích hoạt nhận thông báo đẩy!');
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    toast('Bạn đã từ chối quyền thông báo trên trình duyệt', 'error');
    return;
  }

  if (!cfg || !cfg.vapid_public_key) {
    toast('Chưa cấu hình VAPID_PUBLIC_KEY trên máy chủ', 'error');
    return;
  }

  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(cfg.vapid_public_key),
    });

    const p256dhKey = sub.getKey('p256dh');
    const authKey = sub.getKey('auth');

    const p256dh = btoa(String.fromCharCode.apply(null, new Uint8Array(p256dhKey)));
    const auth = btoa(String.fromCharCode.apply(null, new Uint8Array(authKey)));

    await api('/api/admin/push-subscription', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: sub.endpoint,
        p256dh,
        auth,
      }),
    });

    updatePushBtnUI(true);
    toast('✓ Đã bật thông báo đẩy trực tiếp thành công cho thiết bị này!');
  } catch (err) {
    console.error('Lỗi đăng ký Web Push:', err);
    toast('Không thể đăng ký nhận thông báo: ' + err.message, 'error');
  }
}

function switchView(view) {
  document.querySelectorAll('.nav-btn').forEach((b) => {
    const on = b.dataset.view === view;
    b.setAttribute('aria-selected', String(on));
    b.classList.toggle('bg-white/20', on);
  });
  for (const v of ['alerts', 'patients', 'stats', 'reminders', 'approvals']) show($('v-' + v), v === view);
  if (view === 'alerts') loadAlerts();
  if (view === 'patients') loadPatients();
  if (view === 'stats') loadStats();
  if (view === 'reminders') loadReminderSettings();
  if (view === 'approvals') loadApprovals();
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

/* ---------------------------------------------------------------- đăng nhập Google */
function restoreGoogleBtnUI(btn) {
  if (!btn) return;
  btn.innerHTML = `
    <svg class="w-5 h-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
    </svg>
    <span class="text-base text-slate-700">Đăng nhập với Google</span>
  `;
}

function showGoogleProviderNotEnabledHelp() {
  const errBox = $('login-error');
  if (!errBox) return;
  errBox.innerHTML = `
    <div class="font-bold text-red-800 text-sm flex items-center gap-1.5">
      <span>⚠️</span>
      <span>Google Provider chưa được bật trên Supabase</span>
    </div>
    <p class="text-xs text-red-700 mt-1">
      Supabase trả về lỗi <code>Unsupported provider: provider is not enabled</code> vì dự án chưa kích hoạt Google Auth.
    </p>
    <div class="mt-2 pt-2 border-t border-red-200 text-xs text-slate-700 space-y-1">
      <p class="font-bold">Cách kích hoạt ngay trong 1 phút:</p>
      <ol class="list-decimal pl-4 space-y-1">
        <li>Mở <a href="https://supabase.com/dashboard/project/sbejexjtbdhaphrpbmra/auth/providers" target="_blank" class="text-teal-700 font-bold underline">Supabase Dashboard → Providers → Google</a>.</li>
        <li>Gạt bật <strong>Enable Sign in with Google</strong> sang <strong>ON</strong>.</li>
        <li>Điền <strong>Client ID</strong> và <strong>Client Secret</strong> từ Google Cloud Console rồi bấm <strong>Save</strong>.</li>
      </ol>
    </div>
  `;
  errBox.classList.remove('hidden-view');
}

async function onGoogleLogin() {
  const btn = $('google-login-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `
      <svg class="animate-spin w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
      </svg>
      <span>Đang kết nối Google…</span>
    `;
  }
  const errBox = $('login-error');
  if (errBox) {
    errBox.textContent = '';
    errBox.classList.add('hidden-view');
  }

  try {
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/admin.html',
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      if (btn) { btn.disabled = false; restoreGoogleBtnUI(btn); }
      if (error.message && error.message.includes('not enabled')) {
        showGoogleProviderNotEnabledHelp();
      } else {
        setError($('login-error'), 'Lỗi xác thực Google: ' + error.message);
      }
      return;
    }

    if (data && data.url) {
      // Kiểm tra trước phản hồi của Supabase để chặn văng ra trang raw JSON lỗi
      try {
        const testRes = await fetch(data.url, { method: 'GET' });
        if (!testRes.ok) {
          const body = await testRes.json().catch(() => ({}));
          if (body.msg && body.msg.includes('provider is not enabled')) {
            if (btn) { btn.disabled = false; restoreGoogleBtnUI(btn); }
            showGoogleProviderNotEnabledHelp();
            return;
          }
        }
      } catch (_) {
        // Đã kích hoạt và redirect sang accounts.google.com (bị CORS chặn ở fetch ngầm là bình thường)
      }
      window.location.href = data.url;
    }
  } catch (err) {
    if (btn) { btn.disabled = false; restoreGoogleBtnUI(btn); }
    setError($('login-error'), err.message || 'Lỗi kết nối');
  }
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
        h('button', { class: 'btn px-3 py-1.5 border border-slate-300 bg-white text-xs mr-1', onclick: () => resetPassword(p) }, 'Đặt lại MK'),
        h('button', { class: 'btn px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold', onclick: () => deletePatient(p) }, '🗑️ Xóa'))));
  }
}

async function deletePatient(p) {
  const confirmMsg = `⚠️ CẢNH BÁO XÓA BỆNH NHÂN:\n\n` +
    `Bạn có chắc chắn muốn xóa bệnh nhân "${p.full_name}" (Mã BN: ${p.patient_code})?\n\n` +
    `Hành động này sẽ XÓA VĨNH VIỄN toàn bộ tài khoản, đơn thuốc, nhật ký uống thuốc, biểu đồ đường huyết và báo cáo ADR của bệnh nhân này.`;
  if (!confirm(confirmMsg)) return;

  try {
    const res = await api(`/api/admin/patients/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
    toast(res.message || 'Đã xóa bệnh nhân thành công');
    loadPatients();
  } catch (err) {
    toast(err.message, 'error');
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
      h('div', { class: 'flex items-center gap-1.5 shrink-0' },
        r.is_active && h('button', { class: 'btn px-2.5 py-1.5 text-xs border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100', onclick: () => stopPrescription(r.id) }, 'Ngừng thuốc'),
        h('button', { class: 'btn px-2.5 py-1.5 text-xs border border-rose-200 text-rose-700 bg-rose-50 font-bold hover:bg-rose-100', onclick: () => deletePrescription(r) }, '🗑️ Xóa đơn'))));
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

async function deletePrescription(rx) {
  if (!confirm(`Bạn có chắc muốn XÓA VĨNH VIỄN đơn thuốc "${rx.drug_name}"?\nToàn bộ dữ liệu nhật ký dùng thuốc liên quan sẽ bị xóa theo.`)) return;
  try {
    const res = await api(`/api/admin/prescriptions/${encodeURIComponent(rx.id)}`, { method: 'DELETE' });
    toast(res.message || 'Đã xóa đơn thuốc thành công');
    loadPatientDetail();
  } catch (err) {
    toast(err.message, 'error');
  }
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

/* ---------------------------------------------------------------- Phê duyệt Admin */
function renderApprovalView(user, profile) {
  if ($('approval-user-email')) $('approval-user-email').textContent = user.email || 'Tài khoản Google';
  const box = $('approval-box');
  if (!box) return;
  const status = profile && profile.approval_status;

  if (status === 'pending') {
    box.innerHTML = `
      <div class="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 font-semibold mb-2">
        ⏳ Yêu cầu cấp quyền đang chờ phê duyệt
      </div>
      <p class="text-xs text-slate-500 leading-relaxed">
        Hệ thống đã gửi thông báo kèm email phê duyệt tới Quản trị viên chính.<br>
        Ngay khi được phê duyệt, bạn chỉ cần bấm nút <strong>"Kiểm tra lại"</strong> bên dưới để truy cập Dashboard.
      </p>
    `;
  } else if (status === 'rejected') {
    box.innerHTML = `
      <div class="p-3 bg-rose-50 rounded-xl border border-rose-200 text-rose-800 font-semibold mb-2">
        ⛔ Yêu cầu cấp quyền đã bị từ chối
      </div>
      <p class="text-xs text-slate-500 mb-3">
        Nếu bạn là Bác sĩ/Dược sĩ phụ trách, bạn có thể gửi lại yêu cầu xin phê duyệt.
      </p>
      <button id="btn-request-approval" type="button" class="btn hero-grad text-white px-4 py-2.5 text-sm w-full font-bold shadow">
        ✉️ Gửi lại yêu cầu xin phê duyệt
      </button>
      <p id="request-approval-msg" class="text-xs font-semibold text-teal-700 mt-2 hidden-view"></p>
    `;
    bindRequestApprovalBtn();
  } else {
    box.innerHTML = `
      <p class="text-slate-600 mb-3 leading-relaxed">
        Tài khoản Google này chưa có quyền Quản trị viên. Bạn có muốn gửi thông báo email xin Quản trị viên chính phê duyệt cấp quyền?
      </p>
      <button id="btn-request-approval" type="button" class="btn hero-grad text-white px-4 py-2.5 text-sm w-full font-bold shadow">
        ✉️ Gửi yêu cầu xin phê duyệt quyền Admin
      </button>
      <p id="request-approval-msg" class="text-xs font-semibold text-teal-700 mt-2 hidden-view"></p>
    `;
    bindRequestApprovalBtn();
  }
}

function bindRequestApprovalBtn() {
  const btn = $('btn-request-approval');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Đang gửi yêu cầu…';
    try {
      const res = await api('/api/admin/request-approval', { method: 'POST' });
      const msg = $('request-approval-msg');
      if (msg) {
        msg.textContent = '✅ ' + (res.message || 'Đã gửi yêu cầu thành công!');
        msg.classList.remove('hidden-view');
      }
      setTimeout(() => afterLogin(), 1500);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Thử lại';
      alert('Lỗi: ' + (err.message || 'Không thể gửi yêu cầu'));
    }
  });
}

async function loadApprovalsBadge() {
  try {
    const res = await api('/api/admin/pending-approvals');
    const count = (res.pending || []).length;
    const badge = $('approval-badge');
    if (badge) {
      if (count > 0) {
        badge.textContent = String(count);
        badge.classList.remove('hidden-view');
      } else {
        badge.classList.add('hidden-view');
      }
    }
  } catch (e) {
    console.error('Lỗi tải badge phê duyệt:', e);
  }
}

async function loadApprovals() {
  try {
    const res = await api('/api/admin/pending-approvals');
    const list = res.pending || [];
    const badge = $('approval-badge');
    if (badge) {
      if (list.length > 0) {
        badge.textContent = String(list.length);
        badge.classList.remove('hidden-view');
      } else {
        badge.classList.add('hidden-view');
      }
    }

    const ul = $('approvals-list');
    const empty = $('approvals-empty');
    if (!ul || !empty) return;

    if (list.length === 0) {
      empty.classList.remove('hidden-view');
      ul.innerHTML = '';
      return;
    }
    empty.classList.add('hidden-view');
    ul.innerHTML = list.map((u) => `
      <li class="py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="font-bold text-slate-800 text-sm">${escapeHtml(u.full_name || 'Chưa đặt tên')}</p>
          <p class="text-xs text-slate-500">${escapeHtml(u.email || 'Không có email')} · Yêu cầu: ${formatDate(u.approval_requested_at || u.created_at)}</p>
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn btn-sm bg-teal-600 hover:bg-teal-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs" onclick="handleApproveUser('${u.id}', 'approve')">
            ✔ Phê duyệt
          </button>
          <button type="button" class="btn btn-sm bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold px-3 py-1.5 rounded-lg text-xs border border-rose-200" onclick="handleApproveUser('${u.id}', 'reject')">
            ✖ Từ chối
          </button>
        </div>
      </li>
    `).join('');
  } catch (e) {
    toast('Lỗi tải danh sách phê duyệt: ' + e.message, 'error');
  }
}

window.handleApproveUser = async function (userId, action) {
  const promptMsg = action === 'approve'
    ? 'Phê duyệt tài khoản này làm Quản trị viên (Bác sĩ/Dược sĩ)?'
    : 'Từ chối yêu cầu cấp quyền này?';
  if (!confirm(promptMsg)) return;

  try {
    const res = await api('/api/admin/approve-user', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, action }),
    });
    toast(res.message || 'Thao tác thành công', 'success');
    await loadApprovals();
  } catch (err) {
    toast('Lỗi: ' + err.message, 'error');
  }
};

boot();
