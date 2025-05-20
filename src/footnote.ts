import type {
    TokenizerAndRendererExtension,
    TokenizerThis,
    MarkedExtension,
    RendererExtension,
    RendererThis,
    Token,
} from "marked";

export interface Options {
    prefixId?: string;
    description?: string;
    refMarkers?: boolean;
}

export type Footnotes = {
    type: "footnotes";
    raw: string;
    rawItems: Footnote[];
    items: Footnote[];
};

export type Footnote = {
    type: "footnote";
    raw: string;
    label: string;
    refs: FootnoteRef[];
    content: Token[];
};

export type FootnoteRef = {
    type: "footnoteRef";
    raw: string;
    id: string;
    label: string;
};

export type LexerTokens = {
    hasFootnotes: boolean;
    tokens: Token[];
};

/**
 * Returns an extension object for parsing footnote definitions.
 */
export function createFootnote(lexer: LexerTokens, description: string) {
    const footnotes: Footnotes = {
        type: "footnotes",
        raw: description,
        rawItems: [],
        items: [],
    };

    return {
        name: "footnote",
        level: "block",
        childTokens: ["content"],
        tokenizer(this: TokenizerThis, src: string) {
            if (!lexer.hasFootnotes) {
                this.lexer.tokens.push(footnotes);

                lexer.tokens = this.lexer.tokens;
                lexer.hasFootnotes = true;

                // always begin with empty items
                footnotes.rawItems = [];
                footnotes.items = [];
            }

            const match =
                /^\[\^([^\]\n]+)\]:(?:[ \t]+|[\n]*?|$)([^\n]*?(?:\n|$)(?:\n*?[ ]{4,}[^\n]*)*)/.exec(
                    src,
                );

            if (match) {
                const [raw, label, text = ""] = match;
                let content = text.split("\n").reduce((acc, curr) => {
                    return acc + "\n" + curr.replace(/^(?:[ ]{4}|[\t])/, "");
                }, "");

                const contentLastLine = content.trimEnd().split("\n").pop();

                content +=
                    // add lines after list, blockquote, codefence, and table
                    contentLastLine &&
                    /^[ \t]*?[>\-*][ ]|[`]{3,}$|^[ \t]*?[|].+[|]$/.test(
                        contentLastLine,
                    )
                        ? "\n\n"
                        : "";

                const token: Footnote = {
                    type: "footnote",
                    raw,
                    label,
                    refs: [],
                    content: this.lexer.blockTokens(content),
                };

                footnotes.rawItems.push(token);

                return token;
            }
        },
        renderer() {
            // skip it for now!
            // we will render all `Footnote` through the footnotes renderer
            return "";
        },
    } as TokenizerAndRendererExtension;
}

/**
 * Returns an extension object for rendering the list of footnotes.
 */
export function createFootnotes(prefixId: string) {
    return {
        name: "footnotes",
        renderer(this: RendererThis, { raw, items = [] }: Footnotes) {
            return "";
        },
    } as RendererExtension;
}

/**
 * A [marked](https://marked.js.org/) extension to support [GFM footnotes](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#footnotes).
 */
export default function markedFootnote(options: Options = {}): MarkedExtension {
    const {
        prefixId = "footnote-",
        description = "Footnotes",
        refMarkers,
    } = options;
    const lexer: LexerTokens = { hasFootnotes: false, tokens: [] };

    return {
        extensions: [
            createFootnote(lexer, description),
            createFootnoteRef(prefixId, refMarkers, lexer),
            createFootnotes(prefixId),
        ],
        walkTokens(token) {
            if (
                token.type === "footnotes" &&
                lexer.tokens.indexOf(token) === 0 &&
                token.items.length
            ) {
                lexer.tokens[0] = { type: "space", raw: "" };
                lexer.tokens.push(token);
            }

            if (lexer.hasFootnotes) lexer.hasFootnotes = false;
        },
    };
}

/**
 * Returns an extension object for parsing inline footnote references.
 */
export function createFootnoteRef(
    prefixId: string,
    refMarkers = false,
    lexer: LexerTokens,
) {
    let order = 0;
    return {
        name: "footnoteRef",
        level: "inline",
        tokenizer(this: TokenizerThis, src: string) {
            const match = /^\[\^([^\]\n]+)\]/.exec(src);

            if (match) {
                const [raw, label] = match;
                const footnotes = this.lexer.tokens[0] as Footnotes;
                const filteredRawItems = footnotes.rawItems.filter(
                    (item) => item.label === label,
                );

                if (!filteredRawItems.length) return;

                const rawFootnote = filteredRawItems[0];
                const footnote = footnotes.items.filter(
                    (item) => item.label === label,
                )[0];

                const ref: FootnoteRef = {
                    type: "footnoteRef",
                    raw,
                    id: "",
                    label,
                };

                if (footnote) {
                    ref.id = footnote.refs[0].id;
                    footnote.refs.push(ref);
                } else {
                    order++;
                    ref.id = String(order);
                    rawFootnote.refs.push(ref);
                    footnotes.items.push(rawFootnote);
                }

                return ref;
            }
        },
        renderer(this: RendererThis, { id, label }: FootnoteRef) {
            order = 0;

            const footnote = lexer.tokens.filter(
                (t) => t.type === "footnote",
            ) as [Footnote];

            const item = footnote?.find((item) => item.label === label);
            if (!item) return "";

            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const parsed = this.parser.parse(item.content).trim();
            const rawText = parsed.replace(/<[^>]+>/g, "").trim();
            const urls = rawText.match(urlRegex);
            const footnoteUrl = urls ? urls[0] : "";
            const footnoteText = rawText.replace(urlRegex, "").trim();
            return `<sup data-text="${footnoteText}" data-url="${footnoteUrl}" data-draft-node="inline" data-draft-type="reference" data-numero="${id}">[${id}]</sup>`;
        },
    } as TokenizerAndRendererExtension;
}
