-- =====================================================================
-- 01_schema.sql  -  Ứng dụng tuân thủ thuốc ĐTĐ & cảnh giới dược (ADR)
-- Chạy toàn bộ file này trong Supabase → SQL Editor → New query → Run.
-- Có thể chạy lại nhiều lần (idempotent).
-- Đơn vị đường huyết: mmol/L.
-- =====================================================================

-- ---------- 1. BẢNG ----------

create table if not exists public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  role                 text not null default 'patient' check (role in ('patient','admin')),
  patient_code         text unique check (patient_code ~ '^[A-Za-z0-9_-]{3,32}$'),
  full_name            text not null default '' check (char_length(full_name) <= 120),
  phone                text check (phone is null or char_length(phone) <= 20),
  email                text check (email is null or char_length(email) <= 200),
  must_change_password boolean not null default true,
  created_at           timestamptz not null default now()
);

create table if not exists public.prescriptions (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.profiles(id) on delete cascade,
  drug_name   text not null check (char_length(drug_name) between 1 and 120),
  dosage      text not null default '' check (char_length(dosage) <= 120),
  instruction text not null default '' check (char_length(instruction) <= 500),
  is_insulin  boolean not null default false,
  -- khung giờ uống/tiêm trong ngày
  frequency   text[] not null default '{sang}'
              check (frequency <@ array['sang','trua','chieu','toi','truoc_ngu']::text[]
                     and cardinality(frequency) between 1 and 5),
  is_active   boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.daily_logs (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  date            date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  time_slot       text not null default 'sang'
                  check (time_slot in ('sang','trua','chieu','toi','truoc_ngu')),
  status          text not null check (status in ('taken','missed')),
  notes           text check (notes is null or char_length(notes) <= 500),
  created_at      timestamptz not null default now(),
  unique (prescription_id, date, time_slot)
);

create table if not exists public.adr_reports (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  date        date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  symptoms    text[] not null
              check (cardinality(symptoms) between 1 and 12),
  severity    text not null check (severity in ('nhe','vua','nang')),
  description text check (description is null or char_length(description) <= 1000),
  is_reviewed boolean not null default false,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.blood_sugar_logs (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  date        date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  level       numeric(4,1) not null check (level > 0 and level <= 50),
  time_of_day text not null check (time_of_day in ('fasting','after_meal')),
  created_at  timestamptz not null default now()
);

-- Đăng ký Web Push của từng thiết bị
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  endpoint   text not null unique check (char_length(endpoint) <= 1000),
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- Nhật ký đã gửi nhắc (chống gửi trùng) - chỉ backend (service key) truy cập
create table if not exists public.reminder_log (
  patient_id      uuid not null references public.profiles(id) on delete cascade,
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  date            date not null,
  time_slot       text not null,
  channel         text not null,
  sent_at         timestamptz not null default now(),
  primary key (prescription_id, date, time_slot, channel)
);

-- ---------- 2. INDEX ----------
create index if not exists idx_presc_patient     on public.prescriptions(patient_id) where is_active;
create index if not exists idx_logs_patient_date on public.daily_logs(patient_id, date desc);
create index if not exists idx_logs_missed       on public.daily_logs(date desc) where status = 'missed';
create index if not exists idx_adr_patient       on public.adr_reports(patient_id, date desc);
create index if not exists idx_adr_unreviewed    on public.adr_reports(created_at desc) where not is_reviewed;
create index if not exists idx_bs_patient_date   on public.blood_sugar_logs(patient_id, date desc);
create index if not exists idx_push_user         on public.push_subscriptions(user_id);

-- ---------- 3. HÀM TRỢ GIÚP ----------

-- Kiểm tra người gọi có phải admin (security definer để tránh đệ quy RLS)
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Tự tạo profile khi có user mới. LUÔN là 'patient' (bỏ qua mọi metadata về role).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, patient_code, full_name, phone, email)
  values (
    new.id,
    'patient',
    nullif(new.raw_user_meta_data->>'patient_code',''),
    coalesce(left(new.raw_user_meta_data->>'full_name',120), ''),
    nullif(left(new.raw_user_meta_data->>'phone',20),''),
    nullif(left(new.raw_user_meta_data->>'contact_email',200),'')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Chặn người dùng (qua API client) tự đổi role / mã bệnh nhân / id.
-- Khi chạy bằng SQL Editor hoặc service key thì auth.uid() là null → được phép
-- (đây là cách duy nhất để nâng một tài khoản lên admin).
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    if new.role is distinct from old.role
       or new.patient_code is distinct from old.patient_code
       or new.id is distinct from old.id then
      raise exception 'Không được phép thay đổi vai trò hoặc mã bệnh nhân';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile on public.profiles;
create trigger trg_protect_profile
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- Bệnh nhân chỉ được ghi nhật ký cho đơn thuốc của chính mình, không ghi ngày tương lai
create or replace function public.check_daily_log()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.prescriptions p
    where p.id = new.prescription_id and p.patient_id = new.patient_id
  ) then
    raise exception 'Đơn thuốc không thuộc về bệnh nhân này';
  end if;
  if new.date > ((now() at time zone 'Asia/Ho_Chi_Minh')::date) then
    raise exception 'Không thể ghi nhận cho ngày trong tương lai';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_daily_log on public.daily_logs;
create trigger trg_check_daily_log
  before insert or update on public.daily_logs
  for each row execute function public.check_daily_log();

-- ---------- 4. BẬT RLS ----------
alter table public.profiles           enable row level security;
alter table public.prescriptions      enable row level security;
alter table public.daily_logs         enable row level security;
alter table public.adr_reports        enable row level security;
alter table public.blood_sugar_logs   enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reminder_log       enable row level security;  -- không có policy = chỉ service key

-- ---------- 5. POLICIES ----------
-- Xóa policy cũ để chạy lại được
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- profiles
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
-- (INSERT/DELETE profile: chỉ qua trigger / service key, không có policy cho client)

-- prescriptions
create policy presc_select on public.prescriptions
  for select to authenticated
  using (patient_id = auth.uid() or public.is_admin());

create policy presc_admin_insert on public.prescriptions
  for insert to authenticated
  with check (public.is_admin() and created_by = auth.uid());

create policy presc_admin_update on public.prescriptions
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy presc_admin_delete on public.prescriptions
  for delete to authenticated
  using (public.is_admin());

-- daily_logs
create policy logs_select on public.daily_logs
  for select to authenticated
  using (patient_id = auth.uid() or public.is_admin());

create policy logs_insert_own on public.daily_logs
  for insert to authenticated
  with check (patient_id = auth.uid());

create policy logs_update_own on public.daily_logs
  for update to authenticated
  using (patient_id = auth.uid())
  with check (patient_id = auth.uid());

-- adr_reports
create policy adr_select on public.adr_reports
  for select to authenticated
  using (patient_id = auth.uid() or public.is_admin());

create policy adr_insert_own on public.adr_reports
  for insert to authenticated
  with check (patient_id = auth.uid() and is_reviewed = false and reviewed_by is null);

create policy adr_admin_update on public.adr_reports
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- blood_sugar_logs
create policy bs_select on public.blood_sugar_logs
  for select to authenticated
  using (patient_id = auth.uid() or public.is_admin());

create policy bs_insert_own on public.blood_sugar_logs
  for insert to authenticated
  with check (patient_id = auth.uid());

-- push_subscriptions (mỗi người chỉ quản lý thiết bị của mình)
create policy push_own_all on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- 6. QUYỀN (GRANT) - nguyên tắc tối thiểu ----------
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant select, update (full_name, phone, email, must_change_password) on public.profiles to authenticated;
grant select, insert, update, delete on public.prescriptions to authenticated;
grant select, insert, update on public.daily_logs to authenticated;
grant select, insert, update on public.adr_reports to authenticated;
grant select, insert on public.blood_sugar_logs to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
-- reminder_log: không cấp gì cho client

-- =====================================================================
-- SAU KHI CHẠY XONG:
-- 1) Authentication → Sign In / Providers → Email: TẮT "Allow new users to sign up"
--    (chỉ admin tạo bệnh nhân qua backend) và TẮT "Confirm email".
-- 2) Tạo tài khoản admin: Authentication → Users → Add user (email + mật khẩu mạnh),
--    rồi chạy lệnh dưới (thay email):
--
--    update public.profiles
--       set role = 'admin', full_name = 'BS. Nguyễn Văn A', must_change_password = false
--     where id = (select id from auth.users where email = 'admin@example.com');
-- =====================================================================
