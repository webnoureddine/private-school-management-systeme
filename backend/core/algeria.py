"""Algerian school system: levels (primaire / moyen / secondaire + filières) and their modules.
Names are French + Arabic. Hours and coefficients are neutral defaults -> adjust them in the app
to match the official ministry tables / your school's own programme."""
from .models import Level, Module

MOD = {  # key: (French, Arabic)
    "ar": ("Langue arabe", "اللغة العربية"), "fr": ("Langue française", "اللغة الفرنسية"),
    "en": ("Langue anglaise", "اللغة الإنجليزية"), "ma": ("Mathématiques", "الرياضيات"),
    "sn": ("Sciences naturelles", "علوم الطبيعة والحياة"), "ph": ("Sciences physiques", "العلوم الفيزيائية"),
    "pt": ("Physique et technologie", "الفيزياء والتكنولوجيا"), "hg": ("Histoire-Géographie", "التاريخ والجغرافيا"),
    "is": ("Éducation islamique", "التربية الإسلامية"), "ci": ("Éducation civique", "التربية المدنية"),
    "pe": ("Éducation physique", "التربية البدنية"), "ic": ("Informatique", "الإعلام الآلي"),
    "ea": ("Éducation artistique", "التربية الفنية"), "sc": ("Sciences et technologie", "النشاط العلمي والتكنولوجي"),
    "fi": ("Philosophie", "الفلسفة"), "te": ("Technologie (génie)", "التكنولوجيا (هندسة)"),
    "ec": ("Économie et management", "الاقتصاد والمناجمنت"), "ge": ("Gestion comptable et financière", "التسيير المحاسبي والمالي"),
    "dr": ("Droit", "القانون"), "l3": ("Troisième langue étrangère", "اللغة الأجنبية الثالثة"),
}
ORD_AR = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة"]
STREAMS = {  # code: (French, Arabic, modules)
    "SE": ("Sciences expérimentales", "علوم تجريبية", "ar fr en ma ph sn hg is fi pe"),
    "M":  ("Mathématiques", "رياضيات", "ar fr en ma ph sn hg is fi pe"),
    "TM": ("Technique mathématique", "تقني رياضي", "ar fr en ma ph te hg is fi pe"),
    "GE": ("Gestion et économie", "تسيير واقتصاد", "ar fr en ma ec ge dr hg is fi pe"),
    "LP": ("Lettres et philosophie", "آداب وفلسفة", "ar fr en fi hg is ma pe"),
    "LE": ("Langues étrangères", "لغات أجنبية", "ar fr en l3 fi hg is ma pe"),
}


def _levels():
    for i in range(5):
        mods = "ar ma is ci ea pe" + (" fr en sc hg" if i >= 2 else "")
        yield ("primary", f"{i+1}AP", f"السنة {ORD_AR[i]} ابتدائي", 10 + i, mods)
    for i in range(4):
        yield ("middle", f"{i+1}AM", f"السنة {ORD_AR[i]} متوسط", 20 + i, "ar fr en ma sn pt hg is ci ic pe ea")
    yield ("secondary", "1AS ST", "السنة الأولى ثانوي - جذع مشترك علوم وتكنولوجيا", 30, "ar fr en ma ph sn hg is ic pe")
    yield ("secondary", "1AS L", "السنة الأولى ثانوي - جذع مشترك آداب", 31, "ar fr en ma hg is ic pe")
    for y in (2, 3):
        for j, (code, (fr, ar, mods)) in enumerate(STREAMS.items()):
            yield ("secondary", f"{y}AS {code}", f"السنة {ORD_AR[y-1]} ثانوي - {ar}", 30 + y * 10 + j, mods)


def seed_algeria():
    nl = nm = 0
    for cycle, name, name_ar, order, mods in _levels():
        lvl, c = Level.objects.update_or_create(name=name, defaults=dict(name_ar=name_ar, cycle=cycle, order=order))
        nl += c
        for k in mods.split():
            fr, ar = MOD[k]
            _, c = Module.objects.get_or_create(level=lvl, name=fr, defaults=dict(name_ar=ar))
            nm += c
    return nl, nm
