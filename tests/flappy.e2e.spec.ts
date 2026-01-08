import { test, expect } from "@playwright/test";

test.describe("Flappy mini-game", () => {
  test("can flap, hit game over, and restart", async ({ page }) => {
    await page.goto("/flappy");

    const container = page.locator('[data-testid="flappy-container"]');
    await expect(container).toBeVisible();

    const canvas = container.locator("canvas");
    await expect(canvas).toBeVisible();

    // Simulate a flap
    await container.click();

    // Wait for game over overlay with CTA
    const connectCta = page.getByText(/connect wallet to save score/i);
    await expect(connectCta).toBeVisible({ timeout: 15_000 });

    // Restart the run
    const restartButton = page.getByRole("button", { name: /restart run/i });
    await restartButton.click();

    // After restart, CTA should disappear and score should show baseline
    await expect(connectCta).toBeHidden({ timeout: 5_000 });
    await expect(page.getByText(/score:\s*0/i)).toBeVisible();
  });
});
