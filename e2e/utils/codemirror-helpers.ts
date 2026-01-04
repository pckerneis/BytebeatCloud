// Helper to clear and type in CodeMirror editor
export async function clearAndTypeInExpressionEditor(
  page: import('@playwright/test').Page,
  text: string,
) {
  // In focus mode, the editor is directly .cm-content
  // In normal mode, it's .expression-input .cm-content
  const focusModeEditor = page.locator('.cm-content').first();
  const normalModeEditor = page.locator('.expression-input .cm-content');
  
  // Try focus mode first (simpler selector), fallback to normal mode
  const editor = (await focusModeEditor.count()) > 0 ? focusModeEditor : normalModeEditor;
  
  await editor.click();
  // Select all and delete
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(text);
}
