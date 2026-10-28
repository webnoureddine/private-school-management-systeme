import { createContext, useContext, useEffect, useState } from "react";
import D from "./strings.js";

const Ctx = createContext(null);
export const useT = () => useContext(Ctx);

/** Arabic is the default language. Keys are English; D[key] = [arabic, french]. */
export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => { try { return localStorage.getItem("lang") || "ar"; } catch { return "ar"; } });
  const dir = lang === "ar" ? "rtl" : "ltr";
  useEffect(() => {
    try { localStorage.setItem("lang", lang); } catch { /* private mode */ }
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang]);
  const t = (s) => {
    if (s == null) return "";
    if (lang === "en") return s;
    const v = D[s];
    return v ? v[lang === "ar" ? 0 : 1] || s : s;
  };
  /** pick the Arabic field (x_ar) when in Arabic and it exists */
  const tr = (o, f) => (lang === "ar" && o?.[f + "_ar"] ? o[f + "_ar"] : o?.[f]);
  const loc = lang === "ar" ? "ar-DZ-u-nu-latn" : lang === "fr" ? "fr-FR" : "en-GB";
  return <Ctx.Provider value={{ lang, setLang, t, tr, loc, dir }}>{children}</Ctx.Provider>;
}

export function LangSelect() {
  const { lang, setLang } = useT();
  return (
    <select className="langsel" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
      <option value="ar">العربية</option><option value="fr">Français</option><option value="en">English</option>
    </select>
  );
}
