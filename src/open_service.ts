import {
    App,
    MarkdownView,
    Notice,
    TFile,
    requestUrl,
    Platform,
    Modal,
    TextComponent,
    ButtonComponent,
    ToggleComponent,
} from "obsidian";
import ZhihuObPlugin from "./main";
import * as dataUtil from "./data";
import * as cookies from "./cookies";
import i18n, { type Lang } from "../locales";
const locale: Lang = i18n.current;
import { htmlToMd } from "./html_to_markdown";
import { StateField } from "@codemirror/state";
import { ViewUpdate, EditorView } from "@codemirror/view";
import { zhihuRefreshZseCookies } from "./login_service";
import { turnImgOffline } from "./img_offline";
import { loadSettings, saveSettings } from "./settings";
import { pickDirectoryDesktop, tryMapAbsPathToVaultRel } from "./utilities";

// 下面是2025年12月30日采用GPT 5.2重构后的open_service代码
// 原版过于臃肿，函数的传参层层嵌套

/**
 * =========================
 * Editor Cursor Trace
 * =========================
 */
export const pluginField = StateField.define<ZhihuObPlugin>({
    create: () => null as any,
    update: (value) => value,
});

export class CursorPosTrace {
    plugin: ZhihuObPlugin;

    constructor(view: EditorView) {
        this.plugin = view.state.field(pluginField);
    }

    update(update: ViewUpdate) {
        if (!this.plugin) {
            this.plugin = update.view.state.field(pluginField);
            if (!this.plugin) return;
        }
        if (update.selectionSet) this.updateCursor(update);
    }

    updateCursor(update: ViewUpdate) {
        if (this.plugin) {
            this.plugin.lastCursorPos = update.startState.selection.main.head;
        }
    }
}

/**
 * =========================
 * Types
 * =========================
 */
export type ZhihuType = "article" | "question" | "answer" | "pin";

export function asZhihuType(type: string): ZhihuType | null {
    switch (type) {
        case "article":
        case "question":
        case "answer":
        case "pin":
            return type;
        default:
            return null;
    }
}

export type ZhihuOpenRequest = {
    url: string;
    type?: ZhihuType; // 不传则自动识别
    destFolder?: string; // vault 内目录，默认 "zhihu"
    offlineImages?: boolean; // 覆盖全局 settings.turnImgOffline
    overwrite?: boolean; // 是否覆盖已有文件（默认 true）
};

type ParsedZhihu = {
    type: ZhihuType;
    url: string;
    title: string;
    author: string;
    html: string;
};

type ResolvedOpenOptions = {
    destFolder: string;
    offlineImages: boolean;
    overwrite: boolean;
};

/**
 * =========================
 * Public Click Hooks
 * =========================
 */
export async function clickInReadMode(app: App, evt: MouseEvent) {
    const target = evt.target as HTMLElement;
    if (
        !(target instanceof HTMLAnchorElement) ||
        !target.classList.contains("external-link")
    ) {
        return;
    }

    const link = target.href;
    const targetContent = target.textContent;
    if (!targetContent) return;

    // 跳过特殊链接：我的 Zhihu on Obsidian 推广文章
    if (link === "https://zhuanlan.zhihu.com/p/1901622331102696374") return;

    const type = detectZhihuType(link);
    if (!type) return;

    evt.preventDefault();
    evt.stopPropagation();

    await new ZhihuOpener(app).open({ url: link, type });
}

export async function clickInPreview(plugin: ZhihuObPlugin, evt: MouseEvent) {
    const app = plugin.app;
    const markdownView = app.workspace.getActiveViewOfType(MarkdownView);
    if (!markdownView) return;

    const editor = markdownView.editor;
    const cmEditor = (editor as any).cm;
    if (!cmEditor) return;

    const pos = cmEditor.posAtCoords({ x: evt.clientX, y: evt.clientY });
    if (!pos) return;

    const state = cmEditor.state;
    const doc = state.doc;
    const line = doc.lineAt(pos);
    const text = line.text;

    // 正则匹配 Markdown 链接 [title](url)
    const match = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
    let found: RegExpExecArray | null;

    while ((found = match.exec(text))) {
        const linkStart = line.from + found.index;
        const linkEnd = linkStart + found[0].length;

        if (pos > linkStart && pos < linkEnd) {
            const lastPos = plugin.lastCursorPos;

            // 上次光标在链接内则认为是在编辑链接，不拦截
            const wasLastCursorInside =
                lastPos !== null && lastPos >= linkStart && lastPos <= linkEnd;
            if (wasLastCursorInside) return;

            const link = found[2];
            const type = detectZhihuType(link);
            if (!type) return;

            evt.preventDefault();
            evt.stopPropagation();

            await new ZhihuOpener(app).open({ url: link, type });
            return;
        }
    }
}

/**
 * =========================
 * Main Opener Service
 * =========================
 */
export class ZhihuOpener {
    constructor(private app: App) {}

    async open(req: ZhihuOpenRequest): Promise<void> {
        const type = req.type ?? detectZhihuType(req.url);
        if (!type) {
            new Notice(locale.notice.linkInvalid);
            return;
        }

        const parsed = await parseByType(this.app, req.url, type);
        const opt = await resolveOpenOptions(this.app, req);

        await this.saveAndOpen(parsed, opt);
    }

    async openParsed(
        parsed: ParsedZhihu,
        opt?: Partial<ResolvedOpenOptions>,
    ): Promise<void> {
        const resolved = {
            destFolder: opt?.destFolder ?? "zhihu",
            offlineImages:
                opt?.offlineImages ??
                (await loadSettings(this.app.vault)).turnImgOffline,
            overwrite: opt?.overwrite ?? true, // 默认覆盖
        };
        await this.saveAndOpen(parsed, resolved);
    }

    private async saveAndOpen(
        parsed: ParsedZhihu,
        opt: ResolvedOpenOptions,
    ): Promise<void> {
        const app = this.app;
        const typeStr = fromTypeGetStr(parsed.type);

        const safeTitle = stripHtmlTags(parsed.title);
        const safeAuthor = parsed.author || "知乎用户";
        const fileName = removeSpecialChars(
            `${safeTitle}-${safeAuthor}的${typeStr}.md`,
        );
        const filePath = `${opt.destFolder}/${fileName}`;

        await ensureFolder(app, opt.destFolder);

        const existed = app.vault.getAbstractFileByPath(filePath);
        if (existed instanceof TFile) {
            // 不覆盖：直接打开旧文件
            if (!opt.overwrite) {
                await app.workspace.getLeaf().openFile(existed);
                return;
            }

            // 覆盖：重写内容 + 更新 frontmatter
            new Notice("正在覆盖已有文件...");

            let markdown = htmlToMd(parsed.html);
            if (opt.offlineImages) {
                markdown = await turnImgOffline({
                    app,
                    markdown,
                    destFolder: `${opt.destFolder}/images`,
                });
            }

            await app.vault.modify(existed, markdown);
            await app.fileManager.processFrontMatter(existed, (fm) => {
                fm.tags = `zhihu-${parsed.type}`;
                fm["zhihu-title"] = parsed.title;
                fm["zhihu-link"] = parsed.url;
            });

            await app.workspace.getLeaf().openFile(existed);
            return;
        } else if (existed) {
            console.error(`Path ${filePath} exists but is not a file`);
            return;
        }

        // 原逻辑：不存在则创建
        new Notice("正在打开文件...");
        let markdown = htmlToMd(parsed.html);

        if (opt.offlineImages) {
            markdown = await turnImgOffline({
                app,
                markdown,
                destFolder: `${opt.destFolder}/images`,
            });
        }

        const newFile = await app.vault.create(filePath, markdown);
        await app.fileManager.processFrontMatter(newFile, (fm) => {
            fm.tags = `zhihu-${parsed.type}`;
            fm["zhihu-title"] = parsed.title;
            fm["zhihu-link"] = parsed.url;
        });

        await app.workspace.getLeaf().openFile(newFile);
    }
}

/**
 * =========================
 * Option Resolution / Folder
 * =========================
 */
async function resolveOpenOptions(
    app: App,
    req: ZhihuOpenRequest,
): Promise<ResolvedOpenOptions> {
    const settings = await loadSettings(app.vault);

    const destFolderRaw = (req.destFolder ?? "zhihu").trim();
    const destFolder = destFolderRaw.replace(/^\/+|\/+$/g, "");
    if (!destFolder) throw new Error("destFolder 不能为空");

    const offlineImages = req.offlineImages ?? settings.turnImgOffline;
    const overwrite = req.overwrite ?? true; // 默认覆盖

    return { destFolder, offlineImages, overwrite };
}

async function ensureFolder(app: App, folderPath: string) {
    const folder = app.vault.getAbstractFileByPath(folderPath);
    if (!folder) await app.vault.createFolder(folderPath);
}

/**
 * =========================
 * Type Detection / Normalize
 * =========================
 */
function detectZhihuType(url: string): ZhihuType | null {
    try {
        new URL(url);
    } catch {
        return null;
    }

    const patterns: Record<ZhihuType, RegExp> = {
        answer: /zhihu\.com\/question\/\d+\/answer\/\d+/,
        article: /zhuanlan\.zhihu\.com\/p\/\d+/,
        question: /zhihu\.com\/question\/\d+$/,
        pin: /zhihu\.com\/pin\/\d+/,
    };

    for (const [t, re] of Object.entries(patterns) as [ZhihuType, RegExp][]) {
        if (re.test(url)) return t;
    }
    return null;
}

/**
 * =========================
 * Parsing Dispatcher
 * =========================
 */
async function parseByType(
    app: App,
    url: string,
    type: ZhihuType,
): Promise<ParsedZhihu> {
    switch (type) {
        case "article": {
            const [title, html, author] = await phaseArticle(app, url);
            return { type, url, title, html, author };
        }
        case "question": {
            const [title, html, author] = await phaseQuestion(app, url);
            return { type, url, title, html, author };
        }
        case "answer": {
            const [title, html, author] = await phaseAnswer(app, url);
            return { type, url, title, html, author };
        }
        case "pin": {
            const [title, html, author] = await phasePin(app, url);
            return { type, url, title, html, author };
        }
    }
}

/**
 * =========================
 * Fetch + JSON helpers
 * =========================
 */
async function getZhihuContentHTML(app: App, zhihuLink: string) {
    async function fetchWithCookies() {
        const data = await dataUtil.loadData(app.vault);
        const cookiesHeader = cookies.cookiesHeaderBuilder(data, []);
        const response = await requestUrl({
            url: zhihuLink,
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:138.0) Gecko/20100101 Firefox/138.0",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "accept-language":
                    "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
                "upgrade-insecure-requests": "1",
                "sec-fetch-dest": "document",
                "sec-fetch-mode": "navigate",
                "sec-fetch-site": "none",
                "sec-fetch-user": "?1",
                priority: "u=0, i",
                Cookie: cookiesHeader,
            },
            method: "GET",
        });
        return response.text;
    }

    try {
        return await fetchWithCookies();
    } catch (error) {
        console.warn(error);
        new Notice("cookie 已失效，正在尝试刷新...");
        try {
            await zhihuRefreshZseCookies(app);
            return await fetchWithCookies();
        } catch (error2: any) {
            console.error(locale.notice.requestAnswerFailed, error2);
            new Notice(
                `${locale.notice.requestAnswerFailed}, ${error2?.message ?? error2}`,
            );
            return "";
        }
    }
}

function parseInitialDataJsonFromHtml(htmlText: string): any {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, "text/html");
    const scriptTag = doc.querySelector(
        'script#js-initialData[type="text/json"]',
    );
    if (!scriptTag) throw new Error("js-initialData script tag not found");
    const jsonText = scriptTag.textContent;
    if (!jsonText) throw new Error("js-initialData is empty");
    return JSON.parse(jsonText);
}

/**
 * =========================
 * Phase Parsers
 * =========================
 */
async function phaseAnswer(
    app: App,
    zhihuLink: string,
): Promise<[string, string, string]> {
    const [questionId, answerId] = getQuestionAndAnswerId(zhihuLink);
    const htmlText = await getZhihuContentHTML(app, zhihuLink);
    const jsonData = parseInitialDataJsonFromHtml(htmlText);

    const data = jsonData?.initialState?.entities?.answers?.[answerId];
    const writerName = data?.author?.name || "知乎用户";
    const content = data?.content || "";
    const title = data?.question?.title || `知乎问题${questionId}`;

    return [title, content, writerName];
}

async function phaseArticle(
    app: App,
    zhihuLink: string,
): Promise<[string, string, string]> {
    const articleId = getArticleId(zhihuLink);
    const htmlText = await getZhihuContentHTML(app, zhihuLink);
    const jsonData = parseInitialDataJsonFromHtml(htmlText);

    const data = jsonData?.initialState?.entities?.articles?.[articleId];
    const writerName = data?.author?.name || "知乎用户";
    const content = data?.content || "";
    const title = data?.title || `知乎文章${articleId}`;

    return [title, content, writerName];
}

export async function phaseQuestion(
    app: App,
    zhihuLink: string,
): Promise<[string, string, string]> {
    const questionId = getQestionId(zhihuLink);
    const htmlText = await getZhihuContentHTML(app, zhihuLink);

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, "text/html");
    const jsonData = (() => {
        const scriptTag = doc.querySelector(
            'script#js-initialData[type="text/json"]',
        );
        if (!scriptTag) throw new Error("js-initialData script tag not found");
        const jsonText = scriptTag.textContent;
        if (!jsonText) throw new Error("js-initialData is empty");
        return JSON.parse(jsonText);
    })();

    const quesData = jsonData?.initialState?.entities?.questions?.[questionId];
    const asker = quesData?.author?.name || "知乎用户";
    const questionDetail = quesData?.detail || "";
    const title = quesData?.title || `知乎问题${questionId}`;

    // 附上问题回答（遍历 initialData answers）
    const answerData = jsonData?.initialState?.entities?.answers || {};
    const answerContainer = doc.createElement("div");

    for (const key in answerData) {
        const answer = answerData[key];
        const header = doc.createElement("h1");
        const link = doc.createElement("a");
        link.href = `https://www.zhihu.com/question/${questionId}/answer/${answer?.id}`;
        link.textContent = `${answer?.author?.name || "知乎用户"}的回答`;
        header.appendChild(link);

        const content = doc.createElement("div");
        content.innerHTML = answer?.content || "";

        answerContainer.appendChild(header);
        answerContainer.appendChild(content);
    }

    const container = doc.createElement("div");
    container.innerHTML = questionDetail;
    container.appendChild(answerContainer);

    return [title, container.innerHTML, asker];
}

async function phasePin(
    app: App,
    zhihuLink: string,
): Promise<[string, string, string]> {
    const pinId = getPinId(zhihuLink);
    const htmlText = await getZhihuContentHTML(app, zhihuLink);
    const jsonData = parseInitialDataJsonFromHtml(htmlText);

    const pinData = jsonData?.initialState?.entities?.pins?.[pinId];
    const users = jsonData?.initialState?.entities?.users || {};
    const title = `想法${pinId}`;

    // author：遍历 users 找一个 name
    let author = "知乎用户";
    for (const key in users) {
        const user = users[key];
        if (user && typeof user.name === "string") {
            author = user.name;
            break;
        }
    }

    // contentHtml 很可能是 string，别当 DOM 用
    const contentHtmlStr: string =
        typeof pinData?.contentHtml === "string" ? pinData.contentHtml : "";

    // 附加图片（拼 HTML）
    const content = Array.isArray(pinData?.content) ? pinData.content : [];
    const imgs: string[] = [];
    for (const entry of content) {
        if (entry?.type === "image" && entry?.originalUrl) {
            const w = entry.width ? ` width="${entry.width}"` : "";
            const h = entry.height ? ` height="${entry.height}"` : "";
            imgs.push(`<img src="${entry.originalUrl}" alt=""${w}${h} />`);
        }
    }
    const imgsHtml = imgs.length ? `<div>${imgs.join("\n")}</div>` : "";

    return [title, `${contentHtmlStr}\n${imgsHtml}`, author];
}

/**
 * =========================
 * Helpers
 * =========================
 */
function fromTypeGetStr(type: ZhihuType) {
    switch (type) {
        case "article":
            return "文章";
        case "question":
            return "提问";
        case "answer":
            return "回答";
        case "pin":
            return "想法";
    }
}

function removeSpecialChars(input: string): string {
    // 删除让链接无法工作的符号：# ^ [ ] |
    input = input.replace(/[#^[\]|]/g, "");
    if (Platform.isMacOS) {
        // macOS 不允许：\ / :
        input = input.replace(/[\\/ :]/g, "");
    } else {
        // Windows/Android 等：/ \ " * : | ? < >
        input = input.replace(/[/\\<>"*:|]/g, "");
        input = input.replace(/\?/g, "？");
    }
    return input;
}

function stripHtmlTags(input: string): string {
    return input.replace(/<[^>]*>/g, "");
}

function getQuestionAndAnswerId(link: string): [string, string] {
    const match = link.match(
        /^https?:\/\/www\.zhihu\.com\/question\/(\d+)\/answer\/(\d+)/,
    );
    if (match) return [match[1], match[2]];
    return ["", ""];
}

function getArticleId(link: string): string {
    const match = link.match(/^https:\/\/zhuanlan\.zhihu\.com\/p\/(\d+)$/);
    if (match) return match[1];
    return "";
}

function getPinId(link: string): string {
    const match = link.match(/^https:\/\/www\.zhihu\.com\/pin\/(\d+)$/);
    if (match) return match[1];
    return "";
}

function getQestionId(link: string): string {
    const match = link.match(/^https:\/\/www\.zhihu\.com\/question\/(\d+)$/);
    if (match) return match[1];
    return "";
}

export class ZhihuInputLinkModal extends Modal {
    inputEl: TextComponent;
    private overwrite = true; // 默认覆盖

    constructor(app: App) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: locale.ui.enterZhihuLink });

        // 单链接输入框
        this.inputEl = new TextComponent(contentEl);
        this.inputEl.inputEl.addClass("zhihu-link-input");
        this.inputEl.setPlaceholder(locale.ui.enterZhihuLinkPlaceholder);

        // 添加键盘事件监听
        this.inputEl.inputEl.addEventListener(
            "keydown",
            async (event: KeyboardEvent) => {
                if (event.key !== "Enter") return;
                const value = this.inputEl.getValue().trim();
                await new ZhihuOpener(this.app).open({
                    url: value,
                    overwrite: this.overwrite,
                });
                this.close();
            },
        );

        // ===== 纯 HTML 行 =====
        const row = contentEl.createDiv();
        row.addClass("zhihu-modal-row");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.marginTop = "10px";
        row.style.gap = "8px";

        // 批量打开链接按钮
        const batchBtn = new ButtonComponent(row);
        batchBtn.setButtonText("批量打开链接");
        batchBtn.onClick(() => {
            new ZhihuBatchLinkModal(this.app).open();
        });

        // 弹性空白
        const spacer = row.createDiv();
        spacer.style.flex = "1 1 auto";

        // 覆盖已有文件
        const owLabel = row.createSpan({ text: "覆盖已有文件" });
        owLabel.style.marginRight = "4px";

        const owToggle = new ToggleComponent(row);
        owToggle.setValue(true); // 默认覆盖
        owToggle.onChange((v) => {
            this.overwrite = v;
        });

        // 保存图片（你原来的）
        const label = row.createSpan({ text: "保存图片" });
        label.style.marginRight = "4px";

        const toggle = new ToggleComponent(row);

        // 初始化 toggle
        (async () => {
            try {
                const settings = await loadSettings(this.app.vault);
                toggle.setValue(!!settings.turnImgOffline);
            } catch (e) {
                console.error("load settings failed:", e);
            }
        })();

        toggle.onChange(async (value) => {
            try {
                await saveSettings(this.app.vault, { turnImgOffline: value });
            } catch (e) {
                console.error("save settings failed:", e);
            }
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}

export class ZhihuBatchLinkModal extends Modal {
    private textareaEl!: HTMLTextAreaElement;

    private folderPathRel = "zhihu"; // vault 内相对路径（真正用于写入）
    private pickedAbsPath: string | null = null; // 仅展示
    private offline = false; // 本次批量开关（覆盖全局）
    private overwrite = true; // 默认覆盖

    constructor(app: App) {
        super(app);
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", { text: "批量打开知乎链接" });

        // 默认 offline 取全局设置
        const settings = await loadSettings(this.app.vault);
        this.offline = !!settings.turnImgOffline;

        /**
         * =========
         * 第一行：目录
         * =========
         */
        const dirRow = contentEl.createDiv({ cls: "zhihu-batch-dir-row" });
        dirRow.style.display = "flex";
        dirRow.style.alignItems = "center";
        dirRow.style.gap = "8px";
        dirRow.style.marginBottom = "8px";

        dirRow.createSpan({ text: "存储目录" });

        const dirValueEl = dirRow.createSpan({
            text: `${this.folderPathRel}/`,
        });
        dirValueEl.addClass("zhihu-dir-value");
        dirValueEl.style.opacity = "0.85";
        dirValueEl.style.fontFamily = "var(--font-monospace)";
        dirValueEl.style.whiteSpace = "nowrap";
        dirValueEl.style.overflow = "hidden";
        dirValueEl.style.textOverflow = "ellipsis";
        dirValueEl.style.maxWidth = "60%";

        // 弹性空白
        const spacer = dirRow.createDiv();
        spacer.style.flex = "1 1 auto";

        const pickBtn = new ButtonComponent(dirRow);
        pickBtn.setButtonText("选择…");
        pickBtn.onClick(async () => {
            const abs = await pickDirectoryDesktop();
            if (!abs) return;

            this.pickedAbsPath = abs;

            const rel = tryMapAbsPathToVaultRel(this.app, abs);
            if (!rel) {
                new Notice(
                    "选择的目录不在当前 Vault 内，将继续使用默认 zhihu/ 保存",
                );
                this.folderPathRel = "zhihu";
                dirValueEl.setText(`${this.folderPathRel}/`);
                return;
            }

            this.folderPathRel = rel;
            dirValueEl.setText(`${this.folderPathRel}/`);
        });

        // 在下面展示绝对路径，便于用户确认
        const absHint = contentEl.createDiv({ cls: "zhihu-batch-abs-hint" });
        absHint.style.marginTop = "-4px";
        absHint.style.marginBottom = "10px";
        absHint.style.opacity = "0.7";
        absHint.style.fontSize = "12px";
        absHint.setText("默认：zhihu/（仅支持 Vault 内目录）");

        /**
         * =========
         * 第二行：保存图片
         * =========
         */
        const offlineRow = contentEl.createDiv({
            cls: "zhihu-batch-offline-row",
        });
        offlineRow.style.display = "flex";
        offlineRow.style.alignItems = "center";
        offlineRow.style.gap = "8px";
        offlineRow.style.marginBottom = "10px";

        offlineRow.createSpan({ text: "保存图片" });

        const offlineSpacer = offlineRow.createDiv();
        offlineSpacer.style.flex = "1 1 auto";

        const offlineToggle = new ToggleComponent(offlineRow);
        offlineToggle.setValue(this.offline);
        offlineToggle.onChange((v) => {
            this.offline = v;
        });

        /**
         * =========
         * 第三行：覆盖已有文件
         * =========
         */
        const overwriteRow = contentEl.createDiv({
            cls: "zhihu-batch-overwrite-row",
        });
        overwriteRow.style.display = "flex";
        overwriteRow.style.alignItems = "center";
        overwriteRow.style.gap = "8px";
        overwriteRow.style.marginBottom = "10px";

        overwriteRow.createSpan({ text: "覆盖已有文件" });

        const overwriteSpacer = overwriteRow.createDiv();
        overwriteSpacer.style.flex = "1 1 auto";

        const overwriteToggle = new ToggleComponent(overwriteRow);
        overwriteToggle.setValue(true); // 默认覆盖
        overwriteToggle.onChange((v) => (this.overwrite = v));

        /**
         * =========
         * Textarea
         * =========
         */
        this.textareaEl = contentEl.createEl("textarea");
        this.textareaEl.addClass("zhihu-link-batch-textarea");
        this.textareaEl.placeholder =
            "每行一个链接\n支持知乎回答、文章、问题、想法";
        this.textareaEl.style.width = "100%";
        this.textareaEl.style.minHeight = "340px"; // 你要“长一点”，这里比之前 260 更长
        this.textareaEl.style.boxSizing = "border-box";
        this.textareaEl.style.resize = "vertical";

        /**
         * =========
         * Footer buttons
         * =========
         */
        const footer = contentEl.createDiv({ cls: "zhihu-batch-footer" });
        footer.style.display = "flex";
        footer.style.justifyContent = "flex-end";
        footer.style.gap = "8px";
        footer.style.marginTop = "12px";

        const cancelBtn = new ButtonComponent(footer);
        cancelBtn.setButtonText("取消");
        cancelBtn.onClick(() => this.close());

        const startBtn = new ButtonComponent(footer);
        startBtn.setButtonText("开始");
        startBtn.setCta();
        startBtn.onClick(async () => {
            await this.runBatch();
        });
    }

    private async runBatch() {
        const raw = this.textareaEl?.value ?? "";
        const links = raw
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

        if (links.length === 0) {
            new Notice("没有检测到任何链接");
            return;
        }

        const opener = new ZhihuOpener(this.app);

        let ok = 0;
        let bad = 0;

        for (const url of links) {
            try {
                await opener.open({
                    url,
                    destFolder: this.folderPathRel,
                    offlineImages: this.offline,
                    overwrite: this.overwrite,
                });
                ok++;
            } catch (e) {
                console.error("batch open failed:", url, e);
                bad++;
            }
        }

        new Notice(`批量处理完成：成功 ${ok}，失败/跳过 ${bad}`);
        this.close();
    }

    onClose() {
        this.contentEl.empty();
    }
}
