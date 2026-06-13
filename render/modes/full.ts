import { App, TFile } from "obsidian";
import { loadSettings } from "../../src/settings";
import * as file from "../../src/files";
import { createZhihuHandlers, isNodeAloneInLine } from "../core/handlers";
import { convertMarkdownToZhihuHtml } from "../core/convert";
import { remarkTypst } from "../full/typst";
import { remarkZhihuImgs } from "../full/image_pipeline";
import type { WikiLinkNode } from "../core/plugins/wikilink";
import { u } from "unist-builder";
import type { Element } from "hast";

export { remarkTypst } from "../full/typst";
export { remarkZhihuImgs } from "../full/image_pipeline";

export async function remarkMdToHTML(app: App, md: string) {
    const idMap = new Map<string, number>(); // 原始id → 新编号
    const settings = await loadSettings(app.vault);

    const wikiLinkHandler = (state: any, node: WikiLinkNode): Element => {
        const name = node.value;
        const alias = node.data.alias;
        const alt = alias ? alias : name; // 一般来说`alias`都是存在的
        const mdFile = file.getFilePathFromName(app, name);

        if (mdFile instanceof TFile) {
            const metadata = app.metadataCache.getFileCache(mdFile);
            const fm = metadata?.frontmatter;
            // 如果zhihu-link链接存在，则说明是知乎文章，进一步处理内链
            if (fm && fm["zhihu-link"]) {
                const properties: { [key: string]: string } = {};
                properties.href = fm["zhihu-link"];
                const source = String(state.options.file.value ?? "");
                if (isNodeAloneInLine(node, source)) {
                    // 如果内链前没有任何内容，视为另起一行，做成card链接
                    properties["data-draft-node"] = "block";
                    properties["data-draft-type"] = "link-card";
                    properties["data-draft-title"] = alias;
                    properties["data-draft-cover"] = "";
                }
                return {
                    type: "element",
                    tagName: "a",
                    properties,
                    children: [u("text", alt)],
                };
            }
        }
        return {
            type: "element",
            tagName: "u",
            properties: {},
            children: [u("text", name)],
        };
    };

    const handlers = createZhihuHandlers({
        idMap,
        useZhihuHeadings: settings.useZhihuHeadings,
        wikiLinkHandler,
    });

    const htmlOutput = await convertMarkdownToZhihuHtml(md, {
        handlers,
        remarkPlugins: [
            // 将数学公式转换为 Typst 或者图片节点
            [remarkTypst as any, app],
            // 将上面解析的图片节点和维基链接节点转换为知乎图片
            [remarkZhihuImgs as any, app],
        ],
    });

    console.log(htmlOutput);
    return htmlOutput;
}
