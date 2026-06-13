import { wikiLink, wikiImgLink } from "micromark-extension-wiki-link";
import * as muwl from "mdast-util-wiki-link";
import type { Node } from "unist";

export interface WikiLinkNode extends Node {
    type: "wikiLink";
    value: string;
    data: {
        alias: string;
        permalink: string;
        exists: boolean;
    };
}

export function wikiLinkPlugin(this: any, opts = {}) {
    const data = this.data();

    function add(field: any, value: any) {
        if (data[field]) data[field].push(value);
        else data[field] = [value];
    }

    add("micromarkExtensions", wikiLink(opts)); // 处理 [[...]]
    add("micromarkExtensions", wikiImgLink(opts)); // 处理 ![[...]]
    add("fromMarkdownExtensions", muwl.fromMarkdownWikiLink(opts));
    add("fromMarkdownExtensions", muwl.fromMarkdownWikiImgLink(opts));
}
