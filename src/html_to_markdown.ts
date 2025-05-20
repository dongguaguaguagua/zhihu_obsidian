import TurndownService from "turndown";

export function htmlToMd(html: string): string {
    try {
        const turndownService = new TurndownService({
            headingStyle: "atx",
            codeBlockStyle: "fenced",
            bulletListMarker: "-",
            emDelimiter: "*",
            strongDelimiter: "**",
            linkStyle: "inlined",
        });

        // 规则 1：数学公式图片转为 $公式$ 或 $$公式$$
        turndownService.addRule("mathImgToLatex", {
            filter: function (node) {
                return (
                    node.nodeName === "IMG" &&
                    (node as HTMLElement).getAttribute("eeimg") === "1"
                );
            },
            replacement: function (content, node) {
                const alt = (node as HTMLElement).getAttribute("alt") || "";
                const escapedAlt = alt.replace(/\$/g, "\\$");
                const trimmedAlt = escapedAlt.trim();
                if (trimmedAlt.endsWith("\\\\")) {
                    const cleanAlt = trimmedAlt.slice(0, -2);
                    return `$$${cleanAlt}$$`;
                }
                return `$${trimmedAlt}$`;
            },
        });

        // 规则 2：带 lang 的 <pre> 转为 ```语言代码块
        turndownService.addRule("preWithLang", {
            filter: function (node) {
                return (
                    node.nodeName === "PRE" &&
                    (node as HTMLElement).getAttribute("lang") !== null
                );
            },
            replacement: function (content, node) {
                const lang = (node as HTMLElement).getAttribute("lang") || "";
                const code = node.textContent || "";
                return `\`\`\`${lang}\n${code.trim()}\n\`\`\``;
            },
        });

        // 规则 3：将 HTML 表格转换为 Markdown 表格
        turndownService.addRule("tableToMarkdown", {
            filter: ["table"],
            replacement: function (content, node) {
                const rows = Array.from(node.querySelectorAll("tr"));
                if (rows.length === 0) return "";

                let markdown = "";
                const headers = Array.from(rows[0].querySelectorAll("th, td"));
                const headerTexts = headers.map(
                    (cell) => cell.textContent?.trim() || "",
                );
                markdown += `| ${headerTexts.join(" | ")} |\n`;
                markdown += `| ${headerTexts.map(() => "-----").join(" | ")} |\n`;
                rows.slice(1).forEach((row) => {
                    const cells = Array.from(row.querySelectorAll("td, th"));
                    const cellTexts = cells.map(
                        (cell) => cell.textContent?.trim() || "",
                    );
                    markdown += `| ${cellTexts.join(" | ")} |\n`;
                });

                return markdown;
            },
        });

        // 规则 4：将 <figure> 包含的 <img> 和 <figcaption> 转为 Markdown 图片
        turndownService.addRule("figureToImage", {
            filter: ["figure"],
            replacement: function (content, node) {
                const img = node.querySelector("img");
                const figcaption = node.querySelector("figcaption");
                if (!img) return "";
                const src = img.getAttribute("src") || "";
                const alt = figcaption?.textContent?.trim() || "";
                return `![${alt}](${src})`;
            },
        });

        // 规则 5：忽略 <h*> 标签中的 <br> 标签
        turndownService.addRule("ignoreBrInHeading", {
            filter: function (node, options) {
                return (
                    node.nodeName === "BR" &&
                    node.parentElement?.nodeName.match(/^H[1-6]$/) !== null
                );
            },
            replacement: function () {
                return "";
            },
        });

        const footnotes: Record<string, string> = {};

        // 规则 5：将<sup data-*="...">[1]</sup>转换为脚注
        turndownService.addRule("footnote", {
            filter: (node) => {
                return (
                    node.nodeName === "SUP" &&
                    node instanceof HTMLElement &&
                    typeof node.dataset.text === "string" &&
                    typeof node.dataset.url === "string" &&
                    /^\[\d+\]$/.test(node.textContent || "")
                );
            },
            replacement: function (content, node) {
                const el = node as HTMLElement;
                const numero = el.dataset.numero ?? "1";
                const label = `[^${numero}]`;
                const footnoteText = `${el.dataset.text} ${el.dataset.url}`;
                footnotes[numero] = footnoteText;
                return label;
            },
        });

        // 规则6：转义文本和链接文本中的`#`号，否则会干扰 Obsidian 内部的标签系统。
        turndownService.addRule("escapeHashInPlainText", {
            filter: (node) => {
                if (node.nodeType !== 3) return false;
                const value = node.nodeValue;
                return typeof value === "string" && value.includes("#");
            },
            replacement: (content) => {
                return content.replace(/#/g, "\\#");
            },
        });

        turndownService.addRule("escapeHashInLinkText", {
            filter: "a",
            replacement: function (_content, node) {
                const el = node as HTMLAnchorElement;
                const text = (el.textContent || "").replace(/#/g, "\\#");
                const href = el.getAttribute("href") || "";
                return `[${text}](${href})`;
            },
        });

        let markdown = turndownService.turndown(html);

        // 将脚注内容追加到文末
        const footnoteEntries = Object.entries(footnotes)
            .map(([num, text]) => `[^${num}]: ${text}`)
            .join("\n");

        if (footnoteEntries) {
            markdown += `\n\n${footnoteEntries}`;
        }

        return markdown;
    } catch (error) {
        console.error("HTML to Markdown conversion failed:", error);
        return "";
    }
}
