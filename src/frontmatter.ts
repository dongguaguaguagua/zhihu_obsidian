export function removeFrontmatter(content: string) {
    return content.replace(/^---\n[\s\S]*?\n---\n*/, "");
}
