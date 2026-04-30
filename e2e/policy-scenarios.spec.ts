import { expect, test } from "@playwright/test";

const expectSearchParam = async (
	pageUrl: () => string,
	key: string,
	value: string,
) => {
	await expect.poll(() => new URL(pageUrl()).searchParams.get(key)).toBe(value);
};

const expectSearchParamMissing = async (pageUrl: () => string, key: string) => {
	await expect.poll(() => new URL(pageUrl()).searchParams.get(key)).toBeNull();
};

test.describe("policy scenario quick starts", () => {
	test("loads an epoch-specific preset into the results report", async ({
		page,
	}) => {
		await page.goto("/?wera=2010");

		await expect(
			page.getByRole("heading", { name: "Policy scenarios for 2010" }),
		).toBeVisible();
		await expect(page.getByText("Skip to results")).toHaveCount(0);

		await page
			.getByTestId("policy-scenario-2010-emergency-consolidation")
			.click();

		await expect(
			page.getByRole("heading", { name: "Fiscal report" }),
		).toBeVisible();
		await expect(page.getByText("4 decisions")).toBeVisible();
		await expect(page.getByText("Reduce borrowing")).toBeVisible();
		await expect(page.getByText("No decisions yet.")).toHaveCount(0);

		await expectSearchParam(() => page.url(), "wstep", "5");
		await expectSearchParam(() => page.url(), "wera", "2010");
		await expectSearchParam(() => page.url(), "wgoal", "reduce-borrowing");

		const wiz = new URL(page.url()).searchParams.get("wiz") ?? "";
		expect(wiz).toContain("t:vat-standard:2.5");
		expect(wiz).toContain("p:working-age-welfare:-5");
		expect(wiz).toContain("p:local-govt-grants:-10");
		expect(wiz).toContain("p:education:-3");
	});

	test("preserves borrowing strategy and context metadata for current presets", async ({
		page,
	}) => {
		await page.goto("/");

		await expect(
			page.getByRole("heading", { name: "Policy scenarios for 2024" }),
		).toBeVisible();
		await page.getByTestId("policy-scenario-current-borrow-investment").click();

		await expect(
			page.getByRole("heading", { name: "Fiscal report" }),
		).toBeVisible();
		await expect(page.getByText("4 decisions")).toBeVisible();
		await expect(page.getByText("No decisions yet.")).toHaveCount(0);

		await expectSearchParam(() => page.url(), "wstep", "5");
		await expectSearchParamMissing(() => page.url(), "wera");
		await expectSearchParamMissing(() => page.url(), "wgoal");

		const wiz = new URL(page.url()).searchParams.get("wiz") ?? "";
		expect(wiz).toContain("p:transport:15");
		expect(wiz).toContain("p:education:5");
		expect(wiz).toContain("p:nhs-england:5");
		expect(wiz).toContain("b:30000000000:long-funded:ctx=onp");
	});
});
