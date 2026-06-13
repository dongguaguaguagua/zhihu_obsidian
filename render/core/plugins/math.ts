import { mathFromMarkdown, mathToMarkdown } from "mdast-util-math";
import { math } from "micromark-extension-math";

export function mathPlugin(this: any) {
    const settings = this || {};
    const data = this.data();

    const micromarkExtensions =
        data.micromarkExtensions || (data.micromarkExtensions = []);
    const fromMarkdownExtensions =
        data.fromMarkdownExtensions || (data.fromMarkdownExtensions = []);
    const toMarkdownExtensions =
        data.toMarkdownExtensions || (data.toMarkdownExtensions = []);

    micromarkExtensions.push(math(settings));
    fromMarkdownExtensions.push(mathFromMarkdown());
    toMarkdownExtensions.push(mathToMarkdown(settings));
}
