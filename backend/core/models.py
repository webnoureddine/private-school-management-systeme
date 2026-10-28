from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "admin"
        TEACHER = "teacher"
        STUDENT = "student"
        PARENT = "parent"
        STAFF = "staff"
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.STUDENT)
    phone = models.CharField(max_length=30, blank=True)
    telegram_chat_id = models.CharField(max_length=40, blank=True)
    notify_email = models.BooleanField(default=True)
    notify_whatsapp = models.BooleanField(default=False)
    notify_telegram = models.BooleanField(default=False)
    language = models.CharField(max_length=2, default="ar", choices=[("ar", "Arabic"), ("fr", "French"), ("en", "English")])
    # parent -> children link (parents get reminders, absences, and see their children's grades)
    children = models.ManyToManyField("self", symmetrical=False, blank=True, related_name="parents",
                                      limit_choices_to={"role": "student"})
    telegram_link_token = models.CharField(max_length=40, blank=True, db_index=True)

    @property
    def is_school_admin(self):
        return self.is_superuser or self.role == self.Role.ADMIN

    @property
    def is_manager(self):
        """Admin or administrative staff (secretariat)."""
        return self.is_school_admin or self.role == self.Role.STAFF

    def display_name(self):
        return self.get_full_name() or self.username


class Level(models.Model):
    """Algerian school level: 1AP..5AP (primaire), 1AM..4AM (moyen), 1AS..3AS + filière (secondaire)."""
    class Cycle(models.TextChoices):
        PRIMARY = "primary"
        MIDDLE = "middle"
        SECONDARY = "secondary"
    name = models.CharField(max_length=80, unique=True)
    name_ar = models.CharField(max_length=120, blank=True)
    cycle = models.CharField(max_length=10, choices=Cycle.choices, default=Cycle.MIDDLE)
    order = models.PositiveSmallIntegerField(default=0)
    class Meta: ordering = ["order", "name"]
    def __str__(self): return self.name


class Group(models.Model):
    name = models.CharField(max_length=80)
    level = models.ForeignKey(Level, on_delete=models.PROTECT)
    year = models.CharField(max_length=9, help_text="2026-2027")
    students = models.ManyToManyField(User, limit_choices_to={"role": "student"}, blank=True, related_name="class_groups")
    def __str__(self): return f"{self.name} ({self.year})"


class Module(models.Model):
    name = models.CharField(max_length=120)
    name_ar = models.CharField(max_length=160, blank=True)
    level = models.ForeignKey(Level, on_delete=models.PROTECT)
    hours_per_week = models.DecimalField(max_digits=4, decimal_places=1, default=2)
    session_minutes = models.PositiveIntegerField(default=60)
    coefficient = models.DecimalField(max_digits=3, decimal_places=1, default=1)
    teachers = models.ManyToManyField(User, limit_choices_to={"role": "teacher"}, blank=True, related_name="modules")
    def __str__(self): return self.name


class Teaching(models.Model):
    """Which teacher teaches which module to which class. A student's modules/teachers come from here."""
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="teachings")
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name="teachings")
    teacher = models.ForeignKey(User, on_delete=models.PROTECT, limit_choices_to={"role": "teacher"}, related_name="teachings")
    class Meta: unique_together = ("group", "module")
    def __str__(self): return f"{self.module} / {self.group} -> {self.teacher}"


class Room(models.Model):
    name = models.CharField(max_length=60, unique=True)
    capacity = models.PositiveIntegerField(default=30)
    def __str__(self): return self.name


class Session(models.Model):
    class Status(models.TextChoices):
        PLANNED = "planned"
        CANCELLED = "cancelled"
        DONE = "done"
    module = models.ForeignKey(Module, on_delete=models.PROTECT)
    group = models.ForeignKey(Group, on_delete=models.CASCADE)
    teacher = models.ForeignKey(User, on_delete=models.PROTECT, limit_choices_to={"role": "teacher"})
    room = models.ForeignKey(Room, null=True, blank=True, on_delete=models.SET_NULL)
    start = models.DateTimeField()
    end = models.DateTimeField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PLANNED)
    cancel_reason = models.CharField(max_length=255, blank=True)
    topic = models.CharField(max_length=255, blank=True, help_text="What will be taught")
    reminder_sent = models.BooleanField(default=False)
    class Meta: ordering = ["start"]
    def __str__(self): return f"{self.module} {self.group} {self.start:%Y-%m-%d %H:%M}"
    def roster(self):
        """Students expected at this session: in the class AND subscribed to the module on that day."""
        day = timezone.localtime(self.start).date()
        subs = Subscription.objects.filter(module_id=self.module_id, active=True, start_date__lte=day) \
            .filter(models.Q(end_date__isnull=True) | models.Q(end_date__gte=day))
        return User.objects.filter(class_groups=self.group_id, subscriptions__in=subs).distinct().order_by("first_name", "last_name", "id")
    def conflicts(self):
        q = Session.objects.exclude(pk=self.pk).filter(
            status="planned", start__lt=self.end, end__gt=self.start)
        cond = models.Q(teacher=self.teacher) | models.Q(group=self.group)
        if self.room_id:
            cond |= models.Q(room=self.room)
        return q.filter(cond)


class Attendance(models.Model):
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name="attendance")
    student = models.ForeignKey(User, on_delete=models.CASCADE)
    present = models.BooleanField(default=True)
    late_minutes = models.PositiveIntegerField(default=0)
    note = models.CharField(max_length=200, blank=True)
    class Meta: unique_together = ("session", "student")


class Grade(models.Model):
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name="grades")
    module = models.ForeignKey(Module, on_delete=models.CASCADE)
    title = models.CharField(max_length=120)
    score = models.DecimalField(max_digits=5, decimal_places=2)
    out_of = models.DecimalField(max_digits=5, decimal_places=2, default=20)
    date = models.DateField(default=timezone.localdate)


class Payment(models.Model):
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name="payments")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    due_date = models.DateField()
    paid_on = models.DateField(null=True, blank=True)
    label = models.CharField(max_length=120, default="Monthly tuition")
    last_reminder = models.DateField(null=True, blank=True)


class Announcement(models.Model):
    """A message sent by the admin or a teacher. Audience = role and/or class and/or session and/or chosen people."""
    title = models.CharField(max_length=160)
    body = models.TextField()
    audience_role = models.CharField(max_length=10, blank=True)
    audience_group = models.ForeignKey(Group, null=True, blank=True, on_delete=models.SET_NULL)
    audience_session = models.ForeignKey("Session", null=True, blank=True, on_delete=models.SET_NULL, related_name="messages")
    audience_users = models.ManyToManyField(User, blank=True, related_name="received_messages")
    include_parents = models.BooleanField(default=False)
    channels = models.CharField(max_length=60, blank=True, help_text="email,whatsapp,telegram (empty = user preferences)")
    recipients = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="sent_messages")
    created_at = models.DateTimeField(auto_now_add=True)
    sent = models.BooleanField(default=False)
    class Meta: ordering = ["-created_at"]


class Closure(models.Model):
    date = models.DateField()
    reason = models.CharField(max_length=255)
    group = models.ForeignKey(Group, null=True, blank=True, on_delete=models.CASCADE,
                              help_text="Empty = whole school")
    notified = models.BooleanField(default=False)


class Notification(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    title = models.CharField(max_length=160)
    body = models.TextField()
    kind = models.CharField(max_length=20, default="info")
    channels_ok = models.CharField(max_length=60, blank=True)
    channels_failed = models.CharField(max_length=60, blank=True)
    channels_pending = models.CharField(max_length=60, blank=True)
    error = models.CharField(max_length=255, blank=True)
    announcement = models.ForeignKey(Announcement, null=True, blank=True, on_delete=models.SET_NULL, related_name="notifications")
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta: ordering = ["-created_at"]


class Subscription(models.Model):
    """A student is subscribed to a specific module (he only attends / is billed for the modules he subscribed to)."""
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name="subscriptions", limit_choices_to={"role": "student"})
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name="subscriptions")
    start_date = models.DateField(default=timezone.localdate)
    end_date = models.DateField(null=True, blank=True)
    monthly_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    active = models.BooleanField(default=True)
    class Meta:
        unique_together = ("student", "module")
        ordering = ["student__first_name", "module__name"]
    def __str__(self): return f"{self.student} -> {self.module}"


class SchoolSettings(models.Model):
    """Single row: school identity + notification channel credentials, edited by the admin in the app."""
    class WhatsApp(models.TextChoices):
        NONE = "", "—"
        META = "meta", "WhatsApp Cloud API (Meta)"
        TWILIO = "twilio", "Twilio"
        ULTRAMSG = "ultramsg", "UltraMsg"
    name = models.CharField(max_length=160, default="مدرستي الخاصة")
    phone = models.CharField(max_length=40, blank=True)
    address = models.CharField(max_length=255, blank=True)
    email = models.EmailField(blank=True)
    logo_url = models.URLField(blank=True)
    currency = models.CharField(max_length=10, default="دج")
    country_code = models.CharField(max_length=4, default="213", help_text="Used to convert 0XXXXXXXXX phones to international format")
    reminder_hour = models.PositiveSmallIntegerField(default=18, help_text="Hour of the day when tomorrow's reminders are sent")
    payment_reminder_days = models.PositiveSmallIntegerField(default=3)
    email_enabled = models.BooleanField(default=True)
    telegram_bot_token = models.CharField(max_length=120, blank=True)
    telegram_bot_username = models.CharField(max_length=80, blank=True)
    telegram_webhook_secret = models.CharField(max_length=40, blank=True)
    whatsapp_provider = models.CharField(max_length=10, choices=WhatsApp.choices, blank=True)
    whatsapp_token = models.CharField(max_length=400, blank=True, help_text="Meta access token / Twilio auth token / UltraMsg token")
    whatsapp_phone_id = models.CharField(max_length=80, blank=True, help_text="Meta phone number id / Twilio account SID / UltraMsg instance id")
    whatsapp_from = models.CharField(max_length=40, blank=True, help_text="Twilio sender number (whatsapp:+1...)")
    whatsapp_template = models.CharField(max_length=80, blank=True, help_text="Meta approved template name with one {{1}} body variable")
    whatsapp_template_lang = models.CharField(max_length=10, default="ar")
    last_daily_run = models.DateField(null=True, blank=True)

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self): return self.name
