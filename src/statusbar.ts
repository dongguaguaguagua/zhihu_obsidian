import { App, MarkdownView, TFile } from "obsidian";
import i18n, { type Lang } from "../locales";

const locale: Lang = i18n.current;

type ZhihuTag =
    | "zhihu-answer"
    | "zhihu-article"
    | "zhihu-question"
    | "zhihu-pin";

let pendingTimer: number | null = null;

export function scheduleUpdateStatusBar(app: App, statusBarEl: HTMLElement) {
    if (pendingTimer != null) {
        window.clearTimeout(pendingTimer);
    }

    pendingTimer = window.setTimeout(() => {
        pendingTimer = null;
        updateZhihuStatusBarForActiveLeaf(app, statusBarEl);
    }, 50);
}

export function updateZhihuStatusBarForActiveLeaf(
    app: App,
    statusBarEl: HTMLElement,
) {
    const view = app.workspace.getActiveViewOfType(MarkdownView);

    if (!view) {
        statusBarEl.empty();
        return;
    }

    updateZhihuStatusBar(app, statusBarEl, view.file);
}

function updateZhihuStatusBar(
    app: App,
    statusBarEl: HTMLElement,
    file: TFile | null,
) {
    if (!file) {
        statusBarEl.empty();
        return;
    }

    const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;

    const zhihuTag = getZhihuTag(frontmatter?.tags);

    if (!zhihuTag) {
        statusBarEl.empty();
        return;
    }

    const text = buildZhihuStatusText(zhihuTag, frontmatter);

    if (!text) {
        statusBarEl.empty();
        return;
    }

    statusBarEl.setText(text);
}

function getZhihuTag(tags: unknown): ZhihuTag | null {
    const normalized: string[] = [];

    if (Array.isArray(tags)) {
        for (const t of tags) {
            if (typeof t === "string") {
                normalized.push(t);
            }
        }
    } else if (typeof tags === "string") {
        normalized.push(...tags.split(/[,，]/g).map((s) => s.trim()));
    }

    const candidates: ZhihuTag[] = [
        "zhihu-answer",
        "zhihu-article",
        "zhihu-question",
        "zhihu-pin",
    ];

    for (const c of candidates) {
        if (normalized.includes(c)) {
            return c;
        }
    }

    return null;
}

function buildZhihuStatusText(
    tag: ZhihuTag,
    frontmatter: Record<string, unknown> | undefined,
): string | null {
    if (!frontmatter) {
        return null;
    }

    if (tag === "zhihu-question") {
        const visits = toDisplayNumber(frontmatter["zhihu-visits"]);
        const followers = toDisplayNumber(frontmatter["zhihu-followers"]);
        const upVotes = toDisplayNumber(frontmatter["zhihu-upVotes"]);

        const parts = [
            visits != null ? `${visits} ${locale.ui.visits}` : null,
            followers != null ? `${followers} ${locale.ui.followers}` : null,
            upVotes != null ? `${upVotes} ${locale.ui.goodQuestion}` : null,
        ].filter((x): x is string => typeof x === "string");

        return parts.length ? parts.join("，") : null;
    }

    const favorites = toDisplayNumber(frontmatter["zhihu-favorites"]);
    const likes = toDisplayNumber(frontmatter["zhihu-likes"]);
    const upVotes = toDisplayNumber(frontmatter["zhihu-upVotes"]);

    const parts = [
        upVotes != null ? `${upVotes} ${locale.ui.upVotes}` : null,
        likes != null ? `${likes} ${locale.ui.likes}` : null,
        favorites != null ? `${favorites} ${locale.ui.favorites}` : null,
    ].filter((x): x is string => typeof x === "string");

    return parts.length ? parts.join("，") : null;
}

function toDisplayNumber(value: unknown): string | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
    }

    if (typeof value === "string" && value.trim().length > 0) {
        const n = Number(value);

        if (Number.isFinite(n)) {
            return String(n);
        }

        return value.trim();
    }

    return null;
}
