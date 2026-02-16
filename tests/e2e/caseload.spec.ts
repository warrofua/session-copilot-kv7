import { test, expect } from '@playwright/test';

test('Caseload Navigator displays learners and expands to show session history', async ({ page }) => {
    test.setTimeout(30000);

    // Debug requests
    page.on('request', request => console.log('>>', request.method(), request.url()));
    page.on('response', response => console.log('<<', response.status(), response.url()));

    // Set mobile viewport to ensure hamburger menu is visible
    await page.setViewportSize({ width: 375, height: 667 });

    // Mock the Auth API to provide learners
    await page.route('**/api/auth/me', async (route) => {
        console.log('Intercepting /api/auth/me');
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                user: {
                    id: 'demo-user-id',
                    email: 'demo@example.com',
                    name: 'Demo User',
                    role: 'bcba',
                    permissions: [],
                    encryptionSalt: 'mock-salt',
                    assignedLearnerIds: ['learner-1', 'learner-2']
                },
                organization: { id: 'org-1', name: 'Demo Org' },
                learners: [
                    { id: 'learner-1', name: 'Learner A', orgId: 'org-1', status: 'active' },
                    { id: 'learner-2', name: 'Learner B', orgId: 'org-1', status: 'active' }
                ]
            })
        });
    });

    // Navigate to /demo
    // We use /demo to ensure encryption is auto-initialized, bypassing the offline lock
    await page.goto('http://localhost:5174/demo');

    // Wait for standard elements
    await expect(page.locator('header')).toBeVisible();

    // Handle Terms Overlay if present
    const termsOverlay = page.locator('.terms-overlay');
    const acceptBtn = page.getByTestId('terms-accept-button');

    // Wait for overlay to potentially appear
    try {
        await termsOverlay.waitFor({ state: 'visible', timeout: 3000 });
        if (await termsOverlay.isVisible()) {
            await acceptBtn.click();
            await expect(termsOverlay).toBeHidden();
        }
    } catch {
        // Overlay didn't appear, likely already accepted or race condition cleared it
        console.log('Terms overlay handling: Not visible or timed out');
    }

    // Locate the Menu Button (SideDrawer trigger)
    const menuBtn = page.locator('.header-menu');
    await expect(menuBtn).toBeVisible();

    // Open Drawer
    await menuBtn.click();

    // Verify Drawer Title
    const drawer = page.locator('.side-drawer');
    await expect(drawer).toHaveClass(/open/);
    await expect(page.locator('.drawer-title')).toHaveText('Caseload Navigator');

    // Debug Drawer Content
    console.log('Drawer Content:', await drawer.innerText());

    // Verify Learner List is populated
    // Use class selector to avoid ambiguity
    const learnerA = page.locator('.tree-learner-name', { hasText: 'Learner A' });

    // Check if we accidentally hit the empty state (Strict Mode Safe)
    const noLearnersMsg = page.getByText('No learners assigned');
    if (await noLearnersMsg.isVisible()) {
        console.error('Drawer shows empty state - Learners not loaded');
    }

    await expect(learnerA).toBeVisible();
    const learnerB = page.getByText('Learner B');
    await expect(learnerB).toBeVisible();

    // Click Learner A to expand
    await learnerA.click();

    // Verify Session History (Empty State)
    // Since we haven't seeded the local indexedDB, it should be empty
    const emptyState = page.locator('.tree-empty').first();
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toHaveText('No recorded sessions');

    // Verify expanding another learner works independenty
    await learnerB.click();
    const emptyStates = page.locator('.tree-empty');
    await expect(emptyStates).toHaveCount(2);
});
