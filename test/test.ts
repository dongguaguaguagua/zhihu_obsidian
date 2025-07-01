import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkHtml from "remark-html";

const markdownContent = `
# Hello, Remark!

This is a test case for converting Markdown to HTML using the **remark** ecosystem.

- Item 1
- Item 2

Check out this link: [Obsidian](https://obsidian.md).
`;

async function runTest() {
    console.log("Running remark conversion test...");

    const file = await unified()
        .use(remarkParse) // 解析 Markdown
        .use(remarkHtml) // 转换为 HTML
        .process(markdownContent); // 处理我们的内容

    const htmlOutput = String(file);

    console.log("\n--- Markdown Input ---\n");
    console.log(markdownContent);
    console.log("\n--- HTML Output ---\n");
    console.log(htmlOutput);
}

runTest().catch(console.error);
