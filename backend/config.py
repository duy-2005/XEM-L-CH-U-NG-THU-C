"""Cấu hình đọc từ biến môi trường / file .env (không bao giờ hardcode bí mật)."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    supabase_url: str
    supabase_secret_key: str            # CHỈ dùng ở backend
    supabase_publishable_key: str = ""  # công khai, dành cho frontend
    allowed_origins: str = "http://localhost:8000"
    cron_secret: str = ""
    app_url: str = "http://localhost:8000"
    default_patient_password: str = "123456"
    patient_email_domain: str = "benhnhan.local"

    # Cấu hình Gmail SMTP
    gmail_user: str = ""
    gmail_app_password: str = ""
    doctor_alert_email: str = ""

    # Cấu hình Web Push (VAPID)
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:admin@example.com"

    # Giờ nhắc thuốc mặc định (HH:MM) - có thể chỉnh trong .env
    reminder_time_sang: str = "07:00"
    reminder_time_trua: str = "11:30"
    reminder_time_chieu: str = "16:30"
    reminder_time_toi: str = "19:30"
    reminder_time_truoc_ngu: str = "21:30"

    @property
    def slot_times(self) -> dict[str, str]:
        return {
            "sang": self.reminder_time_sang,
            "trua": self.reminder_time_trua,
            "chieu": self.reminder_time_chieu,
            "toi": self.reminder_time_toi,
            "truoc_ngu": self.reminder_time_truoc_ngu,
        }

    @property
    def origins(self) -> list[str]:
        base = [o.strip() for o in self.allowed_origins.split(",") if o.strip()]
        if self.app_url:
            clean_app_url = self.app_url.strip().rstrip("/")
            if clean_app_url and clean_app_url not in base:
                base.append(clean_app_url)
        return base

    @property
    def public_key(self) -> str:
        return self.supabase_publishable_key or self.supabase_secret_key


@lru_cache
def get_settings() -> Settings:
    return Settings()


SETTINGS_FILE = ROOT / "backend" / "settings.json"


def get_custom_slot_times() -> dict[str, str]:
    """Lấy danh sách giờ đã lưu; nếu chưa có thì dùng từ config."""
    s = get_settings()
    defaults = s.slot_times
    if SETTINGS_FILE.is_file():
        try:
            import json
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f).get("slot_times", {})
                for k in defaults:
                    if k in saved and isinstance(saved[k], str) and len(saved[k]) == 5:
                        defaults[k] = saved[k]
        except Exception:
            pass
    return defaults


def save_custom_slot_times(new_slots: dict[str, str]) -> dict[str, str]:
    """Lưu khung giờ tùy chỉnh mới do admin thiết lập trên web."""
    import json
    current = get_custom_slot_times()
    for k, v in new_slots.items():
        if k in current and isinstance(v, str) and len(v) == 5:
            current[k] = v.strip()
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump({"slot_times": current}, f, ensure_ascii=False, indent=2)
    return current
