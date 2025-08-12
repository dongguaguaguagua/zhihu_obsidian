import { Notice, PluginSettingTab, Setting } from "obsidian";
import { basicSetup } from "./ui/cookies_editor/extensions";
import { EditorState } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { saveSettings } from "./settings";
import { execFileSync } from "child_process";

export async function createTypstEditor(
    st: PluginSettingTab,
    setting: Setting,
    style: string,
) {
    const customCSSWrapper = setting.controlEl.createDiv(
        "typst-editor-wrapper",
    );
    const extensions = basicSetup;

    const change = EditorView.updateListener.of(async (v: ViewUpdate) => {
        if (v.docChanged) {
            await saveSettings(st.app.vault, {
                typstPresetStyle: v.state.doc.toString(),
            });
        }
    });

    extensions.push(change);

    this.typstEditor = new EditorView({
        state: EditorState.create({
            doc: style,
            extensions: extensions,
        }),
    });
    customCSSWrapper.appendChild(this.typstEditor.dom);
}

export function getTypstVersion(path: string): string | null {
    if (!path) return null;
    try {
        const version = execFileSync(path, ["--version"]).toString();
        return version.replace("typst ", "");
    } catch (error) {
        console.error(error);
        return null;
    }
}
