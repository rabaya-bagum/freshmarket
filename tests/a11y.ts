import { Page, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// WCAG 2.1 level A and AA: the standard most accessibility laws point to (including Ontario's AODA).
export const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Scans the current screen with axe-core and fails with a readable list of problems.
 * Stripe's card form is a third-party iframe outside our control, so it is excluded.
 */
export async function expectNoA11yViolations(page: Page, screen: string) {
  // Let open/close animations finish so colours are measured at rest
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
  const results = await new AxeBuilder({ page }).withTags(WCAG).exclude('#pay-el iframe').analyze();
  const problems = results.violations.map(
    (v) =>
      `• [${v.impact}] ${v.id}: ${v.help}\n` +
      v.nodes.slice(0, 5).map((n) => `    ${n.target.join(' ')}\n      ${n.failureSummary?.split('\n').slice(1).join(' ').trim()}`).join('\n')
  );
  expect(problems, `Accessibility problems on "${screen}":\n${problems.join('\n')}`).toEqual([]);
}
