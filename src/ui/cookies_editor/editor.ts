import { App, ExtraButtonComponent, Setting, ButtonComponent } from "obsidian";
import { basicSetup } from "./extensions";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { saveData } from "../../data";
import { ConfirmationModal } from "../../settings_tab";
import i18n, { type Lang } from "../../../locales";

const locale = i18n.current;

export async function createCookiesEditor(
    app: App,
    cookiesSetting: Setting,
    data: any,
) {
    const backupData = JSON.parse(JSON.stringify(data)); // create a deep copy of data
    const customCSSWrapper = cookiesSetting.controlEl.createDiv(
        "cookies-editor-wrapper",
    );
    const cookiesFooter = cookiesSetting.controlEl.createDiv("cookies-footer");
    const validity = cookiesFooter.createDiv("cookies-editor-validity");
    const validityIndicator = new ExtraButtonComponent(validity);
    validityIndicator
        .setIcon("checkmark")
        .extraSettingsEl.addClass("cookies-editor-validity-indicator");

    const validityText = validity.createDiv("cookies-editor-validity-text");
    validityText.addClass("setting-item-description");

    const extensions = basicSetup;

    function updateValidityIndicator(success: boolean) {
        validityIndicator.setIcon(success ? "checkmark" : "cross");
        validityIndicator.extraSettingsEl.removeClass(
            success ? "invalid" : "valid",
        );
        validityIndicator.extraSettingsEl.addClass(
            success ? "valid" : "invalid",
        );
        validityText.setText(
            success
                ? locale.settings.editorSyntaxSaved
                : locale.settings.editorSyntaxInvalid,
        );
    }

    const change = EditorView.updateListener.of(async (v: ViewUpdate) => {
        if (v.docChanged) {
            const cookies = v.state.doc.toString();

            let success = true;
            let parsedCookies;
            try {
                parsedCookies = JSON.parse(cookies);
            } catch (e) {
                success = false;
            }

            updateValidityIndicator(success);

            if (!success) return;
            data.cookies = parsedCookies;
            await saveData(app.vault, data);
        }
    });

    extensions.push(change);

    this.cookiesEditor = new EditorView({
        state: EditorState.create({
            doc: JSON.stringify(data.cookies, null, 2),
            extensions,
        }),
    });

    customCSSWrapper.appendChild(this.cookiesEditor.dom);
    const buttonsDiv = cookiesFooter.createDiv("cookies-editor-buttons");
    const reset = new ButtonComponent(buttonsDiv);
    reset
        .setIcon("switch")
        .setTooltip(locale.settings.editorResetTooltip)
        .onClick(async () => {
            new ConfirmationModal(
                app,
                locale.settings.editorResetWarning,
                (button) =>
                    button
                        .setButtonText(
                            locale.settings.editorResetWarningButtonText,
                        )
                        .setWarning(),
                async () => {
                    this.cookiesEditor.setState(
                        EditorState.create({
                            doc: JSON.stringify(backupData.cookies, null, 2),
                            extensions: extensions,
                        }),
                    );
                    updateValidityIndicator(true);
                    await saveData(app.vault, backupData);
                },
            ).open();
        });
}
