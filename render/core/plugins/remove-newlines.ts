import { visit } from "unist-util-visit";

// 去除多余的空行
export function rehypeRemoveBlockNewlines() {
    return (tree: any) => {
        visit(tree, (node: any, index: number | undefined, parent: any) => {
            // 遇到代码块 <pre> 或 <code>，跳过其子节点的遍历，防止破坏代码格式
            if (
                node.type === "element" &&
                (node.tagName === "pre" || node.tagName === "code")
            ) {
                return "skip";
            }

            // 如果当前节点是单纯的换行符文本，且它不是代码块内部的内容，将其删除
            if (
                node.type === "text" &&
                node.value === "\n" &&
                parent &&
                index !== undefined
            ) {
                parent.children.splice(index, 1);
                // 返回当前索引，避免因为数组截断导致遍历跳过下一个节点
                return index;
            }
        });
    };
}
