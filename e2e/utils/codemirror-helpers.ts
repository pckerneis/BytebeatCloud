// Helper to clear and type in CodeMirror editor
export async function clearAndTypeInExpressionEditor(
  page: import('@playwright/test').Page,
  text: string,
) {
  const editor = page.locator('.expression-input .cm-content');
  await editor.click();
  // Select all and delete
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(text);
}
