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
  try {
    initFontSizeControls();
    registerServiceWorker();
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
    buildAdrForm();
    bindEvents();
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    if (data && data.session) {
      await afterLogin();
    } else {
      showView('login');
    }
  } catch (err) {
    console.error('Lỗi khởi động app bệnh nhân:', err);
    renderLoadingError(err.message || 'Không thể khởi động ứng dụng', err.stack);
  }
}

/* ---------------------------------------------------------------- Chế độ Ngoại tuyến (Offline Mode & Auto-Sync) */
function getCachedProfile() {
  try {
    const raw = localStorage.getItem('dtd_cached_profile');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function getOfflineQueue() {
  try {
    const raw = localStorage.getItem('dtd_sync_queue');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveToOfflineQueue(payload) {
  try {
    const queue = getOfflineQueue();
    const idx = queue.findIndex(
      (item) => item.prescription_id === payload.prescription_id && item.date === payload.date && item.time_slot === payload.time_slot
    );
    if (idx >= 0) queue[idx] = payload;
    else queue.push(payload);
    localStorage.setItem('dtd_sync_queue', JSON.stringify(queue));

    // Đồng thời cập nhật vào cache logs hôm nay để hiển thị ngay lập tức
    const today = payload.date;
    const lRaw = localStorage.getItem('dtd_cached_logs_' + today);
    const cachedLogs = lRaw ? JSON.parse(lRaw) : [];
    const logIdx = cachedLogs.findIndex(
      (l) => l.prescription_id === payload.prescription_id && l.time_slot === payload.time_slot
    );
    if (logIdx >= 0) cachedLogs[logIdx] = { prescription_id: payload.prescription_id, time_slot: payload.time_slot, status: payload.status };
    else cachedLogs.push({ prescription_id: payload.prescription_id, time_slot: payload.time_slot, status: payload.status });
    localStorage.setItem('dtd_cached_logs_' + today, JSON.stringify(cachedLogs));
  } catch (e) {
    console.error('Lỗi lưu vào hàng đợi offline:', e);
  }
}

function getOfflineQueueLogsForDate(date) {
  const queue = getOfflineQueue();
  return queue
    .filter((q) => q.date === date)
    .map((q) => ({ prescription_id: q.prescription_id, time_slot: q.time_slot, status: q.status }));
}

let _isSyncing = false;
async function syncOfflineQueue() {
  if (_isSyncing || !navigator.onLine) return;
  const queue = getOfflineQueue();
  if (!queue.length) return;

  _isSyncing = true;
  console.log(`Bắt đầu đồng bộ ${queue.length} lượt uống thuốc offline lên Supabase...`);
  try {
    const remaining = [];
    for (const item of queue) {
      try {
        const { error } = await sb.from('daily_logs').upsert(item, { onConflict: 'prescription_id,date,time_slot' });
        if (error) {
          console.warn('Lỗi đồng bộ bản ghi:', error);
          remaining.push(item);
        }
      } catch (e) {
        remaining.push(item);
      }
    }
    localStorage.setItem('dtd_sync_queue', JSON.stringify(remaining));
    if (remaining.length < queue.length) {
      const syncedCount = queue.length - remaining.length;
      toast(`✓ Đã đồng bộ ${syncedCount} lượt uống thuốc offline lên máy chủ!`, 'success');
      loadToday();
    }
  } catch (err) {
    console.error('Lỗi trong quá trình đồng bộ offline:', err);
  } finally {
    _isSyncing = false;
  }
}

function updateNetworkBanner() {
  const banner = $('offline-banner');
  if (!banner) return;
  if (!navigator.onLine) {
    show(banner, true);
  } else {
    show(banner, false);
  }
}

async function afterLogin() {
  try {
    const { data: u, error: uErr } = await sb.auth.getUser();
    if (uErr) throw uErr;
    const { data, error } = await sb.from('profiles').select('*').eq('id', u && u.user ? u.user.id : '').maybeSingle();
    if (error || !data) {
      await sb.auth.signOut();
      showView('login');
      return;
    }
    profile = data;
    try { localStorage.setItem('dtd_cached_profile', JSON.stringify(profile)); } catch (e) {}

    if (profile.role === 'admin') {
      await sb.auth.signOut();
      showView('login');
      setError($('login-error'), 'Tài khoản bác sĩ/dược sĩ vui lòng đăng nhập ở trang quản trị (/admin.html).');
      return;
    }
    // Kiểm tra cờ is_first_login (bắt buộc đổi mật khẩu ở lần đăng nhập đầu)
    const isFirst = profile.is_first_login !== undefined ? profile.is_first_login : profile.must_change_password;
    if (isFirst) {
      showView('change-pw');
      return;
    }
    enterApp();
  } catch (err) {
    console.warn('Không thể kết nối máy chủ khi đăng nhập, kiểm tra profile cache offline:', err);
    const cached = getCachedProfile();
    if (cached) {
      profile = cached;
      enterApp();
      toast('⚡ Đang mở ứng dụng ở chế độ ngoại tuyến', 'warning');
      return;
    }
    showView('login');
    setError($('login-error'), 'Lỗi tải thông tin bệnh nhân: ' + (err.message || 'Vui lòng đăng nhập lại'));
  }
}

function enterApp() {
  $('hello-name').textContent = profile.full_name || profile.patient_code;
  $('today-label').textContent = fmtLongToday();
  $('acc-code').textContent = profile.patient_code || '';
  $('acc-name').textContent = profile.full_name || '';
  if ($('acc-email')) {
    const isLocal = !profile.email || profile.email.endsWith('@benhnhan.local');
    $('acc-email').textContent = isLocal ? 'Chưa cài đặt' : profile.email;
  }
  showView('app');
  switchTab('today');
  checkAndInitPatientPushStatus();
  syncOfflineQueue();
}

/* ---------------------------------------------------------------- Web Push Chuông nhắc thuốc */
async function checkAndInitPatientPushStatus() {
  const box = $('patient-push-box');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    if (box) box.classList.add('hidden-view');
    return;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    updatePatientPushBtnUI(!!sub);
    if (sub) {
      await autoSyncPatientPush(sub);
    }
  } catch (e) {
    console.error('Lỗi kiểm tra trạng thái push:', e);
  }
}

async function autoSyncPatientPush(sub) {
  try {
    const p256dhKey = sub.getKey('p256dh');
    const authKey = sub.getKey('auth');
    if (!p256dhKey || !authKey) return;
    const p256dh = btoa(String.fromCharCode.apply(null, new Uint8Array(p256dhKey)));
    const auth = btoa(String.fromCharCode.apply(null, new Uint8Array(authKey)));
    await authApi('/api/patient/push-subscription', {
      method: 'POST',
      body: JSON.stringify({ endpoint: sub.endpoint, p256dh, auth }),
    }).catch(() => {});
  } catch (err) {
    console.warn('Lỗi tự động đồng bộ push:', err);
  }
}

function updatePatientPushBtnUI(isSubscribed) {
  const btn = $('btn-patient-push');
  const desc = $('patient-push-desc');
  if (!btn) return;
  btn.disabled = false;
  if (isSubscribed) {
    btn.textContent = '✓ Đang bật (Bấm để tắt)';
    btn.className = 'btn text-xs px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm cursor-pointer transition';
    if (desc) desc.textContent = 'Đang tự động rung chuông khi đến giờ uống thuốc của bạn';
  } else {
    btn.textContent = 'Bật chuông';
    btn.className = 'btn text-xs px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-sm cursor-pointer transition';
    if (desc) desc.textContent = 'Rung chuông & báo giờ uống thuốc ra màn hình';
  }
}

async function onTogglePatientPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    toast('Trình duyệt không hỗ trợ thông báo đẩy', 'error');
    return;
  }
  const reg = await navigator.serviceWorker.ready;
  const existingSub = await reg.pushManager.getSubscription();
  const btn = $('btn-patient-push');

  // NẾU ĐANG BẬT -> BẤM ĐỂ TẮT (UNSUBSCRIBE)
  if (existingSub) {
    if (btn) { btn.disabled = true; btn.textContent = 'Đang tắt…'; }
    try {
      await fetch('/api/push-subscription/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: existingSub.endpoint }),
      }).catch(() => {});
      await existingSub.unsubscribe();
      updatePatientPushBtnUI(false);
      toast('Đã tắt chuông nhắc thuốc trên thiết bị này');
    } catch (err) {
      console.error('Lỗi tắt chuông:', err);
      toast('Không thể tắt chuông: ' + err.message, 'error');
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

  if (btn) { btn.disabled = true; btn.textContent = 'Đang kích hoạt…'; }

  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(cfg.vapid_public_key),
    });

    const p256dhKey = sub.getKey('p256dh');
    const authKey = sub.getKey('auth');
    const p256dh = btoa(String.fromCharCode.apply(null, new Uint8Array(p256dhKey)));
    const auth = btoa(String.fromCharCode.apply(null, new Uint8Array(authKey)));

    await authApi('/api/patient/push-subscription', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: sub.endpoint,
        p256dh,
        auth,
      }),
    });

    updatePatientPushBtnUI(true);
    toast('✓ Đã bật chuông nhắc thuốc thành công cho điện thoại này!');
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Bật chuông'; }
    console.error('Lỗi bật chuông nhắc thuốc:', err);
    toast('Không thể bật chuông: ' + err.message, 'error');
  }
}

/* ---------------------------------------------------------------- API bảo mật gọi backend */
async function authApi(path, opts = {}) {
  const { data } = await sb.auth.getSession();
  if (!data.session) throw new Error('Hết phiên đăng nhập. Vui lòng đăng nhập lại.');
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + data.session.access_token,
      ...(opts.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof body.detail === 'string' ? body.detail : 'Không thể thực hiện yêu cầu');
  }
  return body;
}

/* ---------------------------------------------------------------- sự kiện */
function bindEvents() {
  $('login-form').addEventListener('submit', onLogin);
  $('force-pw-form').addEventListener('submit', (e) => onChangePassword(e, 'force-new-pw', 'force-new-pw2', 'force-pw-error', 'force-pw-submit', true));
  const forceBackBtn = $('force-pw-back');
  if (forceBackBtn) {
    forceBackBtn.addEventListener('click', async () => {
      forceBackBtn.disabled = true;
      try {
        await sb.auth.signOut();
      } catch (err) {
        console.warn('Lỗi đăng xuất khi quay lại:', err);
      }
      $('force-new-pw').value = '';
      $('force-new-pw2').value = '';
      setError($('force-pw-error'), '');
      forceBackBtn.disabled = false;
      showView('login');
    });
  }
  if ($('btn-clear-adr')) {
    $('btn-clear-adr').addEventListener('click', () => {
      const el = $('adr-desc');
      if (el) {
        if (!el.value.trim()) {
          toast('Ô mô tả đang trống', 'info');
          return;
        }
        el.value = '';
        el.focus();
        show($('voice-hint-adr'), false);
        toast('Đã xóa nội dung mô tả', 'info');
      }
    });
  }
  $('pw-form').addEventListener('submit', (e) => onChangePassword(e, 'pw-new', 'pw-new2', 'pw-error', 'pw-submit', false, 'pw-old'));
  $('sugar-form').addEventListener('submit', onSaveSugar);
  $('adr-form').addEventListener('submit', onSubmitAdr);
  $('logout-btn').addEventListener('click', () => {
    const btn = $('logout-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Đang đăng xuất…';
    }

    // 1. Hủy đăng ký push chạy ngầm trong nền (fire-and-forget), không làm nghẽn luồng đăng xuất
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) return;
        reg.pushManager.getSubscription().then((sub) => {
          if (sub) {
            fetch('/api/push-subscription/unsubscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ endpoint: sub.endpoint }),
            }).catch(() => {});
            sub.unsubscribe().catch(() => {});
          }
        }).catch(() => {});
      }).catch(() => {});
    }

    // 2. Xóa sạch mọi session và cache trong localStorage lập tức
    try {
      localStorage.removeItem('dtd_cached_profile');
      localStorage.removeItem('dtd_cached_prescriptions');
      localStorage.removeItem('dtd_sync_queue');
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key.startsWith('dtd_cached_logs_'))) {
          localStorage.removeItem(key);
        }
      }
    } catch (e) {
      console.warn('Lỗi dọn dẹp storage khi đăng xuất:', e);
    }

    // 3. Reset toàn bộ state trong bộ nhớ
    profile = null;
    _prevTakenCount = -1;

    // 4. Kích hoạt signOut của Supabase ngầm (xóa cookie / indexedDB)
    try {
      if (sb && sb.auth) {
        sb.auth.signOut().catch(() => {});
      }
    } catch (e) {}

    // 5. Chuyển ngay lập tức về màn hình đăng nhập siêu tốc
    showView('login');
    if ($('login-user')) $('login-user').value = '';
    if ($('login-pw')) $('login-pw').value = '';
    setError($('login-error'), '');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Đăng xuất tài khoản';
    }
    toast('✓ Đã đăng xuất thành công', 'info');
  });
  window.addEventListener('online', () => {
    updateNetworkBanner();
    toast('✓ Đã khôi phục kết nối mạng Internet', 'success');
    syncOfflineQueue();
  });
  window.addEventListener('offline', () => {
    updateNetworkBanner();
    toast('⚡ Mất kết nối Internet. Chế độ ngoại tuyến đã kích hoạt.', 'warning');
  });
  updateNetworkBanner();
  setInterval(() => {
    if (navigator.onLine) syncOfflineQueue();
  }, 20000);
  document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  if ($('btn-patient-push')) $('btn-patient-push').addEventListener('click', onTogglePatientPush);
  if ($('btn-patient-test-push')) $('btn-patient-test-push').addEventListener('click', onTestPushPatient);

  /* --- CÁC NÚT BẤM ĐỂ NÓI (VOICE INPUT) GỬI THÔNG TIN CHO BÁC SĨ --- */
  // 1. Nói số đo đường huyết
  if ($('btn-voice-sugar')) {
    setupVoiceButton({
      buttonEl: $('btn-voice-sugar'),
      inputEl: $('sugar-level'),
      mode: 'number',
      statusEl: $('voice-hint-sugar'),
      onParsed: ({ context }) => {
        if (context && $('sugar-time')) {
          $('sugar-time').value = context;
        }
      },
    });
  }

  // 2. Nói mô tả triệu chứng bất thường (ADR)
  if ($('btn-voice-adr')) {
    setupVoiceButton({
      buttonEl: $('btn-voice-adr'),
      inputEl: $('adr-desc'),
      mode: 'append',
      statusEl: $('voice-hint-adr'),
      onParsed: ({ text }) => {
        // Tự động nhận diện và tick chọn các triệu chứng
        const detected = detectSymptomsFromSpeech(text);
        if (detected.length) {
          detected.forEach((sym) => {
            const cb = document.querySelector(`input[name=symptom][value="${sym}"]`);
            if (cb && !cb.checked) {
              cb.checked = true;
              cb.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });
          toast(`✨ Tự động nhận diện: ${detected.join(', ')}`);
        }

        // Tự động nhận diện mức độ
        const t = text.toLowerCase();
        if (t.includes('nặng') || t.includes('cấp cứu') || t.includes('nghiêm trọng') || t.includes('khó thở') || t.includes('co giật')) {
          const rNang = document.querySelector('input[name=severity][value="nang"]');
          if (rNang) {
            rNang.checked = true;
            rNang.dispatchEvent(new Event('change', { bubbles: true }));
            show($('adr-severe-note'), true);
          }
        } else if (t.includes('nhẹ') || t.includes('hơi hơi') || t.includes('chút ít')) {
          const rNhe = document.querySelector('input[name=severity][value="nhe"]');
          if (rNhe) {
            rNhe.checked = true;
            rNhe.dispatchEvent(new Event('change', { bubbles: true }));
            show($('adr-severe-note'), false);
          }
        }
      },
    });
  }

  // 3. Nói lý do bỏ lỡ cữ thuốc gửi bác sĩ
  if ($('btn-voice-missed')) {
    setupVoiceButton({
      buttonEl: $('btn-voice-missed'),
      inputEl: $('missed-reason-text'),
      mode: 'append',
      statusEl: $('voice-hint-missed'),
    });
  }

  // Xử lý sự kiện modal lý do bỏ lỡ thuốc
  if ($('missed-modal-close')) {
    $('missed-modal-close').addEventListener('click', () => $('dlg-missed-reason').close());
  }
  if ($('btn-missed-confirm-reason')) {
    $('btn-missed-confirm-reason').addEventListener('click', () => {
      const reason = $('missed-reason-text').value.trim();
      $('dlg-missed-reason').close();
      if (_pendingMissed) {
        markDose(_pendingMissed.p, _pendingMissed.slot, 'missed', _pendingMissed.btn, reason || null);
        _pendingMissed = null;
      }
    });
  }
  if ($('btn-missed-skip-reason')) {
    $('btn-missed-skip-reason').addEventListener('click', () => {
      $('dlg-missed-reason').close();
      if (_pendingMissed) {
        markDose(_pendingMissed.p, _pendingMissed.slot, 'missed', _pendingMissed.btn, null);
        _pendingMissed = null;
      }
    });
  }

  // 4. Thử nghiệm gửi Email nhắc thuốc
  function openTestEmailModal() {
    const dlg = $('dlg-test-email');
    if (!dlg) return;
    const inp = $('test-email-input');
    const isLocal = !profile || !profile.email || profile.email.endsWith('@benhnhan.local');
    if (inp) inp.value = isLocal ? '' : (profile.email || '');
    setError($('test-email-error'), '');
    if (typeof dlg.showModal === 'function') {
      try {
        if (!dlg.open) dlg.showModal();
      } catch (e) {
        console.warn('Lỗi khi mở modal email:', e);
      }
    }
  }

  if ($('btn-patient-test-email')) {
    $('btn-patient-test-email').addEventListener('click', openTestEmailModal);
  }
  if ($('btn-account-test-email')) {
    $('btn-account-test-email').addEventListener('click', openTestEmailModal);
  }
  if ($('test-email-close')) {
    $('test-email-close').addEventListener('click', () => {
      const dlg = $('dlg-test-email');
      if (dlg && dlg.open) dlg.close();
    });
  }
  if ($('test-email-cancel')) {
    $('test-email-cancel').addEventListener('click', () => {
      const dlg = $('dlg-test-email');
      if (dlg && dlg.open) dlg.close();
    });
  }

  // Tự động đóng modal khi người dùng bấm vào vùng nền mờ bên ngoài (backdrop)
  ['dlg-test-email', 'dlg-missed-reason', 'dlg-font-size'].forEach((dlgId) => {
    const d = $(dlgId);
    if (d) {
      d.addEventListener('click', (e) => {
        if (e.target === d && d.open) {
          d.close();
        }
      });
    }
  });

  if ($('btn-do-send-test-email')) {
    $('btn-do-send-test-email').addEventListener('click', async () => {
      const inp = $('test-email-input');
      const emailVal = (inp ? inp.value : '').trim();
      setError($('test-email-error'), '');
      if (!emailVal || !emailVal.includes('@')) {
        setError($('test-email-error'), 'Vui lòng nhập địa chỉ Email hợp lệ (ví dụ: your_name@gmail.com)');
        return;
      }
      const btn = $('btn-do-send-test-email');
      btn.disabled = true;
      btn.textContent = '⏳ Đang gửi email…';
      try {
        const res = await authApi('/api/patient/test-email', {
          method: 'POST',
          body: JSON.stringify({ email: emailVal }),
        });
        if (profile) profile.email = emailVal;
        if ($('acc-email')) $('acc-email').textContent = emailVal;
        const dlg = $('dlg-test-email');
        if (dlg && dlg.open) dlg.close();
        toast(res.message || '✓ Đã gửi email nhắc thuốc thử nghiệm thành công!', 'success');
      } catch (err) {
        console.error('Lỗi khi gửi email:', err);
        setError($('test-email-error'), err.message || 'Không thể gửi email, vui lòng thử lại');
      } finally {
        btn.disabled = false;
        btn.textContent = '✓ Gửi Email Thử Nghiệm Ngay';
      }
    });
  }
}


async function onTestPushPatient() {
  const btn = $('btn-patient-test-push');
  if (btn) { btn.disabled = true; btn.textContent = 'Đang thử…'; }
  try {
    const res = await authApi('/api/test-push', { method: 'POST' });
    toast(res.message || '✓ Đã rung chuông thử nghiệm trên máy của bạn!', 'success');
  } catch (err) {
    toast('Lỗi thử chuông: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🔔 Thử rung chuông';
    }
  }
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  const targetPanel = $('tab-' + tab);
  document.querySelectorAll('.tab-panel').forEach((p) => {
    if (p !== targetPanel) show(p, false);
  });
  if (targetPanel) {
    show(targetPanel, true);
    if (window.gsap) {
      gsap.fromTo(targetPanel, 
        { opacity: 0, y: 8 }, 
        { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' }
      );
    }
  }
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

async function onChangePassword(e, id1, id2, errId, btnId, first, oldPwId = null) {
  e.preventDefault();
  setError($(errId), '');
  const p1 = $(id1).value, p2 = $(id2).value;

  if (oldPwId) {
    const oldPw = $(oldPwId).value;
    if (!oldPw) {
      setError($(errId), 'Vui lòng nhập mật khẩu hiện tại (mật khẩu cũ)');
      $(oldPwId).focus();
      return;
    }
    if (p1 && p1 === oldPw) {
      setError($(errId), 'Mật khẩu mới phải khác mật khẩu hiện tại');
      $(id1).focus();
      return;
    }
  }

  const msg = validateNewPassword(p1, p2);
  setError($(errId), msg);
  if (msg) return;

  const btn = $(btnId);
  const originalBtnText = btn.textContent;
  btn.disabled = true;

  // 1. Kiểm tra xác thực mật khẩu cũ nếu có
  if (oldPwId) {
    btn.textContent = '⏳ Đang kiểm tra mật khẩu cũ…';
    const oldPw = $(oldPwId).value;
    const emailToVerify = (profile && profile.email) || `${(profile && profile.patient_code) || ''}@benhnhan.local`;
    try {
      const { error: verifyErr } = await sb.auth.signInWithPassword({
        email: emailToVerify,
        password: oldPw,
      });
      if (verifyErr) {
        btn.disabled = false;
        btn.textContent = originalBtnText;
        setError($(errId), 'Mật khẩu hiện tại không chính xác. Vui lòng kiểm tra lại!');
        $(oldPwId).focus();
        return;
      }
    } catch (verEx) {
      btn.disabled = false;
      btn.textContent = originalBtnText;
      setError($(errId), 'Không thể xác thực mật khẩu hiện tại. Vui lòng thử lại!');
      return;
    }
  }

  btn.textContent = '⏳ Đang lưu mật khẩu mới…';
  const { error } = await sb.auth.updateUser({ password: p1 });
  if (error) {
    btn.disabled = false;
    btn.textContent = originalBtnText;
    setError($(errId), 'Không đổi được mật khẩu: ' + (error.message || 'Hãy thử mật khẩu khác.'));
    return;
  }

  // Cập nhật trạng thái đổi mật khẩu (tương thích linh hoạt với cả schema cũ và mới của Supabase)
  const updatePayload = { must_change_password: false };
  if (profile && 'is_first_login' in profile) {
    updatePayload.is_first_login = false;
  }
  let { error: e2 } = await sb.from('profiles').update(updatePayload).eq('id', profile.id);
  if (e2 && updatePayload.is_first_login !== undefined) {
    console.warn('Thử cập nhật lại chỉ với must_change_password do DB chưa có is_first_login:', e2);
    const retry = await sb.from('profiles').update({ must_change_password: false }).eq('id', profile.id);
    e2 = retry.error;
  }

  btn.disabled = false;
  btn.textContent = originalBtnText;
  if (e2) {
    console.error('Lỗi cập nhật hồ sơ sau đổi mật khẩu:', e2);
    setError($(errId), 'Đã đổi mật khẩu nhưng chưa cập nhật hồ sơ, vui lòng thử lại');
    return;
  }

  if (profile) {
    profile.is_first_login = false;
    profile.must_change_password = false;
  }

  if (oldPwId && $(oldPwId)) $(oldPwId).value = '';
  $(id1).value = '';
  $(id2).value = '';
  toast('✓ Đã đổi mật khẩu thành công', 'success');
  if (first) enterApp();
}

/* ---------------------------------------------------------------- thuốc hôm nay */
function isSlotOverdue(slot) {
  const slotTimes = (cfg && cfg.slot_times) || {
    sang: '07:00',
    trua: '11:30',
    chieu: '16:30',
    toi: '19:30',
    truoc_ngu: '21:30',
  };
  const timeStr = slotTimes[slot] || '08:00';
  const parts = timeStr.split(':').map(Number);
  const slotMinutes = (parts[0] || 0) * 60 + (parts[1] || 0);

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  // Quá hạn hơn 60 phút sau giờ quy định
  return currentMinutes > slotMinutes + 60;
}

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
  let prescData = null;
  let logsData = null;

  try {
    const [presc, logs] = await Promise.all([
      sb.from('prescriptions').select('*').eq('is_active', true).order('created_at'),
      sb.from('daily_logs').select('prescription_id,time_slot,status').eq('date', today),
    ]);
    if (presc.error || logs.error) throw (presc.error || logs.error);
    prescData = presc.data || [];
    logsData = logs.data || [];
    try {
      localStorage.setItem('dtd_cached_prescriptions', JSON.stringify(prescData));
      localStorage.setItem('dtd_cached_logs_' + today, JSON.stringify(logsData));
    } catch (e) {}
  } catch (err) {
    console.warn('Không thể tải dữ liệu từ máy chủ, nạp từ bộ nhớ máy (Offline):', err);
    try {
      const pRaw = localStorage.getItem('dtd_cached_prescriptions');
      const lRaw = localStorage.getItem('dtd_cached_logs_' + today);
      prescData = pRaw ? JSON.parse(pRaw) : null;
      logsData = lRaw ? JSON.parse(lRaw) : [];
    } catch (e) {}
  }

  const list = $('med-list');
  list.replaceChildren();

  if (!prescData) {
    list.append(h('div', { class: 'card p-6 text-center text-slate-500 space-y-3' },
      h('div', { class: 'w-12 h-12 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400' },
        h('svg', { class: 'w-6 h-6', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
          h('line', { x1: '1', y1: '1', x2: '23', y2: '23' }),
          h('path', { d: 'M16.72 11.06A10.94 10.94 0 0 1 19 12.55' }),
          h('path', { d: 'M5 12.55a10.94 10.94 0 0 1 5.17-2.39' }),
          h('path', { d: 'M10.71 5.05A16 16 0 0 1 22.58 9' }),
          h('path', { d: 'M1.42 9a15.91 15.91 0 0 1 4.7-2.88' }),
          h('path', { d: 'M8.53 16.11a6 6 0 0 1 6.95 0' }),
          h('line', { x1: '12', y1: '20', x2: '12.01', y2: '20' })
        )
      ),
      h('p', { class: 'font-bold text-slate-700' }, 'Bạn đang ngoại tuyến'),
      h('p', { class: 'text-xs text-slate-400' }, 'Chưa có bản lưu đơn thuốc trên máy này. Hãy kết nối WiFi/4G một lần để đồng bộ.')));
    return;
  }

  // Gộp các bản ghi đang chờ đồng bộ từ hàng đợi offline
  const offlineLogs = getOfflineQueueLogsForDate(today);
  const allLogs = [...(logsData || [])];
  for (const off of offlineLogs) {
    const idx = allLogs.findIndex((l) => l.prescription_id === off.prescription_id && l.time_slot === off.time_slot);
    if (idx >= 0) allLogs[idx] = off;
    else allLogs.push(off);
  }

  const done = new Map(allLogs.map((l) => [`${l.prescription_id}|${l.time_slot}`, l.status]));
  const items = [];
  for (const p of prescData) for (const slot of p.frequency) items.push({ p, slot });
  items.sort((a, b) => {
    const timeA = getPrescriptionTime(a.p, a.slot);
    const timeB = getPrescriptionTime(b.p, b.slot);
    if (timeA !== timeB) return timeA.localeCompare(timeB);
    return SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot);
  });

  if (!items.length) {
    list.append(h('div', { class: 'card p-8 text-center text-slate-500 space-y-3' },
      h('div', { class: 'w-12 h-12 mx-auto rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700' },
        h('svg', { class: 'w-6 h-6', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
          h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
          h('polyline', { points: '14 2 14 8 20 8' }),
          h('line', { x1: '16', y1: '13', x2: '8', y2: '13' }),
          h('line', { x1: '16', y1: '17', x2: '8', y2: '17' }),
          h('polyline', { points: '10 9 9 9 8 9' })
        )
      ),
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
    const rawStatus = done.get(`${p.id}|${slot}`);
    const isOverdue = !rawStatus && isSlotOverdue(slot);
    const status = rawStatus || (isOverdue ? 'missed' : null);
    if (status === 'taken') taken++;
    const isCurrent = slot === curSlot && !status;
    list.append(medCard(p, slot, status, isCurrent, isOverdue));
  }

  // Hoạt ảnh GSAP xuất hiện thẻ thuốc tuần tự (Stagger Entrance)
  if (window.gsap && list.children.length > 0) {
    gsap.fromTo(list.children, 
      { opacity: 0, y: 12 }, 
      { opacity: 1, y: 0, duration: 0.32, stagger: 0.05, ease: 'power2.out' }
    );
  }

  const total = items.length;
  $('progress-label').textContent = `${taken}/${total} đã dùng`;
  const pct = Math.round((taken / total) * 100);

  // Hoạt ảnh GSAP thanh tiến độ chạy mượt mà
  if (window.gsap) {
    gsap.to($('progress-bar'), { width: `${pct}%`, duration: 0.55, ease: 'power2.out' });
  } else {
    $('progress-bar').style.width = `${pct}%`;
  }

  if (pct === 100) $('progress-bar').classList.add('progress-glow');
  else $('progress-bar').classList.remove('progress-glow');

  const allDone = taken === total && total > 0;
  const celebBox = $('celebration-box');
  const wasHidden = celebBox.classList.contains('hidden-view');
  show(celebBox, allDone);

  if (allDone && wasHidden && window.gsap) {
    gsap.fromTo(celebBox, 
      { opacity: 0, scale: 0.95, y: -8 }, 
      { opacity: 1, scale: 1, y: 0, duration: 0.45, ease: 'power2.out' }
    );
  }

  // Kích hoạt pháo hoa chúc mừng nếu vừa hoàn thành cữ cuối cùng
  if (allDone && _prevTakenCount !== -1 && _prevTakenCount < total) {
    triggerConfetti();
  }
  _prevTakenCount = taken;
}

function medCard(p, slot, status, isCurrent, isOverdue) {
  const verbDone = p.is_insulin ? 'Đã tiêm' : 'Đã uống';
  const isTaken = status === 'taken';
  const isMissed = status === 'missed';

  let cardClass = 'card p-5 transition-all relative overflow-hidden';
  if (isTaken) cardClass += ' card-taken';
  else if (isMissed) cardClass += ' card-missed';
  else if (isCurrent) cardClass += ' card-current-slot';

  const statusBadge = () => {
    if (isTaken) {
      return h('span', { class: 'inline-flex items-center gap-1.5 text-xs font-semibold bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5 border border-slate-200' },
        h('svg', { class: 'w-3 h-3 text-slate-500', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
          h('polyline', { points: '20 6 9 17 4 12' })
        ),
        h('span', {}, `${verbDone} xong`));
    }
    if (isMissed) {
      const txt = isOverdue ? 'Quá giờ (Bỏ lỡ)' : 'Bỏ lỡ';
      return h('span', { class: 'inline-flex items-center gap-1 text-xs font-bold bg-rose-50 text-rose-800 rounded-full px-2.5 py-0.5 border border-rose-200' },
        h('svg', { class: 'w-3 h-3 text-rose-600', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
          h('line', { x1: '18', y1: '6', x2: '6', y2: '18' }),
          h('line', { x1: '6', y1: '6', x2: '18', y2: '18' })
        ),
        h('span', {}, txt));
    }
    if (isCurrent) {
      return h('span', { class: 'inline-flex items-center gap-1.5 text-xs font-bold bg-teal-700 text-white rounded-full px-2.5 py-0.5 shadow-sm' },
        h('span', { class: 'w-1.5 h-1.5 rounded-full bg-emerald-300 animate-ping' }),
        h('span', {}, 'Đến giờ dùng'));
    }
    return h('span', { class: 'text-xs font-semibold text-slate-400 bg-slate-100 rounded-full px-2.5 py-0.5' }, 'Cữ sắp tới');
  };

  const btnTakeText = isTaken ? `${verbDone} xong` : isMissed ? `Uống bù ngay` : verbDone;

  const btnTake = h('button', {
    type: 'button',
    disabled: isTaken,
    class: `btn py-3 px-4 text-base font-extrabold flex-1 gap-2 transition-all ${
      isTaken 
        ? 'bg-slate-200 text-slate-500 border border-slate-300 cursor-not-allowed shadow-none opacity-80' 
        : isMissed
        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30 ring-2 ring-emerald-400'
        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
    }`,
    onclick: isTaken ? null : (ev) => markDose(p, slot, 'taken', ev.currentTarget),
  }, 
  h('svg', { class: `w-4 h-4 ${isTaken ? 'text-slate-400' : 'text-white'}`, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    h('polyline', { points: '20 6 9 17 4 12' })
  ),
  h('span', {}, btnTakeText));

  const btnMiss = h('button', {
    type: 'button',
    class: `btn py-3 px-3 text-sm font-bold border transition-all ${
      status === 'missed' && !isOverdue
        ? 'bg-rose-50 text-rose-700 border-rose-300 ring-2 ring-rose-400'
        : 'bg-white hover:bg-rose-50/50 text-slate-600 border-slate-200'
    }`,
    onclick: (ev) => openMissedModal(p, slot, ev.currentTarget),
  }, 'Bỏ lỡ');

  const recoveryNotice = isMissed ? h('div', { class: 'mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 font-semibold flex items-center justify-between gap-2' },
    h('span', {}, 'Đã quá giờ hơn 1 tiếng. Nếu bạn vừa dùng thuốc, hãy bấm nút uống bù để hoàn thành cữ.'),
    h('button', {
      type: 'button',
      class: 'shrink-0 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs',
      onclick: (ev) => markDose(p, slot, 'taken', ev.currentTarget),
    }, 'Uống bù')
  ) : null;

  const exactTime = getPrescriptionTime(p, slot);
  const parsed = parsePrescriptionTimes(p);
  const displayInstruction = parsed.cleanInstruction;

  return h('article', { class: cardClass },
    h('div', { class: 'flex items-start justify-between gap-3 mb-2' },
      h('div', {},
        h('div', { class: 'flex items-center gap-1.5 flex-wrap mb-1.5' },
          h('span', { class: 'inline-flex items-center gap-1 text-xs font-black tracking-wide text-white bg-teal-800 px-2.5 py-0.5 rounded-lg shadow-xs' },
            h('svg', { class: 'w-3 h-3 text-teal-200', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
              h('circle', { cx: '12', cy: '12', r: '10' }),
              h('polyline', { points: '12 6 12 12 16 14' })
            ),
            h('span', {}, exactTime)
          ),
          h('span', { class: 'text-xs font-bold text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded-lg border border-teal-200' }, SLOTS[slot])),
        h('h3', { class: 'text-xl font-black text-slate-900 mt-1' }, p.drug_name),
        h('p', { class: 'text-slate-600 font-bold text-sm mt-0.5' }, `Liều dùng: ${p.dosage}`)),
      h('div', { class: 'flex flex-col items-end gap-1.5 shrink-0' },
        statusBadge(),
        p.is_insulin && h('span', { class: 'text-[11px] font-bold bg-amber-50 text-amber-900 rounded-full px-2.5 py-0.5 border border-amber-200' }, 'Thuốc tiêm (Insulin)'))),
    displayInstruction && h('p', { class: 'text-xs text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100 mt-2 font-medium' },
      h('strong', { class: 'text-slate-700' }, 'Hướng dẫn: '), displayInstruction),
    recoveryNotice,
    h('div', { class: 'flex items-center gap-2.5 mt-4' },
      btnTake,
      status !== 'taken' && !isOverdue && btnMiss));
}

let _pendingMissed = null;
function openMissedModal(p, slot, btn) {
  _pendingMissed = { p, slot, btn };
  const dlg = $('dlg-missed-reason');
  if ($('missed-modal-drug')) {
    $('missed-modal-drug').textContent = `${p.drug_name} (${getPrescriptionTime(p, slot)} · ${SLOTS[slot]})`;
  }
  if ($('missed-reason-text')) {
    $('missed-reason-text').value = '';
  }
  if ($('voice-hint-missed')) {
    show($('voice-hint-missed'), false);
  }
  if (dlg && typeof dlg.showModal === 'function') {
    dlg.showModal();
  } else {
    markDose(p, slot, 'missed', btn, null);
  }
}

async function markDose(p, slot, status, btn, notes = null) {
  if (window.gsap && btn) {
    gsap.fromTo(btn, { scale: 0.95 }, { scale: 1, duration: 0.18, ease: 'power1.out' });
  }
  btn.disabled = true;
  const today = vnToday();
  const payload = {
    patient_id: profile.id,
    prescription_id: p.id,
    date: today,
    time_slot: slot,
    status,
  };
  if (notes) payload.notes = notes;

  if (!navigator.onLine) {
    saveToOfflineQueue(payload);
    btn.disabled = false;
    toast(status === 'taken' ? '⚡ [Offline] Đã lưu dùng thuốc! Sẽ tự đồng bộ khi có mạng.' : '⚡ [Offline] Đã lưu báo bỏ lỡ! Sẽ tự đồng bộ khi có mạng.', 'warning');
    loadToday();
    return;
  }

  try {
    const { error } = await sb.from('daily_logs').upsert(
      payload,
      { onConflict: 'prescription_id,date,time_slot' });
    if (error) throw error;
    toast(status === 'taken' ? '✓ Đã ghi nhận dùng thuốc' : (notes ? '✓ Đã báo bỏ lỡ kèm lý do tới Bác sĩ' : 'Đã ghi nhận bỏ lỡ'));
  } catch (err) {
    console.warn('Lỗi mạng khi lưu nhật ký, lưu vào hàng đợi offline:', err);
    saveToOfflineQueue(payload);
    toast('⚡ [Offline] Đã lưu vào máy! Sẽ tự động đồng bộ khi có mạng.', 'warning');
  } finally {
    btn.disabled = false;
    loadToday();
  }
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
  if (!(level > 0 && level <= 50)) { toast('Chỉ số không hợp lệ (từ 0.1 đến 50 mmol/L)', 'error'); return; }
  const tod = $('sugar-time').value;
  const btn = $('sugar-submit'); btn.disabled = true;

  try {
    await authApi('/api/patient/blood-sugar', {
      method: 'POST',
      body: JSON.stringify({ level, time_of_day: tod }),
    });
    btn.disabled = false;
    const [text, cls] = classifySugar(level, tod);
    const hint = $('sugar-hint');
    hint.textContent = text; hint.className = `text-xs font-bold p-3.5 rounded-2xl ${cls}`;
    show(hint, true);
    $('sugar-level').value = '';
    toast('✓ Đã lưu chỉ số đường huyết thành công');
    loadSugar();
  } catch (err) {
    btn.disabled = false;
    toast(err.message || 'Không lưu được, vui lòng thử lại', 'error');
  }
}

async function loadSugar() {
  const since = addDays(vnToday(), -6);
  let sugarData = [];
  try {
    const { data, error } = await sb.from('blood_sugar_logs').select('date,level,time_of_day,created_at')
      .gte('date', since).order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    sugarData = data || [];
    try { localStorage.setItem('dtd_cached_sugar', JSON.stringify(sugarData)); } catch (e) {}
  } catch (err) {
    console.warn('Không tải được đường huyết từ mạng, nạp từ cache:', err);
    try {
      const sRaw = localStorage.getItem('dtd_cached_sugar');
      sugarData = sRaw ? JSON.parse(sRaw) : [];
    } catch (e) {}
  }
  const data = sugarData;

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
  box.replaceChildren();
  SYMPTOMS.forEach((s, i) => {
    box.append(h('label', { class: 'flex items-center gap-2.5 border-2 border-slate-200 rounded-2xl p-3 has-[:checked]:bg-teal-50 has-[:checked]:border-teal-600 cursor-pointer transition-all' },
      h('input', { type: 'checkbox', name: 'symptom', value: s, id: 'sym-' + i, class: 'w-5 h-5 rounded-lg accent-teal-600 shrink-0' }),
      h('span', { class: 'font-bold text-sm text-slate-800' }, s)));
  });
  const sev = $('adr-severity');
  sev.replaceChildren();
  Object.entries(SEVERITY_PATIENT).forEach(([v, label], i) => {
    sev.append(h('label', { class: 'flex items-center gap-3 border-2 border-slate-200 rounded-2xl p-3 font-semibold text-sm cursor-pointer transition-all has-[:checked]:bg-teal-700 has-[:checked]:text-white has-[:checked]:border-teal-700' },
      h('input', { type: 'radio', name: 'severity', value: v, class: 'w-4 h-4 accent-teal-600 shrink-0', checked: i === 0 }),
      h('span', { class: 'leading-snug' }, label)));
  });
  sev.addEventListener('change', () => {
    const checked = document.querySelector('input[name=severity]:checked');
    show($('adr-severe-note'), checked && checked.value === 'nang');
  });
}

async function onSubmitAdr(e) {
  e.preventDefault();
  const symptoms = [...document.querySelectorAll('input[name=symptom]:checked')].map((i) => i.value);
  const severity = document.querySelector('input[name=severity]:checked').value;
  const description = $('adr-desc').value.trim();
  setError($('adr-error'), '');
  if (!symptoms.length) { setError($('adr-error'), 'Hãy chọn ít nhất một triệu chứng'); return; }
  if (symptoms.includes('Khác') && !description) { setError($('adr-error'), 'Vui lòng mô tả chi tiết ở ô ghi chú khi chọn "Khác"'); return; }
  const btn = $('adr-submit'); btn.disabled = true;

  try {
    await authApi('/api/patient/adr', {
      method: 'POST',
      body: JSON.stringify({ symptoms, severity, description: description || null }),
    });
    btn.disabled = false;
    toast('✓ Đã gửi báo cáo triệu chứng tới Bác sĩ');
    $('adr-form').reset();
    show($('adr-severe-note'), false);
    loadAdrRecent();
  } catch (err) {
    btn.disabled = false;
    setError($('adr-error'), err.message || 'Không gửi được báo cáo, vui lòng thử lại');
  }
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
