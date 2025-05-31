import { App, Vault, MarkdownView, Notice, TFile, requestUrl } from "obsidian";
import * as dataUtil from "./data";
import * as cookies from "./cookies";
import i18n, { type Lang } from "../locales";
const locale = i18n.current;
import { htmlToMd } from "./html_to_markdown";
import { addFrontmatter } from "./frontmatter";

export async function openZhihuLink(app: App, link: string) {
    const type = getZhihuContentType(link);
    let title = "";
    let content = "";
    let authorName = "";
    switch (type) {
        case "article":
            [title, content, authorName] = await phaseArticle(app, link);
            break;
        case "question":
            return;
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

export async function handleAnswerClickReadMode(app: App, evt: MouseEvent) {
    const target = evt.target as HTMLElement;
    // if (!(target && target.tagName === 'A')) return;
    if (
        !(target instanceof HTMLAnchorElement) ||
        !target.classList.contains("external-link")
    )
        return;
    const link = target.href;
    // const link = (target as HTMLAnchorElement).getAttribute("href");
    const targetConetent = target.textContent;
    if (!targetConetent) return;
    const type = getZhihuContentType(link);
    if (type === "Unknown Item Type") return;
    evt.preventDefault();
    evt.stopPropagation();
    openZhihuLink(app, link);
}

export async function handleAnswerClickLivePreview(app: App, evt: MouseEvent) {
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
        if (pos >= linkStart && pos <= linkEnd) {
            const linkText = found[1];
            const link = found[2];
            const type = getZhihuContentType(link);
            if (type === "Unknown Item Type") return;
            // 拦截点击
            evt.preventDefault();
            evt.stopPropagation();
            openZhihuLink(app, link);
        }
    }
}

async function getZhihuContentHTML(app: App, zhihuLink: string) {
    try {
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
    } catch (error) {
        console.error(locale.notice.requestAnswerFailed, error);
        new Notice(`${locale.notice.requestAnswerFailed},${error.message}`);
        return "";
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
    // 定位回答内容 div
    const contentEle = doc.querySelector(".RichContent-inner .RichText");
    const writerInfoEle = doc.querySelector(
        ".UserLink.AuthorInfo-name .UserLink-link",
    );
    const title = doc.querySelector(".QuestionHeader-title");
    if (contentEle && writerInfoEle && title) {
        const writerName = writerInfoEle.textContent?.trim() || "知乎用户";
        const titleStr = title.textContent?.trim() || `知乎问题${questionId}`;
        return [titleStr, contentEle.innerHTML, writerName];
    } else {
        new Notice(`${locale.notice.unableToFindAnswerContent}`);
        return ["", "", ""];
    }
}

async function phaseArticle(
    app: App,
    zhihuLink: string,
): Promise<[string, string, string]> {
    const articleId = getArticleId(zhihuLink);
    const htmlText = await getZhihuContentHTML(app, zhihuLink);
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, "text/html");
    const contentEle = doc.querySelector(".RichText");
    const writerInfoEle = doc.querySelector(
        ".UserLink.AuthorInfo-name .UserLink-link",
    );
    const questionTitleEle = doc.querySelector(".Post-Title");
    if (contentEle && writerInfoEle && questionTitleEle) {
        const writerName = writerInfoEle.textContent?.trim() || "知乎用户";
        const title =
            questionTitleEle.textContent?.trim() || `知乎文章${articleId}`;
        return [title, contentEle.innerHTML, writerName];
    } else {
        new Notice(`${locale.notice.unableToFindAnswerContent}`);
        return ["", "", ""];
    }
}

async function phasePin(
    app: App,
    zhihuLink: string,
): Promise<[string, string, string]> {
    const htmlText = await getZhihuContentHTML(app, zhihuLink);
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, "text/html");
    const contentEle = doc.querySelector(".RichText");
    const writerInfoEle = doc.querySelector(
        ".UserLink.AuthorInfo-name .UserLink-link",
    );

    if (contentEle && writerInfoEle) {
        const writerName = writerInfoEle.textContent?.trim() || "知乎用户";

        // 知乎想法比较特殊，有图片和文字。先解析文字，再解析图片
        // 将图片的链接放在一个div里，并添加到文字后面
        const imagePreviewSpans = doc.querySelectorAll(".Image-PreviewVague");
        const imagePreviewContainer = doc.createElement("div");

        imagePreviewSpans.forEach((span) => {
            const originalImg = span.querySelector("img");
            if (originalImg) {
                const dataOriginal = originalImg.getAttribute("data-original");
                if (dataOriginal) {
                    // 创建新的 <img> 标签
                    const newImg = doc.createElement("img");
                    newImg.src = dataOriginal;
                    newImg.alt = originalImg.alt || "";
                    newImg.width = originalImg.width;
                    newImg.height = originalImg.height;
                    imagePreviewContainer.appendChild(newImg);
                }
            }
        });

        imagePreviewSpans.forEach((span) => span.remove());
        contentEle.appendChild(imagePreviewContainer);
        return ["", contentEle.innerHTML, writerName];
    } else {
        new Notice(`${locale.notice.unableToFindAnswerContent}`);
        return ["", "", ""];
    }
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

    let file = app.vault.getAbstractFileByPath(filePath);
    let markdown = htmlToMd(content);
    markdown = addFrontmatter(markdown, "tags", `zhihu-${type}`);
    markdown = addFrontmatter(markdown, "link", url);
    if (!file) {
        file = await app.vault.create(filePath, markdown);
    } else if (!(file instanceof TFile)) {
        console.error(`Path ${filePath} is not a file`);
        return;
    }

    const leaf = this.app.workspace.getLeaf();
    await leaf.openFile(file as TFile);
}

function removeSpecialChars(input: string): string {
    return input.replace(/[/\\[\]|#^:]/g, "");
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
    if (match) {
        return [match[1], match[2]];
    }
    return ["", ""];
}

function getArticleId(link: string): string {
    const match = link.match(/^https:\/\/zhuanlan\.zhihu\.com\/p\/\d+$/);
    if (match) {
        return match[1];
    }
    return "";
}
