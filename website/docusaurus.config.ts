import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
    title: "知乎 Obsidian 插件",
    tagline: "重拾知乎创作的乐趣",
    favicon: "img/logo.svg",

    // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
    future: {
        v4: true, // Improve compatibility with the upcoming Docusaurus v4
    },

    // Set the production url of your site here
    url: "https://zhihu.melonhu.cn/",
    // Set the /<baseUrl>/ pathname under which your site is served
    // For GitHub pages deployment, it is often '/<projectName>/'
    baseUrl: "/",

    // GitHub pages deployment config.
    // If you aren't using GitHub pages, you don't need these.
    organizationName: "dongguaguaguagua", // Usually your GitHub org/user name.
    projectName: "zhihu_obsidian", // Usually your repo name.

    onBrokenLinks: "throw",
    onBrokenMarkdownLinks: "warn",

    // Even if you don't use internationalization, you can use this field to set
    // useful metadata like html lang. For example, if your site is Chinese, you
    // may want to replace "en" with "zh-Hans".
    i18n: {
        defaultLocale: "zh-cn",
        locales: ["zh-cn"],
    },

    presets: [
        [
            "classic",
            {
                docs: {
                    sidebarPath: "./sidebars.ts",
                    // Please change this to your repo.
                    // Remove this to remove the "edit this page" links.
                    editUrl:
                        "https://github.com/dongguaguaguagua/zhihu_obsidian/tree/master/website/",
                    remarkPlugins: [remarkMath],
                    rehypePlugins: [rehypeKatex],
                },
                blog: false,
                theme: {
                    customCss: "./src/css/custom.css",
                },
            } satisfies Preset.Options,
        ],
    ],
    // KaTeX CSS
    stylesheets: [
        {
            href: "https://cdn.jsdelivr.net/npm/katex@0.13.24/dist/katex.min.css",
            type: "text/css",
            integrity:
                "sha384-odtC+0UGzzFL/6PNoE8rX/SPcQDXBJ+uRepguP4QkPCm2LBxH3FA3y+fKSiJ+AmM",
            crossorigin: "anonymous",
        },
    ],
    // 重定向以兼容旧的中文路径
    plugins: [
        [
            "@docusaurus/plugin-client-redirects",
            {
                redirects: [
                    { from: "/docs/介绍", to: "/docs/intro" },
                    {
                        from: "/docs/快速开始/安装插件",
                        to: "/docs/begin/install",
                    },
                    {
                        from: "/docs/快速开始/登录知乎",
                        to: "/docs/begin/login",
                    },
                    {
                        from: "/docs/快速开始/发布文章",
                        to: "/docs/begin/create-new-article",
                    },
                    {
                        from: "/docs/快速开始/发布回答",
                        to: "/docs/begin/create-new-answer",
                    },
                    {
                        from: "/docs/快速开始/浏览知乎",
                        to: "/docs/begin/browse",
                    },
                    { from: "/docs/语法/通用语法", to: "/docs/syntax/common" },
                    { from: "/docs/语法/图片", to: "/docs/syntax/image" },
                    { from: "/docs/语法/@知友", to: "/docs/syntax/at-members" },
                    { from: "/docs/语法/目录", to: "/docs/syntax/toc" },
                    { from: "/docs/语法/链接", to: "/docs/syntax/link" },
                    {
                        from: "/docs/语法/数学公式",
                        to: "/docs/syntax/math-formula",
                    },
                    {
                        from: "/docs/语法/标注块",
                        to: "/docs/syntax/callout",
                    },
                    {
                        from: "/docs/语法/Mermaid",
                        to: "/docs/syntax/mermaid",
                    },
                    {
                        from: "/docs/语法/Typst 模式",
                        to: "/docs/syntax/typst",
                    },
                    {
                        from: "/docs/语法/创作声明",
                        to: "/docs/syntax/disclaimer",
                    },
                ],
            },
        ],
    ],
    themeConfig: {
        image: "img/social-card.jpg",
        navbar: {
            title: "知乎 Obsidian",
            logo: {
                alt: "Zhihu on Obsidian Logo",
                src: "img/logo.svg",
            },
            items: [
                {
                    type: "docSidebar",
                    sidebarId: "tutorialSidebar",
                    position: "left",
                    label: "文档",
                },
                {
                    href: "https://zhuanlan.zhihu.com/p/1901622331102696374",
                    label: "知乎文章",
                    position: "left",
                },
                {
                    href: "https://github.com/dongguaguaguagua/zhihu_obsidian",
                    label: "GitHub",
                    position: "right",
                },
            ],
        },
        footer: {
            style: "dark",
            links: [
                {
                    title: "文档",
                    items: [
                        {
                            label: "介绍",
                            to: "/docs/intro",
                        },
                        {
                            label: "快速开始",
                            to: "/docs/begin/install",
                        },
                        {
                            label: "语法",
                            to: "/docs/syntax",
                        },
                    ],
                },
                {
                    title: "社区",
                    items: [
                        {
                            label: "知乎",
                            href: "https://zhuanlan.zhihu.com/p/1901622331102696374",
                        },
                        {
                            label: "LINUX DO",
                            href: "https://linux.do/t/topic/767606",
                        },
                    ],
                },
                {
                    title: "做贡献",
                    items: [
                        {
                            label: "GitHub",
                            href: "https://github.com/dongguaguaguagua/zhihu_obsidian",
                        },
                    ],
                },
            ],
            copyright: `Copyright © ${new Date().getFullYear()} Zhihu on Obsidian. Built with Docusaurus.`,
        },
        prism: {
            theme: prismThemes.github,
            darkTheme: prismThemes.dracula,
        },
        algolia: {
            appId: "1TKNQLWHXL",
            apiKey: "9f887dfda6c953a9d102342890456522",
            indexName: "zhihu-obsidian-docsearch",
            contextualSearch: true,
            searchPagePath: "search",
        },
    } satisfies Preset.ThemeConfig,
};

export default config;
