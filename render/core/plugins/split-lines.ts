import { visit } from "unist-util-visit";

// 将remark break替换成如下自定义插件
// 因为remark break不会将单独一行作为一个p标签，而是会用一个大的p标签包裹，加<br>
// 但知乎是每一行都是被一个p标签包裹的
export function remarkSplitLinesToParagraphs() {
    return (tree: any) => {
        visit(
            tree,
            "paragraph",
            (node: any, index: number | undefined, parent: any) => {
                if (!parent || index === undefined) return;

                const groups: any[][] = [[]];

                for (const child of node.children) {
                    if (child.type === "break") {
                        groups.push([]);
                        continue;
                    }
                    if (child.type === "text") {
                        const parts = child.value.split(/\n/);
                        for (let i = 0; i < parts.length; i++) {
                            if (i > 0) groups.push([]);
                            if (parts[i]) {
                                groups[groups.length - 1].push({
                                    type: "text",
                                    value: parts[i],
                                });
                            }
                        }
                        continue;
                    }
                    groups[groups.length - 1].push(child);
                }

                const nonEmptyGroups = groups.filter((g) => g.length > 0);

                if (nonEmptyGroups.length <= 1) return;

                const newNodes = nonEmptyGroups.map((children) => ({
                    type: "paragraph",
                    children,
                }));

                parent.children.splice(index, 1, ...newNodes);

                return index + newNodes.length;
            },
        );
    };
}
