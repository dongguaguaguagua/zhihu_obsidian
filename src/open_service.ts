import {
    App,
    MarkdownView,
    Notice,
    TFile,
    requestUrl,
    Modal,
    TextComponent,
    Platform,
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

// 定义一个 StateField 来持有插件实例
// 这个 StateField 将被添加到编辑器的 state 中
// 与 clickInPreview 的上次次光标位置(plugin.lastCursorPos)有关
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
        // 确保 plugin 实例已正确加载
        if (!this.plugin) {
            this.plugin = update.view.state.field(pluginField);
            if (!this.plugin) return;
        }

        if (update.selectionSet) {
            this.updateCursor(update);
        }
    }

    updateCursor(update: ViewUpdate) {
        if (this.plugin) {
            this.plugin.lastCursorPos = update.startState.selection.main.head;
        }
    }
}

async function openZhihuLink(app: App, link: string, type: string) {
    let title = "";
    let content = "";
    let authorName = "";
    switch (type) {
        case "article":
            [title, content, authorName] = await phaseArticle(app, link);
            break;
        case "question":
            [title, content, authorName] = await phaseQuestion(app, link);
            break;
        case "answer":
            [title, content, authorName] = await phaseAnswer(app, link);
            break;
        case "pin":
            [title, content, authorName] = await phasePin(app, link);
            break;
        default:
            return;
    }
    openContent(app, title, link, content, type, authorName);
    return;
}

export async function clickInReadMode(app: App, evt: MouseEvent) {
    const target = evt.target as HTMLElement;
    if (
        !(target instanceof HTMLAnchorElement) ||
        !target.classList.contains("external-link")
    )
        return;
    const link = target.href;
    const targetContent = target.textContent;
    if (!targetContent) return;
    const type = getZhihuContentType(link);
    if (type === "Unknown Item Type") return;
    // 在 modal 里点击我的知乎文章，需要跳转
    if (link === "https://zhuanlan.zhihu.com/p/1901622331102696374") return;
    evt.preventDefault();
    evt.stopPropagation();
    openZhihuLink(app, link, type);
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
            // 检测上一次光标是否在当前链接内，如果是的话表明在编辑链接，从而return掉
            const wasLastCursorInside =
                lastPos !== null && lastPos >= linkStart && lastPos <= linkEnd;
            if (wasLastCursorInside) return;
            const linkText = found[1];
            const link = found[2];
            const type = getZhihuContentType(link);
            if (type === "Unknown Item Type") return;
            // 拦截点击
            evt.preventDefault();
            evt.stopPropagation();
            openZhihuLink(app, link, type);
            return;
        }
    }
}
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
        return await fetchWithCookies(); // 第一次尝试
    } catch (error) {
        console.warn(error);
        new Notice("cookie 已失效，正在尝试刷新...");
        try {
            await zhihuRefreshZseCookies(app); // 刷新 cookies
            return await fetchWithCookies(); // 再次尝试
        } catch (error2) {
            console.error(locale.notice.requestAnswerFailed, error2);
            new Notice(
                `${locale.notice.requestAnswerFailed}, ${error2.message}`,
            );
            return "";
        }
    }
}

async function phaseAnswer(
    app: App,
    zhihuLink: string,
): Promise<[string, string, string]> {
    const [questionId, answerId] = getQuestionAndAnswerId(zhihuLink);
    const htmlText = await getZhihuContentHTML(app, zhihuLink);
    // 使用 DOMParser 解析 HTML 字符串
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, "text/html");
    // 获取指定 script 标签，里面有关于回答和问题的所有数据
    const scriptTag = doc.querySelector(
        'script#js-initialData[type="text/json"]',
    );
    if (!scriptTag) throw new Error("js-initialData script tag not found");
    const jsonText = scriptTag.textContent; // 提取 JSON 内容并解析
    if (!jsonText) throw new Error("js-initialData is empty");
    const jsonData = JSON.parse(jsonText);
    const data = jsonData?.initialState?.entities?.answers?.[answerId];
    const writerName = data?.author?.name || "知乎用户";
    const content = data?.content;
    const title = data?.question?.title || `知乎问题${questionId}`;
    return [title, content, writerName];
}

async function phaseArticle(
    app: App,
    zhihuLink: string,
): Promise<[string, string, string]> {
    const articleId = getArticleId(zhihuLink);
    const htmlText = await getZhihuContentHTML(app, zhihuLink);
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, "text/html");
    // 获取指定 script 标签，里面有关于文章的所有数据
    const scriptTag = doc.querySelector(
        'script#js-initialData[type="text/json"]',
    );
    if (!scriptTag) throw new Error("js-initialData script tag not found");
    const jsonText = scriptTag.textContent; // 提取 JSON 内容并解析
    if (!jsonText) throw new Error("js-initialData is empty");
    const jsonData = JSON.parse(jsonText);
    const data = jsonData?.initialState?.entities?.articles?.[articleId];
    const writerName = data?.author?.name || "知乎用户";
    const content = data?.content;
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
    // 获取指定 script 标签，里面有关于问题的所有数据
    const scriptTag = doc.querySelector(
        'script#js-initialData[type="text/json"]',
    );
    if (!scriptTag) throw new Error("js-initialData script tag not found");
    const jsonText = scriptTag.textContent; // 提取 JSON 内容并解析
    if (!jsonText) throw new Error("js-initialData is empty");
    const jsonData = JSON.parse(jsonText);
    const quesData = jsonData?.initialState?.entities?.questions?.[questionId];
    const asker = quesData?.author?.name || "知乎用户";
    const questionDetail = quesData?.detail;
    const title = quesData?.title || `知乎问题${questionId}`;
    // 下面需要附上问题回答，一般在5个左右
    const answerData = jsonData?.initialState?.entities?.answers;
    const answerContainer = doc.createElement("div");
    for (const key in answerData) {
        const answer = answerData[key];
        const header = doc.createElement("h1");
        const link = doc.createElement("a");
        link.href = `https://www.zhihu.com/question/${questionId}/answer/${answer?.id}`;
        link.textContent = `${answer?.author?.name || "知乎用户"}的回答`;
        header.appendChild(link);
        const content = doc.createElement("div");
        content.innerHTML = answer.content;
        answerContainer.appendChild(header);
        answerContainer.appendChild(content);
    }
    const container = doc.createElement("div");
    container.innerHTML = questionDetail; // 问题详情
    container.appendChild(answerContainer); // 问题回答
    return [title, container.innerHTML, asker];
}

async function phasePin(
    app: App,
    zhihuLink: string,
): Promise<[string, string, string]> {
    const pinId = getPinId(zhihuLink);
    const htmlText = await getZhihuContentHTML(app, zhihuLink);
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, "text/html");
    // 获取指定 script 标签，里面有关于想法的所有数据
    const scriptTag = doc.querySelector(
        'script#js-initialData[type="text/json"]',
    );
    if (!scriptTag) throw new Error("js-initialData script tag not found");
    const jsonText = scriptTag.textContent; // 提取 JSON 内容并解析
    if (!jsonText) throw new Error("js-initialData is empty");
    const jsonData = JSON.parse(jsonText);
    const pinData = jsonData?.initialState?.entities?.pins?.[pinId];
    const users = jsonData?.initialState?.entities?.users;
    const contentHtml = pinData?.contentHtml;
    const title = `想法${pinId}`;
    // author 在JSON中，但是由于不知道用户的id，所以无法直接获取
    // 需要遍历JSON中的names字段获取
    let author = "知乎用户";
    for (const key in users) {
        if (Object.prototype.hasOwnProperty.call(users, key)) {
            const user = users[key as keyof typeof users];
            if (user && "name" in user && typeof user.name === "string") {
                author = user.name;
                break;
            }
        }
    }
    // 下面是想法后面附加的图片
    const imgContainer = doc.createElement("div");
    const content = pinData?.content;
    for (const entry of content) {
        if (entry?.type === "image") {
            const newImg = doc.createElement("img");
            newImg.src = entry.originalUrl;
            newImg.alt = "";
            newImg.width = entry.width;
            newImg.height = entry.height;
            imgContainer.appendChild(newImg);
        }
    }
    contentHtml.innerHTML = imgContainer;
    return [title, contentHtml, author];
}

export async function openContent(
    app: App,
    title: string,
    url: string,
    content: string,
    type: string,
    authorName?: string,
) {
    const typeStr = fromTypeGetStr(type);
    const folderPath = "zhihu";
    title = stripHtmlTags(title);
    const fileName = removeSpecialChars(
        `${title}-${authorName}的${typeStr}.md`,
    );
    const filePath = `${folderPath}/${fileName}`;

    const folder = app.vault.getAbstractFileByPath(folderPath);
    if (!folder) {
        await app.vault.createFolder(folderPath);
    }

    const file = app.vault.getAbstractFileByPath(filePath);

    if (!file) {
        const markdown = htmlToMd(content);
        const newFile = await app.vault.create(filePath, markdown);
        await app.fileManager.processFrontMatter(newFile, (fm) => {
            fm.tags = `zhihu-${type}`;
            fm["zhihu-link"] = url;
        });
        const leaf = this.app.workspace.getLeaf();
        await leaf.openFile(newFile as TFile);
        return;
    } else if (!(file instanceof TFile)) {
        console.error(`Path ${filePath} is not a file`);
        return;
    }

    const leaf = this.app.workspace.getLeaf();
    await leaf.openFile(file as TFile);
}

function removeSpecialChars(input: string): string {
    // 删除让链接无法工作的符号：# ^ [ ] |
    input = input.replace(/[#^[\]|]/g, "");
    if (Platform.isMacOS) {
        // macOS系统实测的不允许字符：\ / :
        input = input.replace(/[\\/ :]/g, "");
    } else {
        // 非 macOS 的操作系统，规则较多，仅测试了 Windows 和 Android 平台
        // 不允许字符：/ \ " * : | ? < >
        input = input.replace(/[/\\<>"*:|]/g, "");
        // Windows 系统不允许半角问号在标题中出现
        // 但是知乎问题大部分都带有问号，所以做一个替换
        input = input.replace(/\?/g, "？");
    }
    return input;
}

function stripHtmlTags(input: string): string {
    return input.replace(/<[^>]*>/g, "");
}

function fromTypeGetStr(type: string) {
    switch (type) {
        case "article":
            return "文章";
        case "question":
            return "提问";
        case "answer":
            return "回答";
        case "pin":
            return "想法";
        default:
            return "Unknown Item Type";
    }
}

function getZhihuContentType(url: string): string {
    try {
        new URL(url);
    } catch {
        return "Unknown Item Type";
    }

    const patterns = {
        answer: /zhihu\.com\/question\/\d+\/answer\/\d+/,
        article: /zhuanlan\.zhihu\.com\/p\/\d+/,
        question: /zhihu\.com\/question\/\d+$/,
        pin: /zhihu\.com\/pin\/\d+/,
    };

    if (patterns.answer.test(url)) {
        return "answer";
    } else if (patterns.article.test(url)) {
        return "article";
    } else if (patterns.question.test(url)) {
        return "question";
    } else if (patterns.pin.test(url)) {
        return "pin";
    }

    return "Unknown Item Type";
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

    constructor(app: App) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: locale.ui.enterZhihuLink });

        this.inputEl = new TextComponent(contentEl);
        this.inputEl.inputEl.addClass("zhihu-link-input");
        this.inputEl.setPlaceholder(locale.ui.enterZhihuLinkPlaceholder);

        // 添加键盘事件监听
        this.inputEl.inputEl.addEventListener(
            "keydown",
            async (event: KeyboardEvent) => {
                if (event.key === "Enter") {
                    const value = this.inputEl.getValue().trim();
                    const type = getZhihuContentType(value);
                    if (type === "Unknown Item Type") {
                        new Notice(`${locale.notice.linkInvalid}`);
                        return;
                    }
                    await openZhihuLink(this.app, value, type);
                    this.close();
                }
            },
        );
    }

    onClose() {
        this.contentEl.empty();
    }
}
