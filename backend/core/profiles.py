from .models import Module, Subscription, Teaching


def student_profile(u):
    """Level, class, and every module of that level with its teacher and whether the student is subscribed."""
    subs = {s.module_id: s for s in Subscription.objects.filter(student=u)}
    groups = []
    for g in u.class_groups.select_related("level"):
        teach = {t.module_id: t for t in Teaching.objects.filter(group=g).select_related("teacher")}
        mods = []
        for m in Module.objects.filter(level=g.level).order_by("name"):
            t, sub = teach.get(m.id), subs.get(m.id)
            mods.append({
                "id": m.id, "name": m.name, "name_ar": m.name_ar,
                "coefficient": str(m.coefficient), "hours_per_week": str(m.hours_per_week),
                "teacher": {"id": t.teacher_id, "name": t.teacher.get_full_name() or t.teacher.username} if t else None,
                "subscribed": bool(sub and sub.active), "subscription_id": sub.id if sub else None,
                "monthly_fee": str(sub.monthly_fee) if sub else None,
            })
        groups.append({"id": g.id, "name": g.name, "year": g.year,
                       "level": {"id": g.level.id, "name": g.level.name, "name_ar": g.level.name_ar, "cycle": g.level.cycle},
                       "modules": mods})
    return {"id": u.id, "name": u.get_full_name() or u.username, "username": u.username, "groups": groups}
