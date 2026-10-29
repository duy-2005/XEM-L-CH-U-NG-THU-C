/* Trang quản trị – bác sĩ / dược sĩ */
'use strict';

let sb, cfg, me, patients = [], currentPatient = null, pollTimer;
const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(isoStr) {
  if (!isoStr) return 'Mới đây';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(isoStr);
    return d.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch (e) {
    return String(isoStr);
  }
}

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

    // 1. Kiểm tra xem Supabase OAuth có trả về lỗi trên URL hash/query không
    const hash = window.location.hash.replace(/^#/, '');
    const hashParams = new URLSearchParams(hash);
    const queryParams = new URLSearchParams(window.location.search);
    const authError = hashParams.get('error') || queryParams.get('error');
    const authCode = hashParams.get('error_code') || queryParams.get('error_code');
    const authDesc = hashParams.get('error_description') || queryParams.get('error_description');

    if (authError || authDesc) {
      showView('login');
      let msg = decodeURIComponent((authDesc || authError).replace(/\+/g, ' '));
      if (
        msg.toLowerCase().includes('signups not allowed') ||
        authCode === 'signup_disabled' ||
        (authDesc && authDesc.toLowerCase().includes('signup'))
      ) {
        msg = '⚠️ Tài khoản Google này chưa có trong hệ thống và Supabase đang TẮT đăng ký mới (Signups not allowed). Quản trị viên cần vào Supabase Dashboard → Authentication → bật "Allow new users to sign up".';
      }
      setError($('login-error'), msg);
      if (window.history && window.history.replaceState) {
        history.replaceState(null, '', window.location.pathname);
      }
      return;
    }

    // 2. Kiểm tra phiên đăng nhập
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
    const hash = (window.location.hash || '').replace(/^#/, '');
    const validViews = ['alerts', 'patients', 'stats', 'reminders', 'approvals'];
    const targetView = validViews.includes(hash) ? hash : 'alerts';
    switchView(targetView);
    loadApprovalsBadge();
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (!document.hidden && !$('v-alerts').classList.contains('hidden-view')) loadAlerts(true);
      loadApprovalsBadge();
    }, 60000);
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

  async function handleAdminLogout() {
    try {
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await api('/api/push-subscription/unsubscribe', {
            method: 'POST',
            body: JSON.stringify({ endpoint: sub.endpoint }),
          }).catch(() => {});
          await sub.unsubscribe().catch(() => {});
        }
      }
    } catch (e) {
      console.warn('Lỗi hủy push khi admin đăng xuất:', e);
    }
    await sb.auth.signOut();
    location.reload();
  }

  if ($('logout-btn')) $('logout-btn').addEventListener('click', handleAdminLogout);
  if ($('logout-btn-desktop')) $('logout-btn-desktop').addEventListener('click', handleAdminLogout);
  window.addEventListener('hashchange', () => {
    const h = (window.location.hash || '').replace(/^#/, '');
    const validViews = ['alerts', 'patients', 'stats', 'reminders', 'approvals'];
    if (validViews.includes(h)) switchView(h);
  });
  document.querySelectorAll('.nav-btn').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));
  $('refresh-alerts').addEventListener('click', () => loadAlerts());
  $('patient-search').addEventListener('input', renderPatients);
  $('stats-days').addEventListener('change', loadStats);
  $('add-patient-btn').addEventListener('click', () => { $('add-patient-form').reset(); setError($('np-error'), ''); $('dlg-add-patient').showModal(); });
  $('np-cancel').addEventListener('click', () => $('dlg-add-patient').close());
  $('add-patient-form').addEventListener('submit', onAddPatient);
  $('pd-close').addEventListener('click', () => $('dlg-patient').close());
  if ($('pd-btn-all-missed')) $('pd-btn-all-missed').addEventListener('click', () => { if (currentPatient) openMissedHistory(currentPatient); });
  if ($('mh-close')) $('mh-close').addEventListener('click', () => $('dlg-missed-history').close());
  if ($('mh-days')) $('mh-days').addEventListener('change', () => { if (currentMissedPatient) openMissedHistory(currentMissedPatient, $('mh-days').value); });
  if ($('missed-search')) $('missed-search').addEventListener('input', renderMissedList);
  $('presc-form').addEventListener('submit', onAddPrescription);
  $('refresh-reminders').addEventListener('click', () => loadReminderSettings());
  $('slot-times-form').addEventListener('submit', onSaveSlotTimes);
  if ($('btn-push-toggle')) $('btn-push-toggle').addEventListener('click', onTogglePush);
  if ($('btn-test-push-admin')) $('btn-test-push-admin').addEventListener('click', onTestPushAdmin);
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
    if (sub) {
      await autoSyncAdminPush(sub);
    }
  } catch (e) {
    console.error('Lỗi kiểm tra push status:', e);
  }
}

async function autoSyncAdminPush(sub) {
  try {
    const p256dhKey = sub.getKey('p256dh');
    const authKey = sub.getKey('auth');
    if (!p256dhKey || !authKey) return;
    const p256dh = btoa(String.fromCharCode.apply(null, new Uint8Array(p256dhKey)));
    const auth = btoa(String.fromCharCode.apply(null, new Uint8Array(authKey)));
    await api('/api/admin/push-subscription', {
      method: 'POST',
      body: JSON.stringify({ endpoint: sub.endpoint, p256dh, auth }),
    }).catch(() => {});
  } catch (err) {
    console.warn('Lỗi tự động đồng bộ push admin:', err);
  }
}

function updatePushBtnUI(isSubscribed) {
  const btn = $('btn-push-toggle');
  const txt = $('push-btn-text');
  if (!btn || !txt) return;
  btn.disabled = false;
  if (isSubscribed) {
    txt.textContent = '✓ Nhận cảnh báo (Bấm để tắt)';
    btn.className = 'btn w-full text-xs px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition';
  } else {
    txt.textContent = 'Bật thông báo đẩy';
    btn.className = 'btn w-full text-xs px-3 py-2 bg-white/20 hover:bg-white/30 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition';
  }
}

async function onTogglePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    toast('Trình duyệt không hỗ trợ Web Push', 'error');
    return;
  }
  const reg = await navigator.serviceWorker.ready;
  const existingSub = await reg.pushManager.getSubscription();
  const btn = $('btn-push-toggle');

  // NẾU ĐANG BẬT -> BẤM ĐỂ TẮT (UNSUBSCRIBE)
  if (existingSub) {
    if (btn) btn.disabled = true;
    try {
      await api('/api/push-subscription/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint: existingSub.endpoint }),
      });
      await existingSub.unsubscribe();
      updatePushBtnUI(false);
      toast('✓ Đã tắt nhận thông báo đẩy trên thiết bị này');
    } catch (err) {
      console.error('Lỗi tắt Web Push:', err);
      toast('Không thể tắt thông báo: ' + err.message, 'error');
      if (btn) btn.disabled = false;
    }
    return;
  }

  // NẾU CHƯA BẬT -> TIẾN HÀNH BẬT (SUBSCRIBE)
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    toast('Bạn đã từ chối quyền thông báo trên trình duyệt', 'error');
    return;
  }

  if (!cfg || !cfg.vapid_public_key) {
    toast('Chưa cấu hình VAPID_PUBLIC_KEY trên máy chủ', 'error');
    return;
  }

  if (btn) btn.disabled = true;

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
    if (btn) btn.disabled = false;
    console.error('Lỗi đăng ký Web Push:', err);
    toast('Không thể đăng ký nhận thông báo: ' + err.message, 'error');
  }
}

async function onTestPushAdmin() {
  const btn = $('btn-test-push-admin');
  if (btn) { btn.disabled = true; btn.textContent = 'Đang gửi test…'; }
  try {
    const res = await api('/api/test-push', { method: 'POST' });
    toast(res.message || '✓ Đã gửi thông báo thử nghiệm tới máy của bạn!', 'success');
  } catch (err) {
    toast('Lỗi thử thông báo: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>🧪</span> <span>Thử thông báo về máy</span>';
    }
  }
}

function switchView(view) {
  document.querySelectorAll('.nav-btn').forEach((b) => {
    const on = b.dataset.view === view;
    b.setAttribute('aria-selected', String(on));
    b.classList.toggle('bg-white/20', on);
  });
  for (const v of ['alerts', 'patients', 'stats', 'reminders', 'approvals']) show($('v-' + v), v === view);
  if (window.location.hash !== '#' + view) {
    history.replaceState(null, '', '#' + view);
  }
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
      },
    });

    if (error) {
      if (btn) { btn.disabled = false; restoreGoogleBtnUI(btn); }
      if (error.message && error.message.includes('not enabled')) {
        showGoogleProviderNotEnabledHelp();
      } else {
        setError($('login-error'), 'Lỗi xác thực Google: ' + error.message);
      }
    }
  } catch (err) {
    if (btn) { btn.disabled = false; restoreGoogleBtnUI(btn); }
    setError($('login-error'), err.message || 'Lỗi kết nối');
  }
}

/* ---------------------------------------------------------------- cảnh báo */
function who(p) { return p ? `${p.full_name || '—'} (${p.patient_code || '—'})` : '—'; }

let alertsMissedData = [];

function renderMissedList() {
  const q = ($('missed-search')?.value || '').trim().toLowerCase();
  const badge = $('missed-count-badge');
  const filtered = alertsMissedData.filter((m) => {
    if (!q) return true;
    const name = (m.profiles?.full_name || '').toLowerCase();
    const code = (m.profiles?.patient_code || '').toLowerCase();
    const drug = (m.prescriptions?.drug_name || '').toLowerCase();
    return name.includes(q) || code.includes(q) || drug.includes(q);
  });
  if (badge) badge.textContent = `${filtered.length} cữ bỏ lỡ`;
  const ul = $('missed-list');
  ul.replaceChildren();
  if (!filtered.length) {
    ul.append(h('li', { class: 'py-6 text-center text-slate-400 text-xs' }, q ? 'Không tìm thấy cữ thuốc bỏ lỡ phù hợp.' : 'Không có thuốc bỏ lỡ. 👍'));
    return;
  }
  for (const m of filtered) {
    ul.append(h('li', { class: 'py-2.5 border-b border-slate-100 last:border-0' },
      h('div', { class: 'flex justify-between items-start gap-2' },
        h('button', {
          type: 'button',
          title: 'Bấm để mở lịch sử bỏ lỡ của bệnh nhân này',
          class: 'text-left text-teal-800 hover:text-rose-700 font-semibold hover:underline cursor-pointer transition',
          onclick: () => m.profiles && openMissedHistory(m.profiles)
        }, h('strong', { class: 'text-slate-800 font-bold' }, who(m.profiles)), ' – ', m.prescriptions ? m.prescriptions.drug_name : '—'),
        h('span', { class: 'text-slate-500 shrink-0 text-xs font-mono font-medium' }, `${fmtDate(m.date)} · ${SLOTS[m.time_slot] || ''}`)),
      m.notes && h('p', { class: 'text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-1.5 mt-1 font-medium' },
        h('strong', {}, '💬 Lý do: '), m.notes)));
  }
}

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

  alertsMissedData = data.missed || [];
  renderMissedList();
}

async function markReviewed(id, btn) {
  btn.disabled = true;
  const { error } = await sb.from('adr_reports').update({ is_reviewed: true, reviewed_by: me.id }).eq('id', id);
  if (error) { toast('Không cập nhật được', 'error'); btn.disabled = false; return; }
  toast('Đã đánh dấu đã xem');
  loadAlerts(true);
}

/* ---------------------------------------------------------------- bệnh nhân */
let currentMissedPatient = null;

async function openMissedHistory(patient, days) {
  if (!patient) return;
  // Tìm profile đầy đủ nếu có
  const pid = patient.id || patient.patient_id;
  const fullPatient = (patients || []).find((p) => p.id === pid) || patient;
  currentMissedPatient = fullPatient;

  const dlg = $('dlg-missed-history');
  if (!dlg) return;

  const daysSelect = $('mh-days');
  const d = days || (daysSelect ? daysSelect.value : '30');
  if (daysSelect && days) daysSelect.value = String(days);

  $('mh-title').textContent = `${fullPatient.full_name || 'Bệnh nhân'} (${fullPatient.patient_code || '—'})`;
  $('mh-sub').textContent = [fullPatient.phone, fullPatient.email].filter(Boolean).join(' · ') || 'Không có số điện thoại / email';

  const badge = $('mh-summary-badge');
  badge.textContent = 'Đang tải…';
  const list = $('mh-list');
  list.replaceChildren(h('p', { class: 'text-center py-8 text-slate-400 text-xs' }, 'Đang tải dữ liệu lịch sử bỏ lỡ thuốc…'));

  dlg.showModal();

  try {
    const res = await api(`/api/admin/patients/${encodeURIComponent(pid)}/missed-history?days=${d}`);
    const missed = res.missed || [];
    badge.textContent = `${missed.length} cữ thuốc bỏ lỡ`;
    badge.className = missed.length > 0
      ? 'text-xs font-bold text-rose-700 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200'
      : 'text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200';

    if (!missed.length) {
      list.replaceChildren(
        h('div', { class: 'text-center py-12 px-4 space-y-2' },
          h('div', { class: 'w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto text-xl font-bold border border-emerald-200' }, '✓'),
          h('p', { class: 'text-sm font-bold text-slate-800' }, 'Không có cữ thuốc nào bị bỏ lỡ!'),
          h('p', { class: 'text-xs text-slate-500' }, `Bệnh nhân tuân thủ phác đồ điều trị rất tốt trong ${d} ngày qua.`)
        )
      );
      return;
    }

    // Nhóm theo ngày (date)
    const grouped = {};
    for (const m of missed) {
      const dateKey = m.date || 'Không rõ ngày';
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(m);
    }

    list.replaceChildren();
    for (const [dateStr, items] of Object.entries(grouped)) {
      list.append(
        h('div', { class: 'card p-4 border border-slate-200 space-y-2.5 bg-white shadow-2xs' },
          h('div', { class: 'flex items-center justify-between border-b border-slate-100 pb-2' },
            h('div', { class: 'flex items-center gap-2' },
              h('span', { class: 'w-2 h-2 rounded-full bg-rose-500' }),
              h('h3', { class: 'font-extrabold text-sm text-slate-800' }, fmtDate(dateStr))
            ),
            h('span', { class: 'text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200' },
              `${items.length} cữ bỏ lỡ`
            )
          ),
          h('div', { class: 'space-y-2' },
            items.map((it) =>
              h('div', { class: 'p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5' },
                h('div', { class: 'flex items-center justify-between flex-wrap gap-2' },
                  h('div', { class: 'flex items-center gap-2' },
                    h('span', { class: 'text-xs font-bold px-2 py-0.5 rounded-lg bg-teal-100 text-teal-800 font-mono' },
                      SLOTS[it.time_slot] || it.time_slot
                    ),
                    h('span', { class: 'text-sm font-bold text-slate-800' },
                      it.prescriptions?.drug_name || 'Thuốc'
                    ),
                    it.prescriptions?.dosage && h('span', { class: 'text-xs text-slate-500' }, `(${it.prescriptions.dosage})`)
                  ),
                  it.created_at && h('span', { class: 'text-[11px] text-slate-400 font-mono' },
                    new Date(it.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                  )
                ),
                it.notes && h('p', { class: 'text-xs text-rose-700 bg-rose-50/90 border border-rose-100 rounded-lg px-2.5 py-1.5 font-medium' },
                  h('strong', {}, '💬 Lý do: '), it.notes
                )
              )
            )
          )
        )
      );
    }
  } catch (err) {
    badge.textContent = 'Lỗi';
    list.replaceChildren(h('p', { class: 'text-center py-6 text-red-600 text-xs font-semibold' }, err.message || 'Lỗi khi tải lịch sử'));
  }
}

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
      h('td', { class: 'p-3 font-semibold' }, p.full_name),
      h('td', { class: 'p-3' }, p.phone || '—'),
      h('td', { class: 'p-3' }, p.must_change_password
        ? h('span', { class: 'text-xs bg-amber-100 text-amber-800 rounded-full px-2 py-0.5 font-semibold' }, 'Chưa đổi mật khẩu')
        : h('span', { class: 'text-xs bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 font-semibold' }, 'Đang dùng')),
      h('td', { class: 'p-3 text-right whitespace-nowrap' },
        h('button', { class: 'btn px-3 py-1.5 bg-teal-600 text-white text-xs mr-1 rounded-xl shadow-2xs font-semibold', onclick: () => openPatient(p) }, 'Chi tiết / Kê đơn'),
        h('button', { class: 'btn px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold mr-1 rounded-xl shadow-2xs transition', onclick: () => openMissedHistory(p) }, '📋 Lịch sử bỏ lỡ'),
        h('button', { class: 'btn px-2.5 py-1.5 border border-slate-300 bg-white text-xs mr-1 rounded-xl', onclick: () => resetPassword(p) }, 'Đặt lại MK'),
        h('button', { class: 'btn px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl', onclick: () => deletePatient(p) }, '🗑️ Xóa'))));
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
    toast(`Đã tạo ${r.patient_code}. Mật khẩu khởi tạo: ${r.default_password}`);
    loadPatients();
  } catch (err) { setError($('np-error'), err.message); }
  btn.disabled = false;
}

async function resetPassword(p) {
  if (!confirm(`Đặt lại mật khẩu của ${p.patient_code} sang mật khẩu khởi tạo ngẫu nhiên mới?\nBệnh nhân sẽ phải đổi mật khẩu khi đăng nhập.`)) return;
  try {
    const r = await api(`/api/admin/patients/${encodeURIComponent(p.id)}/reset-password`, { method: 'POST' });
    toast(`Đã đặt lại thành công. Mật khẩu khởi tạo mới: ${r.default_password}`);
    loadPatients();
  } catch (err) { toast(err.message, 'error'); }
}

/* ---------------------------------------------------------------- chi tiết + kê đơn */
/* ---------------------------------------------------------------- chi tiết + kê đơn */
let selectedRxTimes = ['07:00'];

function mapTimeToSlot(timeStr) {
  const [h, m] = (timeStr || '07:00').split(':').map(Number);
  const total = h * 60 + m;
  if (total < 11 * 60) return 'sang';
  if (total < 14 * 60) return 'trua';
  if (total < 17 * 60 + 30) return 'chieu';
  if (total < 21 * 60) return 'toi';
  return 'truoc_ngu';
}

function getTimeSlotName(timeStr) {
  const slot = mapTimeToSlot(timeStr);
  return SLOTS[slot] || 'Cữ uống';
}

function renderRxTimeTags() {
  const container = $('rx-time-tags');
  if (!container) return;
  container.replaceChildren();
  selectedRxTimes.sort();

  if (!selectedRxTimes.length) {
    container.append(h('span', { class: 'text-xs text-slate-400 italic' }, 'Chưa chọn mốc giờ nào (chọn giờ bên dưới và bấm "Thêm")'));
    return;
  }

  for (const t of selectedRxTimes) {
    const slotName = getTimeSlotName(t);
    container.append(
      h('span', { class: 'inline-flex items-center gap-1.5 px-2.5 py-1 bg-teal-50 text-teal-800 border border-teal-200 text-xs font-bold rounded-lg transition-all' },
        `⏰ ${t} (${slotName})`,
        h('button', {
          type: 'button',
          class: 'hover:text-rose-600 text-teal-500 font-bold ml-1 text-sm leading-none cursor-pointer',
          title: `Xóa mốc ${t}`,
          onclick: (e) => { e.preventDefault(); removeRxTime(t); }
        }, '✕')
      )
    );
  }
}

function addRxTime(timeStr) {
  if (!timeStr || !timeStr.includes(':')) {
    toast('Vui lòng chọn mốc giờ hợp lệ (HH:MM)', 'error');
    return;
  }
  const clean = timeStr.trim();
  if (selectedRxTimes.includes(clean)) {
    toast(`Mốc giờ ${clean} đã có trong danh sách`, 'warning');
    return;
  }
  if (selectedRxTimes.length >= 5) {
    toast('Tối đa 5 mốc giờ cho mỗi loại thuốc', 'warning');
    return;
  }
  selectedRxTimes.push(clean);
  renderRxTimeTags();
}

function removeRxTime(timeStr) {
  selectedRxTimes = selectedRxTimes.filter((t) => t !== timeStr);
  renderRxTimeTags();
}

function buildSlotChoices() {
  renderRxTimeTags();

  const btnAdd = $('rx-btn-add-time');
  const inputTime = $('rx-custom-time');
  if (btnAdd && inputTime) {
    btnAdd.addEventListener('click', (e) => {
      e.preventDefault();
      addRxTime(inputTime.value);
    });
  }

  document.querySelectorAll('.rx-quick-time').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const t = btn.dataset.time;
      if (t) addRxTime(t);
    });
  });
}

async function openPatient(p) {
  currentPatient = p;
  $('pd-title').textContent = `${p.full_name} (${p.patient_code})`;
  $('pd-sub').textContent = [p.phone, p.email].filter(Boolean).join(' · ') || 'Chưa có thông tin liên hệ';
  setError($('rx-error'), '');
  $('presc-form').reset();
  selectedRxTimes = ['07:00'];
  renderRxTimeTags();
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
    const parsed = parsePrescriptionTimes(r);
    const timesList = Object.values(parsed.times);
    const timeDisplay = timesList.length
      ? timesList.map((t) => `⏰ ${t}`).join(', ')
      : r.frequency.map((s) => SLOTS[s]).join(', ');
    const displayInstruction = parsed.cleanInstruction;

    const allowMakeUp = canPrescriptionMakeUp(r);

    ul.append(h('li', { class: `flex justify-between items-center gap-2 rounded-xl border p-3 ${r.is_active ? 'border-slate-200' : 'opacity-50 border-slate-200'}` },
      h('div', {},
        h('p', { class: 'font-bold text-slate-800' }, r.drug_name, r.is_active ? '' : ' (đã ngừng)'),
        h('p', { class: 'text-slate-600 font-medium text-xs mt-0.5' }, [r.dosage, timeDisplay].filter(Boolean).join(' · ')),
        displayInstruction && h('p', { class: 'text-xs text-slate-500 mt-0.5' }, displayInstruction),
        h('div', { class: 'flex items-center gap-1.5 mt-1.5 flex-wrap' },
          r.is_insulin && h('span', { class: 'text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-full' }, 'Insulin'),
          allowMakeUp
            ? h('span', { class: 'text-[11px] font-semibold bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded-full' }, 'Cho phép dùng bù')
            : h('span', { class: 'text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200 px-2 py-0.5 rounded-full' }, 'Không dùng bù nếu trễ > 1h')
        )),
      h('div', { class: 'flex items-center gap-1.5 shrink-0' },
        r.is_active && h('button', { class: 'btn px-2.5 py-1.5 text-xs border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100', onclick: () => stopPrescription(r.id) }, 'Ngừng thuốc'),
        h('button', { class: 'btn px-2.5 py-1.5 text-xs border border-rose-200 text-rose-700 bg-rose-50 font-bold hover:bg-rose-100', onclick: () => deletePrescription(r) }, 'Xóa đơn'))));
  }

  const su = $('pd-sugar');
  su.replaceChildren();
  if (!(sugar.data || []).length) su.append(h('li', { class: 'py-2 text-slate-500' }, 'Chưa có dữ liệu.'));
  for (const r of sugar.data || []) {
    su.append(h('li', { class: 'py-1.5 flex justify-between' }, h('span', {}, `${fmtDate(r.date)} · ${TOD[r.time_of_day]}`), h('strong', {}, `${r.level} mmol/L`)));
  }

  // Nạp 5 cữ thuốc bỏ lỡ gần đây
  const missedUl = $('pd-missed-list');
  if (missedUl) {
    missedUl.replaceChildren(h('li', { class: 'py-2 text-slate-400 text-center' }, 'Đang tải lịch sử bỏ lỡ…'));
    try {
      const mh = await api(`/api/admin/patients/${encodeURIComponent(p.id)}/missed-history?days=30`);
      const recentMissed = (mh.missed || []).slice(0, 5);
      missedUl.replaceChildren();
      if (!recentMissed.length) {
        missedUl.append(h('li', { class: 'py-2 text-center text-emerald-700 font-medium' }, '🎉 Bệnh nhân không bỏ lỡ cữ thuốc nào gần đây.'));
      } else {
        for (const m of recentMissed) {
          missedUl.append(h('li', { class: 'py-2 flex justify-between items-start gap-2 border-b border-rose-100/50 last:border-0' },
            h('div', {},
              h('span', { class: 'font-bold text-slate-800' }, m.prescriptions?.drug_name || 'Thuốc', m.prescriptions?.dosage ? ` (${m.prescriptions.dosage})` : ''),
              m.notes && h('p', { class: 'text-[11px] text-rose-600 font-medium mt-0.5' }, m.notes)
            ),
            h('span', { class: 'shrink-0 font-mono text-[11px] text-slate-600 bg-white px-2 py-0.5 rounded-lg border border-rose-200' },
              `${fmtDate(m.date)} · ${SLOTS[m.time_slot] || m.time_slot}`)
          ));
        }
      }
    } catch {
      missedUl.replaceChildren(h('li', { class: 'py-2 text-slate-400 text-center' }, 'Không thể tải lịch sử bỏ lỡ.'));
    }
  }
}

async function onAddPrescription(e) {
  e.preventDefault();
  setError($('rx-error'), '');
  const drug_name = $('rx-name').value.trim();
  if (!drug_name) { setError($('rx-error'), 'Vui lòng nhập tên thuốc'); return; }
  if (!selectedRxTimes.length) { setError($('rx-error'), 'Vui lòng thêm ít nhất một mốc giờ uống thuốc'); return; }

  // Sắp xếp các mốc giờ theo thứ tự tăng dần
  selectedRxTimes.sort();

  // Ánh xạ mốc giờ vào các slot hợp lệ của Supabase (sang, trua, chieu, toi, truoc_ngu)
  const assignedSlots = [];
  const availableSlots = [...SLOT_ORDER];

  for (const t of selectedRxTimes) {
    const idealSlot = mapTimeToSlot(t);
    if (availableSlots.includes(idealSlot)) {
      assignedSlots.push(idealSlot);
      availableSlots.splice(availableSlots.indexOf(idealSlot), 1);
    } else {
      const fallbackSlot = availableSlots.shift();
      if (fallbackSlot) assignedSlots.push(fallbackSlot);
    }
  }

  assignedSlots.sort((a, b) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b));

  const rawInst = $('rx-inst').value.trim();
  const allowMakeUp = $('rx-allow-makeup') ? $('rx-allow-makeup').checked : true;
  const makeupTag = allowMakeUp ? '' : '[NO_MAKEUP] ';
  const encodedInstruction = `[TIMES:${selectedRxTimes.join(',')}] ${makeupTag}${rawInst}`.trim();

  const btn = $('rx-submit'); btn.disabled = true;
  const rxPayload = {
    patient_id: currentPatient.id,
    drug_name,
    dosage: $('rx-dose').value.trim(),
    instruction: encodedInstruction,
    is_insulin: $('rx-insulin').checked,
    allow_makeup: allowMakeUp,
    frequency: assignedSlots,
    created_by: me.id,
  };
  let { error } = await sb.from('prescriptions').insert(rxPayload);
  // Tương thích ngược: Nếu database chưa chạy migration cột allow_makeup, tự động lưu dự phòng
  if (error && (error.message || '').includes('allow_makeup')) {
    delete rxPayload.allow_makeup;
    const retry = await sb.from('prescriptions').insert(rxPayload);
    error = retry.error;
  }
  btn.disabled = false;
  if (error) { setError($('rx-error'), 'Không lưu được đơn thuốc: ' + (error.message || '')); return; }
  toast('Đã thêm đơn thuốc');
  $('presc-form').reset();
  if ($('rx-allow-makeup')) $('rx-allow-makeup').checked = true;
  selectedRxTimes = ['07:00'];
  renderRxTimeTags();
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

/* ---------------------------------------------------------------- thống kê & biểu đồ */
let chartComplianceRatio = null;
let chartMissedTimeline = null;
let chartTopMissed = null;
let chartAdrSeverity = null;
let chartAdrSymptoms = null;

function destroyCharts() {
  if (chartComplianceRatio) { chartComplianceRatio.destroy(); chartComplianceRatio = null; }
  if (chartMissedTimeline) { chartMissedTimeline.destroy(); chartMissedTimeline = null; }
  if (chartTopMissed) { chartTopMissed.destroy(); chartTopMissed = null; }
  if (chartAdrSeverity) { chartAdrSeverity.destroy(); chartAdrSeverity = null; }
  if (chartAdrSymptoms) { chartAdrSymptoms.destroy(); chartAdrSymptoms = null; }
}

async function loadStats() {
  const daysVal = $('stats-days')?.value || '30';
  let s;
  try {
    s = await api('/api/admin/stats/overview?days=' + encodeURIComponent(daysVal));
  } catch (e) {
    toast(e.message, 'error');
    return;
  }

  // Cập nhật 4 thẻ KPI
  const comp = s.compliance || {};
  const adr = s.adr || {};

  if ($('kpi-adherence')) $('kpi-adherence').textContent = comp.total_doses > 0 ? `${comp.adherence_rate}%` : '—';
  if ($('kpi-doses-sub')) $('kpi-doses-sub').textContent = `${comp.taken_doses || 0} / ${comp.total_doses || 0} cữ đã dùng`;
  if ($('kpi-missed')) $('kpi-missed').textContent = `${comp.missed_doses || 0}`;
  if ($('kpi-missed-sub')) $('kpi-missed-sub').textContent = comp.missed_doses > 0 ? 'Cần can thiệp' : 'Tuyệt vời';

  const topP = (comp.top_missed_patients || [])[0];
  if ($('kpi-top-patient')) $('kpi-top-patient').textContent = topP ? topP.full_name : 'Không có';
  if ($('kpi-top-patient-sub')) $('kpi-top-patient-sub').textContent = topP ? `${topP.missed_count} cữ (${topP.patient_code})` : 'Tuân thủ tốt';

  if ($('kpi-adr')) $('kpi-adr').textContent = `${adr.total || 0}`;
  if ($('kpi-adr-sub')) {
    $('kpi-adr-sub').textContent = adr.unreviewed > 0 ? `${adr.unreviewed} chưa xem` : 'Đã xem hết';
    $('kpi-adr-sub').className = adr.unreviewed > 0 ? 'text-[11px] text-rose-600 mt-1 font-semibold' : 'text-[11px] text-emerald-600 mt-1 font-semibold';
  }

  // Hủy biểu đồ cũ trước khi vẽ lại
  destroyCharts();

  if (typeof Chart === 'undefined') {
    return;
  }

  // 1. Biểu đồ tròn: Tỷ lệ tuân thủ
  const canvasCompliance = $('chart-compliance-ratio');
  if (canvasCompliance) {
    const taken = comp.taken_doses || 0;
    const missed = comp.missed_doses || 0;
    const hasData = taken + missed > 0;
    chartComplianceRatio = new Chart(canvasCompliance, {
      type: 'doughnut',
      data: {
        labels: hasData ? ['Đã uống', 'Bỏ lỡ'] : ['Chưa có dữ liệu'],
        datasets: [{
          data: hasData ? [taken, missed] : [1],
          backgroundColor: hasData ? ['#0d9488', '#f43f5e'] : ['#e2e8f0'],
          borderWidth: 2,
          borderColor: '#ffffff',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, padding: 12, font: { weight: 600, size: 12 } },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${ctx.raw} cữ (${Math.round((ctx.raw / (taken + missed || 1)) * 100)}%)`,
            },
          },
        },
      },
    });
  }

  // 2. Biểu đồ cột: Biến thiên theo ngày
  const canvasTimeline = $('chart-missed-timeline');
  if (canvasTimeline) {
    const timeline = comp.timeline || [];
    chartMissedTimeline = new Chart(canvasTimeline, {
      type: 'bar',
      data: {
        labels: timeline.length ? timeline.map((t) => t.date.slice(8) + '/' + t.date.slice(5, 7)) : ['Hôm nay'],
        datasets: [
          {
            label: 'Đã uống',
            data: timeline.length ? timeline.map((t) => t.taken) : [0],
            backgroundColor: '#0d9488',
            borderRadius: 6,
            stack: 'stack0',
          },
          {
            label: 'Bỏ lỡ',
            data: timeline.length ? timeline.map((t) => t.missed) : [0],
            backgroundColor: '#f43f5e',
            borderRadius: 6,
            stack: 'stack0',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, padding: 12, font: { weight: 600, size: 12 } },
          },
        },
      },
    });
  }

  // 3. Biểu đồ cột ngang: Top bệnh nhân bỏ lỡ nhiều nhất
  const canvasTop = $('chart-top-missed');
  if (canvasTop) {
    const topList = comp.top_missed_patients || [];
    chartTopMissed = new Chart(canvasTop, {
      type: 'bar',
      data: {
        labels: topList.length ? topList.map((p) => p.full_name) : ['Không có bệnh nhân bỏ lỡ'],
        datasets: [{
          label: 'Số cữ bỏ lỡ',
          data: topList.length ? topList.map((p) => p.missed_count) : [0],
          backgroundColor: '#f43f5e',
          borderRadius: 6,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0 } },
          y: { grid: { display: false } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel: (ctx) => {
                const item = topList[ctx.dataIndex];
                return item ? `Mã BN: ${item.patient_code}\n(Bấm để xem chi tiết lịch sử)` : '';
              },
            },
          },
        },
        onClick: (evt, elements) => {
          if (elements.length > 0) {
            const idx = elements[0].index;
            const item = topList[idx];
            if (item) {
              const p = (patients || []).find((x) => x.id === item.patient_id);
              openMissedHistory(p || item);
            }
          }
        },
      },
    });
  }

  // 4. Biểu đồ tròn: Mức độ ADR
  const canvasSev = $('chart-adr-severity');
  if (canvasSev) {
    const sev = adr.by_severity || {};
    const nhe = sev.nhe || 0;
    const vua = sev.vua || 0;
    const nang = sev.nang || 0;
    const hasData = nhe + vua + nang > 0;
    chartAdrSeverity = new Chart(canvasSev, {
      type: 'doughnut',
      data: {
        labels: hasData ? ['Nhẹ', 'Vừa', 'Nặng'] : ['Chưa có báo cáo'],
        datasets: [{
          data: hasData ? [nhe, vua, nang] : [1],
          backgroundColor: hasData ? ['#10b981', '#f59e0b', '#ef4444'] : ['#e2e8f0'],
          borderWidth: 2,
          borderColor: '#ffffff',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, padding: 12, font: { weight: 600, size: 12 } },
          },
        },
      },
    });
  }

  // 5. Biểu đồ cột ngang: Triệu chứng ADR
  const canvasSym = $('chart-adr-symptoms');
  if (canvasSym) {
    const sym = adr.by_symptom || {};
    const symKeys = Object.keys(sym);
    const symVals = Object.values(sym);
    chartAdrSymptoms = new Chart(canvasSym, {
      type: 'bar',
      data: {
        labels: symKeys.length ? symKeys : ['Chưa có triệu chứng'],
        datasets: [{
          label: 'Số ca',
          data: symVals.length ? symVals : [0],
          backgroundColor: '#0d9488',
          borderRadius: 6,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0 } },
          y: { grid: { display: false } },
        },
        plugins: {
          legend: { display: false },
        },
      },
    });
  }
}

/* ---------------------------------------------------------------- Cài đặt chung (Khung giờ nhắc) */
async function loadReminderSettings() {
  let s;
  try { s = await api('/api/admin/reminder-settings'); }
  catch (e) { toast(e.message, 'error'); return; }

  const container = $('slot-times-inputs');
  if (!container) return;
  container.replaceChildren();
  for (const [slot, timeStr] of Object.entries(s.slot_times || {})) {
    const slotLabel = SLOTS[slot] || slot;
    container.append(
      h('div', { class: 'flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl' },
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
          class: 'border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono font-bold bg-white text-teal-800'
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
      <li class="py-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 last:border-b-0">
        <div>
          <p class="font-bold text-slate-800 text-sm flex items-center gap-2">
            <span>👤</span>
            <span>${escapeHtml(u.full_name || 'Chưa đặt tên')}</span>
          </p>
          <p class="text-xs text-slate-500 mt-1">
            ✉️ <span class="font-medium text-slate-700">${escapeHtml(u.email || 'Không có email')}</span> · 🕒 Gửi lúc: ${formatDate(u.approval_requested_at || u.created_at)}
          </p>
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn btn-sm bg-teal-600 hover:bg-teal-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-sm transition" onclick="handleApproveUser('${u.id}', 'approve')">
            ✔ Phê duyệt
          </button>
          <button type="button" class="btn btn-sm bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold px-3 py-2 rounded-xl text-xs border border-rose-200 transition" onclick="handleApproveUser('${u.id}', 'reject')">
            ✖ Từ chối
          </button>
        </div>
      </li>
    `).join('');
  } catch (e) {
    console.error('Lỗi tải danh sách phê duyệt:', e);
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
