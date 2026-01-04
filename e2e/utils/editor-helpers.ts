import { expect } from '@playwright/test';
import { Page } from '@playwright/test';

// Helper to clear and type in CodeMirror editor
export async function clearAndTypeInExpressionEditor(
  page: Page,
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

// Helper to set title on both normal and focus pages
export async function setTitle(page: Page, title: string) {
  // Check if we're on a focus page
  const focusTitleDisplay = page.locator('.focus-title-display');
  const isFocusMode = (await focusTitleDisplay.count()) > 0;

  if (isFocusMode) {
    // Focus mode: click to edit pattern
    await focusTitleDisplay.click();
    const titleInput = page.locator('.focus-title-input');
    await titleInput.clear();
    await titleInput.fill(title);
    await titleInput.press('Enter');
  } else {
    // Normal mode: direct input field
    const titleField = page.getByPlaceholder('Name your bytebeat expression');
    await titleField.clear();
    await titleField.fill(title);
  }
}

// Helper to get title value on both normal and focus pages
export async function getTitleValue(page: Page): Promise<string> {
  // Check if we're on a focus page
  const focusTitleDisplay = page.locator('.focus-title-display');
  const isFocusMode = (await focusTitleDisplay.count()) > 0;

  if (isFocusMode) {
    // Focus mode: get text from display
    return await focusTitleDisplay.textContent() || '';
  } else {
    // Normal mode: get value from input field
    const titleField = page.getByPlaceholder('Name your bytebeat expression');
    return await titleField.inputValue();
  }
}

export async function expectTitleEquals(
  page: Page,
  expected: string,
  timeout = 10000,
) {
  await expect
    .poll(async () => getTitleValue(page), { timeout, message: `Title did not become "${expected}"` })
    .toBe(expected);
}
