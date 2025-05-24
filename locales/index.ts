import en from "./en";
import zh from "./zh";
import zhTW from "./zh-TW";
export type Lang = typeof en;

const langMap = {
    en: "en",
    zh: "zh",
    "zh-TW": "zhTW",
} as const;

export default {
    i18n: {
        en,
        zh,
        zhTW,
    },
    get current() {
        const lang = window.localStorage.getItem("language") ?? "en";
        console.log(lang);
        const key = langMap[lang as keyof typeof langMap] ?? "en";
        return this.i18n[key];
    },
};
