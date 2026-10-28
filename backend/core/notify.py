"""Multi-channel notification engine: in-app + email + WhatsApp + Telegram.

* The in-app notification is always created immediately.
* External channels (email / WhatsApp / Telegram) are sent in a background thread
  (settings.NOTIFY_ASYNC) so a message to hundreds of people never blocks the request.
* `channels=None`  -> each user's own preferences (automatic reminders).
  `channels=[...]` -> the channels chosen by the sender (manual messages), for users who have the contact info.
"""
import logging
import re
from concurrent.futures import ThreadPoolExecutor

import requests
from django.conf import settings
from django.core.mail import send_mail
from django.db import close_old_connections, connection

from .models import Notification, SchoolSettings

log = logging.getLogger("core.notify")
CHANNELS = ("email", "whatsapp", "telegram")
_pool = ThreadPoolExecutor(max_workers=3)  # few DB connections at once


# ---------------------------------------------------------------- config
def cfg():
    """School settings with .env fallbacks."""
    s = SchoolSettings.get()
    return {
        "name": s.name or settings.SCHOOL_NAME,
        "country_code": s.country_code or "213",
        "email_enabled": s.email_enabled,
        "tg_token": s.telegram_bot_token or settings.TELEGRAM_BOT_TOKEN,
        "tg_username": s.telegram_bot_username or settings.TELEGRAM_BOT_USERNAME,
        "wa_provider": s.whatsapp_provider or settings.WHATSAPP_PROVIDER,
        "wa_token": s.whatsapp_token or settings.WHATSAPP_TOKEN,
        "wa_id": s.whatsapp_phone_id or settings.WHATSAPP_PHONE_ID,
        "wa_from": s.whatsapp_from,
        "wa_template": s.whatsapp_template,
        "wa_template_lang": s.whatsapp_template_lang or "ar",
    }


def channel_status(c=None):
    """Which external channels are ready to use (shown in the Settings page and the composer)."""
    c = c or cfg()
    return {
        "email": bool(c["email_enabled"] and getattr(settings, "EMAIL_CONFIGURED", False)),
        "whatsapp": bool(c["wa_provider"] and c["wa_token"] and c["wa_id"]),
        "telegram": bool(c["tg_token"]),
    }


def normalize_phone(phone, country_code="213"):
    """'0555 12 34 56' -> '213555123456' ; '+213555123456' -> '213555123456'."""
    digits = re.sub(r"\D", "", phone or "")
    if not digits:
        return ""
    if (phone or "").strip().startswith("+") or digits.startswith("00"):
        return digits.lstrip("0") if digits.startswith("00") else digits
    if digits.startswith("0"):
        return country_code + digits[1:]
    if digits.startswith(country_code):
        return digits
    return country_code + digits


# ---------------------------------------------------------------- channels
def _email(user, title, body, c):
    if not user.email:
        raise RuntimeError("no email address")
    send_mail(f"[{c['name']}] {title}", body, None, [user.email])


def _whatsapp(user, text, c):
    to = normalize_phone(user.phone, c["country_code"])
    if not to:
        raise RuntimeError("no phone number")
    p = c["wa_provider"]
    if p == "meta":
        url = f"https://graph.facebook.com/v20.0/{c['wa_id']}/messages"
        if c["wa_template"]:  # business-initiated messages must use an approved template
            payload = {"messaging_product": "whatsapp", "to": to, "type": "template", "template": {
                "name": c["wa_template"], "language": {"code": c["wa_template_lang"]},
                "components": [{"type": "body", "parameters": [{"type": "text", "text": text[:1000]}]}]}}
        else:
            payload = {"messaging_product": "whatsapp", "to": to, "type": "text", "text": {"body": text}}
        r = requests.post(url, headers={"Authorization": f"Bearer {c['wa_token']}"}, json=payload, timeout=15)
    elif p == "twilio":
        r = requests.post(f"https://api.twilio.com/2010-04-01/Accounts/{c['wa_id']}/Messages.json",
                          auth=(c["wa_id"], c["wa_token"]),
                          data={"From": c["wa_from"] if c["wa_from"].startswith("whatsapp:") else f"whatsapp:{c['wa_from']}",
                                "To": f"whatsapp:+{to}", "Body": text}, timeout=15)
    elif p == "ultramsg":
        r = requests.post(f"https://api.ultramsg.com/{c['wa_id']}/messages/chat",
                          data={"token": c["wa_token"], "to": f"+{to}", "body": text}, timeout=15)
    else:
        raise RuntimeError("whatsapp not configured")
    if r.status_code >= 400:
        raise RuntimeError(f"whatsapp {r.status_code}: {r.text[:150]}")
    if p == "ultramsg" and '"error"' in r.text:
        raise RuntimeError(f"whatsapp: {r.text[:150]}")


def telegram_send(chat_id, text, token, markup=None):
    body = {"chat_id": chat_id, "text": text}
    if markup: body["reply_markup"] = markup
    r = requests.post(f"https://api.telegram.org/bot{token}/sendMessage", json=body, timeout=15)
    if r.status_code >= 400:
        raise RuntimeError(f"telegram {r.status_code}: {r.text[:150]}")


def _telegram(user, text, c):
    if not c["tg_token"]:
        raise RuntimeError("telegram not configured")
    if not user.telegram_chat_id:
        raise RuntimeError("telegram not linked")
    telegram_send(user.telegram_chat_id, text, c["tg_token"])


# ---------------------------------------------------------------- dispatch
def _wanted(user, channels, ready):
    if channels is None:  # automatic -> user preferences
        prefs = {"email": user.notify_email, "whatsapp": user.notify_whatsapp, "telegram": user.notify_telegram}
        out = [ch for ch in CHANNELS if prefs[ch]]
    else:  # chosen by the sender -> only where the user has the contact info
        has = {"email": bool(user.email), "whatsapp": bool(user.phone), "telegram": bool(user.telegram_chat_id)}
        out = [ch for ch in CHANNELS if ch in channels and has[ch]]
    return [ch for ch in out if ready[ch]]


def _deliver(notif_id, user, title, body, chans, c):
    ok, failed, errors = [], [], []
    text = f"{c['name']}\n{title}\n\n{body}"
    for ch in chans:
        try:
            if ch == "email":
                _email(user, title, body, c)
            elif ch == "whatsapp":
                _whatsapp(user, text, c)
            elif ch == "telegram":
                _telegram(user, text, c)
            ok.append(ch)
        except Exception as e:  # never break the loop for one bad contact
            # network errors contain the API URL (= secret token): keep only the error type
            failed.append(ch); errors.append(f"{ch}: {e if isinstance(e, RuntimeError) else type(e).__name__}")
            log.warning("notify %s -> %s failed: %s", user.username, ch, e)
    n = Notification.objects.get(pk=notif_id)
    n.channels_ok = ",".join(["app"] + ok)
    n.channels_failed = ",".join(failed)
    n.channels_pending = ""
    n.error = "; ".join(errors)[:255]
    n.save(update_fields=["channels_ok", "channels_failed", "channels_pending", "error"])


def _deliver_bg(*args):
    close_old_connections()
    try:
        _deliver(*args)
    except Exception:
        log.exception("background delivery failed")
    finally:
        connection.close()  # give the DB connection back immediately (Supabase pool limit)


def notify(user, title, body, kind="info", channels=None, announcement=None, _c=None, _ready=None, external_body=None):
    """Send one message to one user. Never raises. Returns the in-app Notification.
    external_body: text sent by email/WhatsApp/Telegram when it must differ from the stored in-app text (e.g. a password)."""
    c = _c or cfg()
    ready = _ready or channel_status(c)
    chans = _wanted(user, channels, ready)
    n = Notification.objects.create(user=user, title=title, body=body, kind=kind, announcement=announcement,
                                    channels_ok="app", channels_pending=",".join(chans))
    if chans:
        if settings.NOTIFY_ASYNC:
            # run after the DB transaction commits so the thread can see the row
            from django.db import transaction
            transaction.on_commit(lambda: _pool.submit(_deliver_bg, n.id, user, title, external_body or body, chans, c))
        else:
            _deliver(n.id, user, title, external_body or body, chans, c)
            n.refresh_from_db()
    return n


def notify_many(users, title, body, kind="info", channels=None, announcement=None):
    c = cfg(); ready = channel_status(c)
    return [notify(u, title, body, kind, channels, announcement, _c=c, _ready=ready) for u in users]


def test_channel(user, channel):
    """Synchronous single-channel test used by the Settings page. Returns (ok, error)."""
    c = cfg()
    try:
        if channel == "email":
            _email(user, "رسالة تجريبية / Test", "✅ Email channel works.", c)
        elif channel == "whatsapp":
            _whatsapp(user, f"{c['name']}\n✅ WhatsApp channel works.", c)
        elif channel == "telegram":
            _telegram(user, f"{c['name']}\n✅ Telegram channel works.", c)
        else:
            return False, "unknown channel"
        return True, ""
    except Exception as e:
        return False, str(e) if isinstance(e, RuntimeError) else f"{type(e).__name__} (network / internet)"

