from datetime import date as _date, datetime, timedelta

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.crypto import get_random_string
from rest_framework import decorators, permissions, response, status, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError

from . import services
from .models import *
from .notify import cfg, channel_status, telegram_send, test_channel
from .permissions import *
from .profiles import student_profile
from .serializers import *


def _date_param(request, key):
    raw = request.query_params.get(key)
    if not raw: return None
    try: return _date.fromisoformat(raw[:10])
    except ValueError: raise ValidationError({key: "invalid date"})


def teacher_students(teacher):
    """Students a teacher teaches = students of his classes subscribed (active) to the module he teaches there."""
    rows = {}
    for t in Teaching.objects.filter(teacher=teacher).select_related("group__level", "module"):
        subs = Subscription.objects.filter(module=t.module, active=True, student__class_groups=t.group,
                                           student__is_active=True).select_related("student")
        for s in subs:
            st = s.student
            r = rows.setdefault(st.id, {"id": st.id, "name": st.display_name(), "username": st.username,
                                        "phone": st.phone, "email": st.email, "telegram_linked": bool(st.telegram_chat_id),
                                        "groups": [], "group_ids": [], "modules": []})
            if t.group_id not in r["group_ids"]:
                r["group_ids"].append(t.group_id); r["groups"].append(t.group.name)
            r["modules"].append({"name": t.module.name, "name_ar": t.module.name_ar, "group": t.group.name})
    return sorted(rows.values(), key=lambda r: r["name"])


# ======================================================================= users
class UserViewSet(viewsets.ModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        qs = User.objects.all().order_by("first_name", "last_name", "id").prefetch_related("class_groups__level", "children")
        p = self.request.query_params
        if p.get("role"): qs = qs.filter(role__in=p["role"].split(","))
        if p.get("group"): qs = qs.filter(class_groups=p["group"])
        return qs

    def perform_create(self, ser):
        u = ser.save()
        if str(self.request.data.get("send_welcome", "")).lower() in ("true", "1"):
            services.send_welcome(u, getattr(u, "_plain_password", ""), self.request.build_absolute_uri("/"))

    @decorators.action(detail=True, methods=["post"])
    def welcome(self, request, pk=None):
        """Re-send the login details (with a NEW password) + Telegram link."""
        u = self.get_object()
        pw = get_random_string(8, "abcdefghjkmnpqrstuvwxyz23456789"); u.set_password(pw); u.save()
        return response.Response({"channels": services.send_welcome(u, pw, request.build_absolute_uri("/")), "password": pw})

    def perform_destroy(self, inst):
        if inst == self.request.user:
            raise ValidationError("You cannot delete your own account.")
        if inst.is_superuser and not self.request.user.is_superuser:
            raise PermissionDenied()
        from django.db.models import ProtectedError
        try:
            inst.delete()
        except ProtectedError:  # teacher with sessions -> deactivate instead of losing history
            inst.is_active = False; inst.save(update_fields=["is_active"])

    @decorators.action(detail=False, methods=["get", "patch"], permission_classes=[permissions.IsAuthenticated])
    def me(self, request):
        if request.method == "PATCH":
            ser = MeSerializer(request.user, data=request.data, partial=True)
            ser.is_valid(raise_exception=True); ser.save()
        return response.Response(MeSerializer(request.user).data)

    @decorators.action(detail=False, methods=["post"], permission_classes=[permissions.IsAuthenticated], url_path="me/password")
    def change_password(self, request):
        u = request.user
        if not u.check_password(request.data.get("old_password", "")):
            return response.Response({"old_password": "wrong"}, 400)
        new = request.data.get("new_password", "")
        if len(new) < 8:
            return response.Response({"new_password": "min 8"}, 400)
        u.set_password(new); u.save()
        return response.Response({"ok": True})

    @decorators.action(detail=False, methods=["get", "post", "delete"], permission_classes=[permissions.IsAuthenticated], url_path="me/telegram")
    def telegram(self, request):
        u = request.user
        if request.method == "POST":
            # "I pressed Start": fetch the bot's new messages right now (works without HTTPS and without the scheduler)
            status = "linked"
            if not u.telegram_chat_id:
                token = cfg()["tg_token"]
                if not token:
                    return response.Response({"linked": False, "status": "no_bot"})
                status = poll_telegram_once(token)
                if status == "webhook" and not SchoolSettings.get().telegram_webhook_secret:
                    # a webhook we did not register (or an old one) blocks reading messages -> remove it
                    import requests as rq
                    try: rq.get(f"https://api.telegram.org/bot{token}/deleteWebhook", timeout=15)
                    except Exception: pass
                    status = poll_telegram_once(token)
                u.refresh_from_db()
                if u.telegram_chat_id: status = "linked"
            return response.Response({"linked": bool(u.telegram_chat_id), "status": status})
        if request.method == "DELETE":
            u.telegram_chat_id = ""; u.notify_telegram = False; u.save(update_fields=["telegram_chat_id", "notify_telegram"])
            return response.Response({"ok": True})
        bot = cfg()["tg_username"]
        if not bot:
            return response.Response({"link": None, "linked": bool(u.telegram_chat_id)})
        if not u.telegram_link_token:
            u.telegram_link_token = get_random_string(24); u.save(update_fields=["telegram_link_token"])
        return response.Response({"link": f"https://t.me/{bot.lstrip('@')}?start={u.telegram_link_token}",
                                  "linked": bool(u.telegram_chat_id)})

    @decorators.action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        u = self.get_object()
        pw = request.data.get("password") or get_random_string(8, "abcdefghjkmnpqrstuvwxyz23456789")
        u.set_password(pw); u.save()
        return response.Response({"password": pw})


def simple(model, ser, perm=IsAdminOrReadOnly):
    return type(f"{model.__name__}VS", (viewsets.ModelViewSet,),
                {"queryset": model.objects.all(), "serializer_class": ser, "permission_classes": [perm]})


LevelViewSet = simple(Level, LevelSerializer)
RoomViewSet = simple(Room, RoomSerializer)


class GroupViewSet(viewsets.ModelViewSet):
    serializer_class = GroupSerializer
    permission_classes = [IsAdminOrReadOnly]
    def get_queryset(self):
        qs = Group.objects.select_related("level").order_by("level__order", "name")
        u = self.request.user
        if u.role == "teacher": qs = qs.filter(teachings__teacher=u).distinct()
        return qs


class ModuleViewSet(viewsets.ModelViewSet):
    serializer_class = ModuleSerializer
    permission_classes = [IsAdminOrReadOnly]
    def get_queryset(self):
        qs = Module.objects.select_related("level").prefetch_related("teachers").order_by("level__order", "name")
        p = self.request.query_params
        if p.get("level"): qs = qs.filter(level_id=p["level"])
        if p.get("used"): qs = qs.filter(Q(teachings__isnull=False) | Q(subscriptions__isnull=False)).distinct()
        if self.request.user.role == "teacher": qs = qs.filter(teachings__teacher=self.request.user).distinct()
        return qs


# ======================================================================= sessions
class SessionViewSet(viewsets.ModelViewSet):
    serializer_class = SessionSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        u = self.request.user
        qs = Session.objects.select_related("module", "group", "teacher", "room")
        if u.role in ("student", "parent"):
            kids = [u] if u.role == "student" else list(u.children.all())
            subs = Subscription.objects.filter(student__in=kids, active=True)
            cond = Q()
            for sub in subs:  # session of a class the student is in, for a module he subscribed to
                cond |= Q(module_id=sub.module_id, group__students=sub.student_id)
            qs = qs.filter(cond).distinct() if subs.exists() else qs.none()
        elif u.role == "teacher":
            qs = qs.filter(teacher=u)
        p = self.request.query_params
        d1, d2 = _date_param(self.request, "from"), _date_param(self.request, "to")
        if d1: qs = qs.filter(start__date__gte=d1)
        if d2: qs = qs.filter(start__date__lte=d2)
        for k in ("group", "teacher", "room", "status"):
            if p.get(k): qs = qs.filter(**{k: p[k]})
        return qs.order_by("start")

    def create(self, request, *a, **kw):
        """Optional `repeat_weeks` (1-40): also creates the same session every following week (conflicts skipped)."""
        weeks = max(0, min(int(request.data.get("repeat_weeks") or 0), 40))
        ser = self.get_serializer(data=request.data); ser.is_valid(raise_exception=True)
        with transaction.atomic():
            first = ser.save()
            made, skipped = 1, []
            for w in range(1, weeks + 1):
                s = Session(module=first.module, group=first.group, teacher=first.teacher, room=first.room,
                            topic=first.topic, start=first.start + timedelta(weeks=w), end=first.end + timedelta(weeks=w))
                if s.conflicts().exists() or Closure.objects.filter(date=timezone.localtime(s.start).date()).filter(
                        Q(group__isnull=True) | Q(group=s.group)).exists():
                    skipped.append(timezone.localtime(s.start).strftime("%d/%m/%Y")); continue
                s.save(); made += 1
        data = self.get_serializer(first).data
        data.update({"created": made, "skipped": skipped})
        return response.Response(data, status=201)

    def _own(self, s):
        u = self.request.user
        if u.role == "teacher" and s.teacher_id != u.id:
            raise PermissionDenied()
        return s

    @decorators.action(detail=True, methods=["post"], permission_classes=[IsStaffRole])
    def cancel(self, request, pk=None):
        reason = (request.data.get("reason") or "").strip()
        if not reason: return response.Response({"reason": "required"}, 400)
        s = self._own(self.get_object())
        if s.status == "cancelled": return response.Response({"detail": "already cancelled"}, 400)
        n = services.cancel_session(s, reason, request.data.get("channels"))
        return response.Response({"status": "cancelled", "notified": n})

    @decorators.action(detail=True, methods=["post"], permission_classes=[IsStaffRole])
    def remind(self, request, pk=None):
        """Teacher/admin reminds the students (and parents) of this session right now."""
        s = self._own(self.get_object())
        if s.status != "planned": return response.Response({"detail": "session not planned"}, 400)
        n = services.remind_session(s, (request.data.get("note") or "").strip(), request.data.get("channels"),
                                    request.data.get("include_parents", True))
        return response.Response({"notified": n})

    @decorators.action(detail=True, methods=["post"], permission_classes=[IsAdmin])
    def restore(self, request, pk=None):
        s = self.get_object(); s.status = "planned"; s.cancel_reason = ""; s.save()
        return response.Response(SessionSerializer(s).data)

    @decorators.action(detail=True, methods=["get"], permission_classes=[IsStaffRole])
    def students(self, request, pk=None):
        s = self._own(self.get_object())
        return response.Response([{"id": u.id, "name": u.display_name()} for u in s.roster()])

    @decorators.action(detail=True, methods=["post"], permission_classes=[IsStaffRole])
    def attendance(self, request, pk=None):
        """body: [{"student": 1, "present": false, "late_minutes": 0}] ; absence alert only when it changes."""
        s = self._own(self.get_object())
        if s.status == "cancelled": return response.Response({"detail": "session cancelled"}, 400)
        allowed = set(s.roster().values_list("id", flat=True))
        alerts = 0
        for row in request.data:
            if row.get("student") not in allowed: continue
            prev = Attendance.objects.filter(session=s, student_id=row["student"]).first()
            a, _ = Attendance.objects.update_or_create(
                session=s, student_id=row["student"],
                defaults={"present": bool(row.get("present", True)), "late_minutes": int(row.get("late_minutes") or 0),
                          "note": (row.get("note") or "")[:200]})
            if not a.present and (prev is None or prev.present):
                services.absence_alert(a); alerts += 1
        if s.end < timezone.now() and s.status == "planned":
            s.status = "done"; s.save(update_fields=["status"])
        return response.Response({"saved": len(request.data), "alerts": alerts})


# ======================================================================= grades
class GradeViewSet(viewsets.ModelViewSet):
    serializer_class = GradeSerializer

    def get_permissions(self):
        return [IsAdminOrReadOnly()] if self.request.user.role in ("student", "parent") else [IsStaffRole()]

    def get_queryset(self):
        u, p = self.request.user, self.request.query_params
        qs = Grade.objects.select_related("student", "module").order_by("-date", "-id")
        if u.role == "student": qs = qs.filter(student=u)
        elif u.role == "parent": qs = qs.filter(student__in=u.children.all())
        elif u.role == "teacher":
            pairs = Teaching.objects.filter(teacher=u)
            cond = Q(pk__in=[])
            for t in pairs: cond |= Q(module_id=t.module_id, student__class_groups=t.group_id)
            qs = qs.filter(cond).distinct()
        if p.get("student"): qs = qs.filter(student_id=p["student"])
        if p.get("module"): qs = qs.filter(module_id=p["module"])
        if p.get("group"): qs = qs.filter(student__class_groups=p["group"])
        return qs

    def _check(self, ser):
        u = self.request.user
        if u.role == "teacher":
            st = ser.validated_data.get("student") or ser.instance.student
            mod = ser.validated_data.get("module") or ser.instance.module
            if not Teaching.objects.filter(teacher=u, module=mod, group__students=st).exists():
                raise PermissionDenied("You do not teach this module to this student.")

    def perform_create(self, ser): self._check(ser); ser.save()
    def perform_update(self, ser): self._check(ser); ser.save()

    @decorators.action(detail=False, methods=["post"], permission_classes=[IsStaffRole])
    def bulk(self, request):
        """Enter one exam for a whole class: {module, title, out_of, date, scores: [{student, score}]}"""
        mod = get_object_or_404(Module, pk=request.data.get("module"))
        out_of = request.data.get("out_of") or 20
        d = request.data.get("date") or timezone.localdate().isoformat()
        title = (request.data.get("title") or "").strip()
        if not title: return response.Response({"title": "required"}, 400)
        n = 0
        for row in request.data.get("scores", []):
            if row.get("score") in (None, ""): continue
            ser = GradeSerializer(data={"student": row["student"], "module": mod.id, "title": title,
                                        "score": row["score"], "out_of": out_of, "date": d})
            ser.is_valid(raise_exception=True); self._check(ser)
            Grade.objects.update_or_create(student_id=row["student"], module=mod, title=title,
                                           defaults={"score": ser.validated_data["score"], "out_of": out_of, "date": d})
            n += 1
        return response.Response({"saved": n})


# ======================================================================= payments
class PaymentViewSet(viewsets.ModelViewSet):
    serializer_class = PaymentSerializer

    def get_permissions(self):
        return [IsAdminOrReadOnly()] if self.request.user.role in ("student", "parent") else [IsAdmin()]

    def get_queryset(self):
        u, p = self.request.user, self.request.query_params
        qs = Payment.objects.select_related("student").order_by("-due_date", "student__first_name")
        if u.role == "student": qs = qs.filter(student=u)
        elif u.role == "parent": qs = qs.filter(student__in=u.children.all())
        st = p.get("status")
        today = timezone.localdate()
        if st == "paid": qs = qs.filter(paid_on__isnull=False)
        elif st == "unpaid": qs = qs.filter(paid_on__isnull=True)
        elif st == "late": qs = qs.filter(paid_on__isnull=True, due_date__lt=today)
        if p.get("student"): qs = qs.filter(student_id=p["student"])
        if p.get("group"): qs = qs.filter(student__class_groups=p["group"])
        return qs

    @decorators.action(detail=True, methods=["post"])
    def pay(self, request, pk=None):
        pm = self.get_object()
        pm.paid_on = None if pm.paid_on else timezone.localdate(); pm.save(update_fields=["paid_on"])
        return response.Response(PaymentSerializer(pm).data)

    @decorators.action(detail=False, methods=["post"])
    def generate(self, request):
        label = (request.data.get("label") or "").strip()
        due = request.data.get("due_date")
        if not label or not due: return response.Response({"detail": "label and due_date required"}, 400)
        g = Group.objects.filter(pk=request.data.get("group")).first() if request.data.get("group") else None
        return response.Response({"created": services.generate_monthly_payments(label, _date.fromisoformat(due), g)})

    @decorators.action(detail=False, methods=["post"])
    def remind(self, request):
        return response.Response({"reminded": services.send_payment_reminders(days_before=int(request.data.get("days", 3)))})

    @decorators.action(detail=False, methods=["get"])
    def summary(self, request):
        qs = self.get_queryset()
        today = timezone.localdate()
        agg = lambda q: q.aggregate(s=Sum("amount"))["s"] or 0
        return response.Response({
            "paid": agg(qs.filter(paid_on__isnull=False)), "unpaid": agg(qs.filter(paid_on__isnull=True)),
            "late": agg(qs.filter(paid_on__isnull=True, due_date__lt=today)),
            "paid_this_month": agg(qs.filter(paid_on__year=today.year, paid_on__month=today.month)),
            "count_unpaid": qs.filter(paid_on__isnull=True).count()})


# ======================================================================= messages
class AnnouncementViewSet(viewsets.ModelViewSet):
    """Messages. Admin/staff: anyone. Teacher: only his classes, his sessions, his students."""
    serializer_class = AnnouncementSerializer
    permission_classes = [IsStaffRole]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        u = self.request.user
        qs = Announcement.objects.select_related("created_by", "audience_group", "audience_session__module",
                                                 "audience_session__group").prefetch_related("audience_users", "notifications")
        return qs if u.is_manager else qs.filter(created_by=u)

    def perform_create(self, ser):
        u = self.request.user
        d = ser.validated_data
        if not u.is_manager:
            my_groups = set(Teaching.objects.filter(teacher=u).values_list("group_id", flat=True))
            my_students = {r["id"] for r in teacher_students(u)}
            g, s, users = d.get("audience_group"), d.get("audience_session"), d.get("audience_users", [])
            if not (g or s or users):
                raise ValidationError("Choose a class, a session or students.")
            if g and g.id not in my_groups: raise PermissionDenied("Not your class.")
            if s and s.teacher_id != u.id: raise PermissionDenied("Not your session.")
            if any(x.id not in my_students for x in users): raise PermissionDenied("Not your student.")
            if d.get("audience_role") not in ("", None, "student", "parent"):
                raise PermissionDenied()
        a = ser.save(created_by=u)
        services.send_message(a)

    def destroy(self, request, *a, **kw):
        if not request.user.is_manager: raise PermissionDenied()
        return super().destroy(request, *a, **kw)

    @decorators.action(detail=False, methods=["post"])
    def preview(self, request):
        """How many people would receive this message (without sending)."""
        ser = self.get_serializer(data={**request.data, "title": request.data.get("title") or "x", "body": request.data.get("body") or "x"})
        ser.is_valid(raise_exception=True)
        d = dict(ser.validated_data); users = d.pop("audience_users", [])
        a = Announcement(**d, created_by=request.user)
        people = services.message_audience(a, chosen=[u for u in users if u.is_active])
        counts = {}
        for p in people: counts[p.role] = counts.get(p.role, 0) + 1
        return response.Response({"total": len(people), "by_role": counts})


class ClosureViewSet(viewsets.ModelViewSet):
    queryset = Closure.objects.select_related("group").order_by("-date"); serializer_class = ClosureSerializer
    permission_classes = [IsAdmin]
    http_method_names = ["get", "post", "delete", "head", "options"]
    def perform_create(self, ser):
        services.apply_closure(ser.save())


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer
    def get_queryset(self):
        qs = Notification.objects.filter(user=self.request.user)
        if self.request.query_params.get("unread"): qs = qs.filter(read=False)
        limit = self.request.query_params.get("limit")
        return qs[:int(limit)] if limit else qs[:300]
    @decorators.action(detail=False, methods=["post"])
    def read_all(self, request):
        Notification.objects.filter(user=request.user, read=False).update(read=True); return response.Response({"ok": True})
    @decorators.action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        Notification.objects.filter(user=request.user, pk=pk).update(read=True); return response.Response({"ok": True})
    @decorators.action(detail=False, methods=["get"])
    def count(self, request):
        return response.Response({"unread": Notification.objects.filter(user=request.user, read=False).count()})


# ======================================================================= dashboard
@decorators.api_view(["GET"])
def dashboard(request):
    u = request.user
    today = timezone.localdate()
    out = {"unread": Notification.objects.filter(user=u, read=False).count(), "role": "admin" if u.is_manager else u.role}
    if u.is_manager:
        pay = Payment.objects.all()
        out.update({
            "students": User.objects.filter(role="student", is_active=True).count(),
            "teachers": User.objects.filter(role="teacher", is_active=True).count(),
            "parents": User.objects.filter(role="parent", is_active=True).count(),
            "groups": Group.objects.count(),
            "subscriptions": Subscription.objects.filter(active=True).count(),
            "unpaid": pay.filter(paid_on__isnull=True).count(),
            "unpaid_amount": pay.filter(paid_on__isnull=True).aggregate(s=Sum("amount"))["s"] or 0,
            "late_amount": pay.filter(paid_on__isnull=True, due_date__lt=today).aggregate(s=Sum("amount"))["s"] or 0,
            "paid_month": pay.filter(paid_on__year=today.year, paid_on__month=today.month).aggregate(s=Sum("amount"))["s"] or 0,
            "messages_week": Announcement.objects.filter(created_at__date__gte=today - timedelta(days=7)).count(),
            "channels": channel_status(),
        })
    if u.is_manager or u.role == "teacher":
        att = Attendance.objects.filter(session__start__date__gte=today - timedelta(days=13), session__start__date__lte=today)
        if u.role == "teacher": att = att.filter(session__teacher=u)
        by_day = {r["d"]: r for r in att.values(d=TruncDate("session__start", tzinfo=timezone.get_current_timezone())).annotate(total=Count("id"), present=Count("id", filter=Q(present=True)))}
        out["attendance_chart"] = [{"date": str(today - timedelta(days=i)),
                                    "rate": round(100 * by_day[today - timedelta(days=i)]["present"] / by_day[today - timedelta(days=i)]["total"], 1)
                                    if today - timedelta(days=i) in by_day else None} for i in range(13, -1, -1)]
        top = Attendance.objects.filter(present=False, session__start__date__gte=today - timedelta(days=30))
        if u.role == "teacher": top = top.filter(session__teacher=u)
        out["most_absent"] = [{"id": r["student"], "name": f'{r["student__first_name"]} {r["student__last_name"]}', "absences": r["n"]}
                              for r in top.values("student", "student__first_name", "student__last_name").annotate(n=Count("id")).order_by("-n")[:5]]
    if u.role == "teacher":
        out["my_students"] = len(teacher_students(u))
        out["my_groups"] = Teaching.objects.filter(teacher=u).values("group").distinct().count()
    if u.role in ("student", "parent"):
        kids = [u] if u.role == "student" else list(u.children.all())
        pays = Payment.objects.filter(student__in=kids, paid_on__isnull=True)
        out["due_payments"] = PaymentSerializer(pays.order_by("due_date")[:5], many=True).data
        grades = Grade.objects.filter(student__in=kids).select_related("module", "student").order_by("-date", "-id")[:6]
        out["recent_grades"] = GradeSerializer(grades, many=True).data
        abs_ = Attendance.objects.filter(student__in=kids)
        out["absences"] = abs_.filter(present=False).count()
        out["attendance_rate"] = round(100 * abs_.filter(present=True).count() / abs_.count(), 1) if abs_.exists() else None
    return response.Response(out)


@decorators.api_view(["POST"])
@decorators.permission_classes([IsAdmin])
def run_daily(request):
    return response.Response(services.daily_job(force=True))


@decorators.api_view(["GET"])
@decorators.permission_classes([IsStaffRole])
def students_list(request):
    u = request.user
    if u.role == "teacher":
        return response.Response([{"id": r["id"], "name": r["name"]} for r in teacher_students(u)])
    qs = User.objects.filter(role="student", is_active=True).order_by("first_name", "last_name")
    if request.query_params.get("group"): qs = qs.filter(class_groups=request.query_params["group"])
    return response.Response([{"id": x.id, "name": x.display_name()} for x in qs])


@decorators.api_view(["GET"])
@decorators.permission_classes([IsStaffRole])
def my_students(request):
    """Teacher: the students he teaches (with class and modules). Admin: ?teacher=<id>."""
    u = request.user
    if u.is_manager and request.query_params.get("teacher"):
        u = get_object_or_404(User, pk=request.query_params["teacher"], role="teacher")
    return response.Response(teacher_students(u))


class TeachingViewSet(viewsets.ModelViewSet):
    serializer_class = TeachingSerializer
    permission_classes = [IsAdminOrReadOnly]
    def get_queryset(self):
        qs = Teaching.objects.select_related("group__level", "module", "teacher").order_by("group__name", "module__name")
        p = self.request.query_params
        if p.get("group"): qs = qs.filter(group_id=p["group"])
        if p.get("teacher"): qs = qs.filter(teacher_id=p["teacher"])
        if self.request.user.role == "teacher": qs = qs.filter(teacher=self.request.user)
        return qs
    def perform_create(self, ser):
        t = ser.save(); t.module.teachers.add(t.teacher)
    def perform_update(self, ser):
        t = ser.save(); t.module.teachers.add(t.teacher)


@decorators.api_view(["GET"])
def my_profile(request):
    """Student -> own modules/teachers/level. Parent -> same for each child."""
    u = request.user
    studs = [u] if u.role == "student" else list(u.children.all()) if u.role == "parent" else []
    return response.Response([student_profile(s) for s in studs])


@decorators.api_view(["GET"])
@decorators.permission_classes([IsStaffRole])
def student_profile_view(request, pk):
    st = get_object_or_404(User, pk=pk, role="student")
    if request.user.role == "teacher" and pk not in {r["id"] for r in teacher_students(request.user)}:
        raise PermissionDenied()
    data = student_profile(st)
    att = Attendance.objects.filter(student=st)
    data.update({
        "phone": st.phone, "email": st.email,
        "parents": [{"id": p.id, "name": p.display_name(), "phone": p.phone} for p in st.parents.all()],
        "attendance": {"total": att.count(), "absent": att.filter(present=False).count(),
                       "late": att.filter(late_minutes__gt=0).count()},
        "grades": GradeSerializer(Grade.objects.filter(student=st).select_related("module").order_by("-date"), many=True).data,
        "payments": PaymentSerializer(Payment.objects.filter(student=st).order_by("-due_date"), many=True).data
        if request.user.is_manager else [],
    })
    return response.Response(data)


@decorators.api_view(["GET"])
def my_teaching(request):
    """Teacher -> modules/classes they teach."""
    rows = Teaching.objects.filter(teacher=request.user).select_related("group__level", "module")
    out = []
    for t in rows:
        n = Subscription.objects.filter(module=t.module, active=True, student__class_groups=t.group).count()
        out.append({"id": t.id, "module": t.module.name, "module_ar": t.module.name_ar, "group": t.group.name, "group_id": t.group_id,
                    "year": t.group.year, "level": t.group.level.name, "level_ar": t.group.level.name_ar,
                    "module_id": t.module_id, "students": n})
    return response.Response(out)


class SubscriptionViewSet(viewsets.ModelViewSet):
    serializer_class = SubscriptionSerializer
    permission_classes = [IsAdminOrReadOnly]
    def get_queryset(self):
        u, p = self.request.user, self.request.query_params
        qs = Subscription.objects.select_related("student", "module__level").prefetch_related("student__class_groups")
        if u.role == "student": qs = qs.filter(student=u)
        elif u.role == "parent": qs = qs.filter(student__in=u.children.all())
        elif u.role == "teacher": qs = qs.filter(module__teachings__teacher=u)
        if p.get("student"): qs = qs.filter(student_id=p["student"])
        if p.get("module"): qs = qs.filter(module_id=p["module"])
        if p.get("group"): qs = qs.filter(student__class_groups=p["group"])
        return qs.distinct()
    @decorators.action(detail=False, methods=["post"], permission_classes=[IsAdmin])
    def bulk(self, request):
        """body: {"group": 1, "modules": [1,2], "monthly_fee": 2000} -> subscribes every student of the class."""
        g = get_object_or_404(Group, pk=request.data.get("group"))
        mods = Module.objects.filter(pk__in=request.data.get("modules", []), level=g.level)
        fee = request.data.get("monthly_fee") or 0
        created = 0
        for st in g.students.all():
            for m in mods:
                _, c = Subscription.objects.get_or_create(student=st, module=m, defaults={"monthly_fee": fee})
                created += c
        return response.Response({"created": created})


def _daily(user, day):
    """Sessions of a day with the students expected (subscribed) and their attendance status."""
    qs = Session.objects.filter(start__date=day).select_related("module", "group__level", "teacher", "room")
    if user.role == "teacher": qs = qs.filter(teacher=user)
    marks = {(a.session_id, a.student_id): a for a in Attendance.objects.filter(session__in=qs)}
    sessions, absent = [], 0
    for s in qs.order_by("start"):
        studs = []
        for st in s.roster():
            a = marks.get((s.id, st.id))
            if a and not a.present and s.status != "cancelled": absent += 1
            studs.append({"id": st.id, "name": st.display_name(),
                          "present": a.present if a else None, "late_minutes": a.late_minutes if a else 0})
        sessions.append({"id": s.id, "start": s.start, "end": s.end, "status": s.status, "cancel_reason": s.cancel_reason,
                         "module_name": s.module.name, "module_name_ar": s.module.name_ar,
                         "group_name": s.group.name, "level_name": s.group.level.name, "level_name_ar": s.group.level.name_ar,
                         "teacher_name": s.teacher.display_name(), "teacher": s.teacher_id,
                         "room_name": s.room.name if s.room else "", "topic": s.topic,
                         "marked": any((s.id, x["id"]) in marks for x in studs), "students": studs})
    active = [s for s in sessions if s["status"] != "cancelled"]
    return {"date": str(day), "sessions": sessions,
            "summary": {"sessions": len(active), "expected_students": len({x["id"] for s in active for x in s["students"]}),
                        "expected_seats": sum(len(s["students"]) for s in active), "absent": absent,
                        "cancelled": len(sessions) - len(active),
                        "to_mark": sum(1 for s in active if not s["marked"] and s["students"])}}


@decorators.api_view(["GET"])
@decorators.permission_classes([IsStaffRole])
def daily(request):
    """GET /api/daily/?date=YYYY-MM-DD (default today) -> who is expected today, session by session."""
    day = _date_param(request, "date") or timezone.localdate()
    return response.Response(_daily(request.user, day))


# ======================================================================= settings
@decorators.api_view(["GET"])
@decorators.permission_classes([permissions.AllowAny])
def public_settings(request):
    data = PublicSettingsSerializer(SchoolSettings.get()).data
    if request.user.is_authenticated:
        data["channels"] = channel_status()
    return response.Response(data)


@decorators.api_view(["GET", "PATCH"])
@decorators.permission_classes([IsSchoolAdmin])
def school_settings(request):
    s = SchoolSettings.get()
    if request.method == "PATCH":
        ser = SchoolSettingsSerializer(s, data=request.data, partial=True)
        ser.is_valid(raise_exception=True); s = ser.save()
    data = SchoolSettingsSerializer(s).data
    data["channels"] = channel_status()
    from django.conf import settings as dj
    data["email_configured"] = getattr(dj, "EMAIL_CONFIGURED", False)
    return response.Response(data)


@decorators.api_view(["POST"])
@decorators.permission_classes([IsSchoolAdmin])
def test_channel_view(request):
    """Sends a test message to the admin himself on one channel. body: {channel, phone?, email?}"""
    u = request.user
    if request.data.get("phone"): u.phone = request.data["phone"]
    if request.data.get("email"): u.email = request.data["email"]
    ok, err = test_channel(u, request.data.get("channel"))
    return response.Response({"ok": ok, "error": err}, status=200 if ok else 400)


@decorators.api_view(["POST"])
@decorators.permission_classes([IsSchoolAdmin])
def telegram_setup(request):
    """Registers the Telegram webhook to this server (needs a public HTTPS URL)."""
    import requests as rq
    s = SchoolSettings.get(); c = cfg()
    if not c["tg_token"]: return response.Response({"detail": "Bot token missing"}, 400)
    r = rq.get(f"https://api.telegram.org/bot{c['tg_token']}/getMe", timeout=15).json()
    if not r.get("ok"): return response.Response({"detail": "Invalid bot token"}, 400)
    s.telegram_bot_username = r["result"]["username"]
    if not s.telegram_webhook_secret: s.telegram_webhook_secret = get_random_string(32)
    s.save()
    base = request.data.get("base_url") or request.build_absolute_uri("/").rstrip("/")
    url = f"{base}/api/telegram/webhook/{s.telegram_webhook_secret}/"
    w = rq.post(f"https://api.telegram.org/bot{c['tg_token']}/setWebhook", json={"url": url}, timeout=15).json()
    if not w.get("ok"):  # no public HTTPS -> users are linked by `run_scheduler` polling instead
        s.telegram_webhook_secret = ""; s.save(update_fields=["telegram_webhook_secret"])
    return response.Response({"bot": s.telegram_bot_username, "webhook": w.get("ok", False),
                              "detail": w.get("description", "")})


ASK_PHONE = {"keyboard": [[{"text": "📱 مشاركة رقم هاتفي / Partager mon numéro", "request_contact": True}]],
             "resize_keyboard": True, "one_time_keyboard": True}
NO_KEYBOARD = {"remove_keyboard": True}


def link_by_phone(phone, chat_id):
    """Links every active account registered with this phone number to the Telegram chat."""
    from .notify import normalize_phone
    cc = cfg()["country_code"]
    target = normalize_phone(phone, cc)
    if not target: return []
    found = [u for u in User.objects.filter(is_active=True).exclude(phone="") if normalize_phone(u.phone, cc) == target]
    for u in found:
        u.telegram_chat_id = str(chat_id); u.notify_telegram = True; u.telegram_link_token = ""
        u.save(update_fields=["telegram_chat_id", "notify_telegram", "telegram_link_token"])
    return found


def handle_telegram_update(update, token):
    """Bot conversation:
    - /start <token>  (link from the profile page) -> links that account;
    - /start or any text -> asks the person to share his phone number (one tap);
    - shared contact -> links every account registered with that phone number."""
    msg = update.get("message") or {}
    text, chat = (msg.get("text") or "").strip(), (msg.get("chat") or {}).get("id")
    if not chat: return []
    school = cfg()["name"]
    linked, reply, markup = [], None, None
    contact = msg.get("contact")
    if contact:
        if contact.get("user_id") and contact["user_id"] != (msg.get("from") or {}).get("id"):
            reply, markup = "⚠️ شارك رقمك أنت (اضغط الزر في الأسفل).\nPartagez votre propre numéro.", ASK_PHONE
        else:
            linked = link_by_phone(contact.get("phone_number", ""), chat)
            if linked:
                names = "، ".join(u.display_name() for u in linked)
                reply = f"✅ تم ربط حسابك بنجاح: {names}\nستصلك إشعارات {school} هنا (الحصص، الغيابات، الإعلانات).\n✅ Compte lié avec succès."
            else:
                reply = (f"❌ رقمك غير مسجّل في {school}.\nاطلب من الإدارة إضافة رقم هاتفك إلى ملفك، ثم أرسل /start من جديد."
                         "\n❌ Numéro inconnu : demandez à l'école de l'ajouter, puis renvoyez /start.")
            markup = NO_KEYBOARD
    elif text.startswith("/start") and len(text.split(maxsplit=1)) == 2 and \
            (u := User.objects.filter(telegram_link_token=text.split(maxsplit=1)[1]).first()):
        u.telegram_chat_id = str(chat); u.notify_telegram = True; u.telegram_link_token = ""
        u.save(update_fields=["telegram_chat_id", "notify_telegram", "telegram_link_token"])
        linked = [u]
        reply, markup = f"✅ تم ربط حسابك ({u.display_name()}) بنجاح. ستصلك إشعارات {school} هنا.\n✅ Compte lié avec succès.", NO_KEYBOARD
    elif User.objects.filter(telegram_chat_id=str(chat)).exists():
        reply = f"✅ حسابك مربوط. هذا البوت يرسل إشعارات {school} فقط.\nVotre compte est déjà lié."
    else:
        reply = (f"👋 مرحبا بكم في {school}.\nلاستقبال إشعارات المدرسة اضغط الزر في الأسفل لمشاركة رقم هاتفك "
                 "(نفس الرقم المسجّل لدى المدرسة).\n👋 Appuyez sur le bouton pour partager votre numéro.")
        markup = ASK_PHONE
    if reply:
        try: telegram_send(chat, reply, token, markup)
        except Exception: pass
    return linked


def poll_telegram_once(token, timeout=0, offset=None):
    """Read pending bot messages with getUpdates (used when Telegram cannot reach us by webhook).
    Returns "ok", "webhook" (a webhook is active, Telegram pushes to it) or "error: ..."."""
    import logging, requests as rq
    log = logging.getLogger("core.telegram")
    try:
        r = rq.get(f"https://api.telegram.org/bot{token}/getUpdates",
                   params={"timeout": timeout, "offset": offset, "allowed_updates": '["message"]'}, timeout=timeout + 15)
        data = r.json()
    except Exception as e:  # never return the exception text: the URL contains the bot token
        log.warning("telegram getUpdates failed: %s", type(e).__name__)
        return "error: network"
    if r.status_code == 409:
        return "webhook"
    if not data.get("ok"):
        return f"error: {data.get('description', r.status_code)}"
    last = None
    for upd in data.get("result", []):
        last = upd["update_id"]
        for u in handle_telegram_update(upd, token):
            log.info("telegram linked: %s", u.username)
    if last is not None:  # confirm, so the same messages are not handled twice
        try: rq.get(f"https://api.telegram.org/bot{token}/getUpdates", params={"offset": last + 1, "timeout": 0}, timeout=15)
        except Exception: pass
    return "ok"


@decorators.api_view(["POST"])
@decorators.permission_classes([permissions.AllowAny])
@decorators.authentication_classes([])
def telegram_webhook(request, secret):
    s = SchoolSettings.get()
    if not s.telegram_webhook_secret or secret != s.telegram_webhook_secret:
        return response.Response(status=404)
    handle_telegram_update(request.data, cfg()["tg_token"])
    return response.Response({"ok": True})
