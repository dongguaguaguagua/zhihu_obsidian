import { unified, type Plugin } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import rehypeRaw from "rehype-raw";
import type { Options as RemarkRehypeOptions } from "remark-rehype";

import { mathPlugin } from "./plugins/math";
import { wikiLinkPlugin } from "./plugins/wikilink";
import remarkCallout from "@r4ai/remark-callout";
import { remarkSplitLinesToParagraphs } from "./plugins/split-lines";
import { rehypeRemoveBlockNewlines } from "./plugins/remove-newlines";

type UnifiedUse = [Plugin, ...any[]];

export type ConvertMarkdownToZhihuHtmlOptions = {
    handlers: any;
    remarkPlugins?: UnifiedUse[];
};

export async function convertMarkdownToZhihuHtml(
    md: string,
    opts: ConvertMarkdownToZhihuHtmlOptions,
): Promise<string> {
    const rehypeOpts: RemarkRehypeOptions = {
        allowDangerousHtml: true,
        handlers: opts.handlers,
    };

    let processor: any = unified()
        .use(remarkParse)
        .use(remarkGfm) // 解析脚注、表格等
        .use(mathPlugin) // 解析数学公式
        .use(wikiLinkPlugin) // 解析 Obsidian 风格的图片链接
        .use(remarkCallout) // 解析 Obsidian 风格的 Callout
        .use(remarkSplitLinesToParagraphs); // 换行符换行

    for (const [plugin, ...args] of opts.remarkPlugins ?? []) {
        processor = processor.use(plugin as any, ...(args as any[]));
    }

    processor = processor
        .use(remarkRehype, undefined, rehypeOpts) // 转换其余不需要异步的节点
        .use(rehypeRaw) // 解析 HTML 标签
        // .use(rehypeFormat, { indent: 0 }) // 会导致行内公式被强制换行
        .use(rehypeRemoveBlockNewlines) // 去除HTML中的换行，避免在知乎网页端编辑的时候会出现大量换行
        .use(rehypeStringify);

    const output = await processor.process(md);
    return String(output);
}
