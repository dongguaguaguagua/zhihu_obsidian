import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
    title: "Zhihu on Obsidian",
    tagline: "让知乎写作再次伟大",
    favicon: "img/favicon.ico",

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
                },
                blog: false,
                theme: {
                    customCss: "./src/css/custom.css",
                },
            } satisfies Preset.Options,
        ],
    ],

    themeConfig: {
        // Replace with your project's social card
        image: "img/docusaurus-social-card.jpg",
        navbar: {
            title: "Zhihu Obsidian",
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
                            to: "/docs/介绍",
                        },
                        {
                            label: "快速开始",
                            to: "/docs/快速开始/安装插件",
                        },
                        {
                            label: "语法",
                            to: "/docs/语法/通用语法",
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
    } satisfies Preset.ThemeConfig,
};

export default config;
