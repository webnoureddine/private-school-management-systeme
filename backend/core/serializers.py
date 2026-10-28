from django.utils.crypto import get_random_string
from rest_framework import serializers

from .models import *


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    groups_info = serializers.SerializerMethodField()
    modules_info = serializers.SerializerMethodField()
    children_info = serializers.SerializerMethodField()
    group_ids = serializers.PrimaryKeyRelatedField(source="class_groups", many=True, required=False,
                                                   queryset=Group.objects.all())
    telegram_linked = serializers.SerializerMethodField()
    is_superuser = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "email", "role", "phone", "language", "is_active",
                  "telegram_chat_id", "notify_email", "notify_whatsapp", "notify_telegram", "password",
                  "children", "children_info", "group_ids", "groups_info", "modules_info", "telegram_linked",
                  "is_superuser", "date_joined"]
        read_only_fields = ["date_joined"]

    def get_groups_info(self, o):
        return [g.name for g in o.class_groups.all()] if o.role == "student" else []

    def get_modules_info(self, o):
        if o.role != "student": return []
        return [{"name": s.module.name, "name_ar": s.module.name_ar}
                for s in o.subscriptions.filter(active=True).select_related("module")]

    def get_children_info(self, o):
        return [c.display_name() for c in o.children.all()] if o.role == "parent" else []

    def get_telegram_linked(self, o): return bool(o.telegram_chat_id)

    def validate_role(self, v):
        req = self.context.get("request")
        if v == "admin" and req and not req.user.is_school_admin:
            raise serializers.ValidationError("Only the director can create admin accounts.")
        return v

    def validate_username(self, v):
        return v.strip()

    def create(self, data):
        pw = data.pop("password", None) or get_random_string(8, "abcdefghjkmnpqrstuvwxyz23456789")
        children = data.pop("children", [])
        groups = data.pop("class_groups", None)
        u = User(**data); u.set_password(pw); u.save()
        u._plain_password = pw  # only kept in memory, for the welcome message
        u.children.set(children)
        if groups is not None: u.class_groups.set(groups)
        return u

    def update(self, inst, data):
        pw = data.pop("password", None)
        groups = data.pop("class_groups", None)
        inst = super().update(inst, data)
        if groups is not None: inst.class_groups.set(groups)
        if pw: inst.set_password(pw); inst.save()
        return inst


class MeSerializer(serializers.ModelSerializer):
    """What a user may change on his own profile."""
    is_superuser = serializers.BooleanField(read_only=True)
    telegram_linked = serializers.SerializerMethodField()
    def get_telegram_linked(self, o): return bool(o.telegram_chat_id)
    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "email", "role", "phone", "language",
                  "notify_email", "notify_whatsapp", "notify_telegram", "telegram_linked", "is_superuser"]
        read_only_fields = ["username", "role"]


def _ser(m):
    return type(f"{m.__name__}Serializer", (serializers.ModelSerializer,),
                {"Meta": type("Meta", (), {"model": m, "fields": "__all__"})})


LevelSerializer, RoomSerializer = map(_ser, [Level, Room])


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "title", "body", "kind", "channels_ok", "channels_failed", "channels_pending", "error", "read", "created_at"]


class GradeSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.display_name", read_only=True)
    module_name = serializers.CharField(source="module.name", read_only=True)
    module_name_ar = serializers.CharField(source="module.name_ar", read_only=True)
    on_20 = serializers.SerializerMethodField()
    class Meta: model = Grade; fields = "__all__"
    def get_on_20(self, o): return round(float(o.score) / float(o.out_of) * 20, 2) if o.out_of else None
    def validate(self, d):
        score = d.get("score", getattr(self.instance, "score", None))
        out_of = d.get("out_of", getattr(self.instance, "out_of", 20))
        if score is not None and out_of and (score < 0 or score > out_of):
            raise serializers.ValidationError({"score": "Score must be between 0 and the maximum."})
        return d


class GroupSerializer(serializers.ModelSerializer):
    level_name = serializers.CharField(source="level.name", read_only=True)
    level_name_ar = serializers.CharField(source="level.name_ar", read_only=True)
    student_count = serializers.SerializerMethodField()
    def get_student_count(self, o): return o.students.count()
    class Meta: model = Group; fields = "__all__"


class ModuleSerializer(serializers.ModelSerializer):
    level_name = serializers.CharField(source="level.name", read_only=True)
    level_name_ar = serializers.CharField(source="level.name_ar", read_only=True)
    teacher_names = serializers.SerializerMethodField()
    def get_teacher_names(self, o): return [t.display_name() for t in o.teachers.all()]
    class Meta: model = Module; fields = "__all__"


class TeachingSerializer(serializers.ModelSerializer):
    group_name = serializers.CharField(source="group.name", read_only=True)
    level_name = serializers.CharField(source="group.level.name", read_only=True)
    level_name_ar = serializers.CharField(source="group.level.name_ar", read_only=True)
    module_name = serializers.CharField(source="module.name", read_only=True)
    module_name_ar = serializers.CharField(source="module.name_ar", read_only=True)
    teacher_name = serializers.CharField(source="teacher.display_name", read_only=True)
    class Meta: model = Teaching; fields = "__all__"
    def validate(self, d):
        group = d.get("group") or self.instance.group
        module = d.get("module") or self.instance.module
        teacher = d.get("teacher") or self.instance.teacher
        if module.level_id != group.level_id:
            raise serializers.ValidationError("This module belongs to another level than the class.")
        if teacher.role != "teacher":
            raise serializers.ValidationError("The selected user is not a teacher.")
        return d


class PaymentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.display_name", read_only=True)
    status = serializers.SerializerMethodField()
    def get_status(self, o):
        from django.utils import timezone
        if o.paid_on: return "paid"
        return "late" if o.due_date < timezone.localdate() else "unpaid"
    class Meta: model = Payment; fields = "__all__"


class SessionSerializer(serializers.ModelSerializer):
    module_name = serializers.CharField(source="module.name", read_only=True)
    module_name_ar = serializers.CharField(source="module.name_ar", read_only=True)
    group_name = serializers.CharField(source="group.name", read_only=True)
    teacher_name = serializers.CharField(source="teacher.display_name", read_only=True)
    room_name = serializers.CharField(source="room.name", read_only=True, default="")
    expected = serializers.SerializerMethodField()
    class Meta: model = Session; fields = "__all__"; read_only_fields = ["reminder_sent"]
    def get_expected(self, o): return o.roster().count()
    def validate(self, d):
        inst = self.instance
        get = lambda k: d[k] if k in d else (getattr(inst, k) if inst else None)
        if get("end") <= get("start"):
            raise serializers.ValidationError("End must be after start.")
        if get("teacher").role != "teacher":
            raise serializers.ValidationError("The selected user is not a teacher.")
        if get("module").level_id != get("group").level_id:
            raise serializers.ValidationError("This module belongs to another level than the class.")
        if get("status") in (None, "planned"):  # create AND edit are both checked for conflicts
            probe = Session(pk=inst.pk if inst else None, module=get("module"), group=get("group"),
                            teacher=get("teacher"), room=get("room"), start=get("start"), end=get("end"))
            if probe.conflicts().exists():
                raise serializers.ValidationError("Conflict: the teacher, the room or the class is already booked at this time.")
        return d


class SubscriptionSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.display_name", read_only=True)
    module_name = serializers.CharField(source="module.name", read_only=True)
    module_name_ar = serializers.CharField(source="module.name_ar", read_only=True)
    level_name = serializers.CharField(source="module.level.name", read_only=True)
    groups_info = serializers.SerializerMethodField()
    class Meta: model = Subscription; fields = "__all__"
    def get_groups_info(self, o): return [g.name for g in o.student.class_groups.all()]
    def validate(self, d):
        st = d.get("student") or self.instance.student
        mod = d.get("module") or self.instance.module
        if st.role != "student":
            raise serializers.ValidationError("Only students can subscribe to a module.")
        levels = set(st.class_groups.values_list("level_id", flat=True))
        if levels and mod.level_id not in levels:
            raise serializers.ValidationError("This module belongs to another level than the student's class.")
        if not self.instance and Subscription.objects.filter(student=st, module=mod).exists():
            raise serializers.ValidationError("This student is already subscribed to this module.")
        return d


class AnnouncementSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.display_name", read_only=True, default="")
    group_name = serializers.CharField(source="audience_group.name", read_only=True, default="")
    session_label = serializers.SerializerMethodField()
    users_names = serializers.SerializerMethodField()
    delivered = serializers.SerializerMethodField()
    class Meta:
        model = Announcement; fields = "__all__"
        read_only_fields = ["sent", "created_by", "recipients"]
    def get_session_label(self, o):
        s = o.audience_session
        if not s: return ""
        from django.utils import timezone
        return f"{s.module.name_ar or s.module.name} · {s.group.name} · {timezone.localtime(s.start):%d/%m %H:%M}"
    def get_users_names(self, o): return [u.display_name() for u in o.audience_users.all()[:20]]
    def get_delivered(self, o):
        stats = {"email": 0, "whatsapp": 0, "telegram": 0, "failed": 0, "pending": 0, "read": 0}
        for n in o.notifications.all():
            for c in ("email", "whatsapp", "telegram"):
                if c in n.channels_ok.split(","): stats[c] += 1
            stats["failed"] += bool(n.channels_failed); stats["pending"] += bool(n.channels_pending); stats["read"] += n.read
        return stats
    def validate_channels(self, v):
        parts = [c for c in (v or "").split(",") if c]
        bad = [c for c in parts if c not in ("email", "whatsapp", "telegram")]
        if bad: raise serializers.ValidationError(f"Unknown channel: {bad}")
        return ",".join(parts)


class ClosureSerializer(serializers.ModelSerializer):
    group_name = serializers.CharField(source="group.name", read_only=True, default="")
    class Meta: model = Closure; fields = "__all__"; read_only_fields = ["notified"]


SECRET_FIELDS = ["telegram_bot_token", "whatsapp_token"]


class SchoolSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolSettings
        exclude = ["telegram_webhook_secret", "last_daily_run"]

    def to_representation(self, o):
        d = super().to_representation(o)
        for f in SECRET_FIELDS:  # never send the keys back to the browser
            d[f] = ("••••••" + d[f][-4:]) if d[f] else ""
        return d

    def validate(self, d):
        for f in SECRET_FIELDS:
            if f in d and d[f].startswith("••••"):
                d.pop(f)  # unchanged masked value
        return d


class PublicSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolSettings
        fields = ["name", "phone", "address", "email", "logo_url", "currency", "telegram_bot_username"]
