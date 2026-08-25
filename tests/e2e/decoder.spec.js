import { test, expect } from "@playwright/test";

const DECODER_PATH = "/tx-decoder";

test.describe("Decoder page", () => {
  test("loads and shows the decode input form", async ({ page }) => {
    await page.goto(DECODER_PATH);
    await expect(
      page.getByPlaceholder("Enter hex data to decode (e.g., 0x1234abcd...)"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Decode" })).toBeVisible();
  });

  test("redirects legacy shared URLs to the tx decoder route", async ({
    page,
  }) => {
    await page.goto("/?data=0x12345678&with_abi=true");
    await expect(page).toHaveURL(
      /\/tx-decoder\?data=0x12345678&with_abi=true$/,
    );
    await expect(
      page.getByPlaceholder("Enter hex data to decode (e.g., 0x1234abcd...)"),
    ).toBeVisible();
  });

  test("shows a result or error after submitting hex data", async ({
    page,
  }) => {
    await page.goto(DECODER_PATH);
    const input = page.getByPlaceholder(
      "Enter hex data to decode (e.g., 0x1234abcd...)",
    );
    await input.fill("0x12345678");
    await page.getByRole("button", { name: "Decode" }).click();
    // Wait for either a decode result or an error to appear (both are valid outcomes
    // depending on whether BACKEND_URL is configured and what the backend returns)
    await expect(
      page
        .locator("h2")
        .filter({ hasText: "Result:" })
        .or(page.locator("strong").filter({ hasText: "Error:" })),
    ).toBeVisible({ timeout: 15000 });
  });

  test("shows a validation error when submitting whitespace-only input", async ({
    page,
  }) => {
    await page.goto(DECODER_PATH);
    const input = page.getByPlaceholder(
      "Enter hex data to decode (e.g., 0x1234abcd...)",
    );
    await input.fill("   ");
    await page.getByRole("button", { name: "Decode" }).click();
    // The page shows "Please enter some data" for whitespace-only input
    await expect(page.getByText("Please enter some data")).toBeVisible({
      timeout: 5000,
    });
  });

  test("adds an independent second decoder tab", async ({ page }) => {
    await page.goto(DECODER_PATH);
    const activePanel = () =>
      page.locator('[role="tabpanel"]').filter({ visible: true });
    const inputOf = () =>
      activePanel().getByPlaceholder(
        "Enter hex data to decode (e.g., 0x1234abcd...)",
      );

    await page.getByRole("button", { name: "+ Add Tab" }).click();
    await expect(page.getByRole("tab")).toHaveCount(2);

    await inputOf().fill("0xaaaa");
    await expect(inputOf()).toHaveValue("0xaaaa");

    // Switch back to the first tab — its input is still empty
    await page.getByRole("tab").nth(0).click();
    await expect(inputOf()).toHaveValue("");
    await inputOf().fill("0xbbbb");

    // Switch to the second tab — its value is preserved independently
    await page.getByRole("tab").nth(1).click();
    await expect(inputOf()).toHaveValue("0xaaaa");
  });

  test("restores tabs and their inputs after a reload", async ({ page }) => {
    await page.goto(DECODER_PATH);
    const activePanel = () =>
      page.locator('[role="tabpanel"]').filter({ visible: true });
    const inputOf = () =>
      activePanel().getByPlaceholder(
        "Enter hex data to decode (e.g., 0x1234abcd...)",
      );

    await inputOf().fill("0xaaaa");
    await page.getByRole("button", { name: "+ Add Tab" }).click();
    await inputOf().fill("0xbbbb");

    await page.reload();

    // The second tab was active; its input is restored from localStorage.
    await expect(page.getByRole("tab")).toHaveCount(2);
    await expect(inputOf()).toHaveValue("0xbbbb");

    // Switch to the first tab — its input is restored too.
    await page.getByRole("tab").nth(0).click();
    await expect(inputOf()).toHaveValue("0xaaaa");
  });

  test("reorders tabs by dragging", async ({ page }) => {
    await page.goto(DECODER_PATH);

    const rename = async (tab, name) => {
      await tab.dblclick();
      await page.locator('input[class*="tabInput"]').fill(name);
      await page.locator('input[class*="tabInput"]').press("Enter");
    };

    const tabs = page.getByRole("tab");
    await page.getByRole("button", { name: "+ Add Tab" }).click();
    await page.getByRole("button", { name: "+ Add Tab" }).click();
    await expect(tabs).toHaveCount(3);

    await rename(tabs.nth(0), "A");
    await rename(tabs.nth(1), "B");
    await rename(tabs.nth(2), "C");
    await expect(tabs.nth(0)).toContainText("A");
    await expect(tabs.nth(1)).toContainText("B");
    await expect(tabs.nth(2)).toContainText("C");

    // Dispatch an HTML5 drag sequence deterministically: dragstart on the
    // source tab, dragover on the target tab, then dragend.
    const drag = async (sourceIndex, targetIndex, ratio) => {
      await page.evaluate(
        ({ sourceIndex, targetIndex, ratio }) => {
          const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
          const source = tabs[sourceIndex];
          const target = tabs[targetIndex];
          const rect = target.getBoundingClientRect();
          const dataTransfer = new DataTransfer();
          source.dispatchEvent(
            new DragEvent("dragstart", { bubbles: true, dataTransfer }),
          );
          target.dispatchEvent(
            new DragEvent("dragover", {
              bubbles: true,
              clientX: rect.left + rect.width * ratio,
              clientY: rect.top + rect.height / 2,
            }),
          );
          target.dispatchEvent(new DragEvent("dragend", { bubbles: true }));
        },
        { sourceIndex, targetIndex, ratio },
      );
    };

    // Drag C onto the left half of A → C, A, B
    await drag(2, 0, 0.1);
    await expect(tabs.nth(0)).toContainText("C");
    await expect(tabs.nth(1)).toContainText("A");
    await expect(tabs.nth(2)).toContainText("B");

    // Drag A (now index 2) onto the left half of B → C, B, A
    await drag(2, 1, 0.1);
    await expect(tabs.nth(0)).toContainText("C");
    await expect(tabs.nth(1)).toContainText("B");
    await expect(tabs.nth(2)).toContainText("A");
  });
});

test.describe("Encode back", () => {
  const TRANSFER_DATA =
    "0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045000000000000000000000000000000000000000000000000002386f26fc10000";
  const EXPECTED_EDITED =
    "0xa9059cbb0000000000000000000000001111111111111111111111111111111111111111000000000000000000000000000000000000000000000000002386f26fc10000";
  const DECODE_RESPONSE =
    '{"msg":"ok","data":[{"func":"transfer(address,uint256)",' +
    '"args":{"to":"0xd8da6bf26964af9d7eed9e03e53415d37aa96045",' +
    '"amount":10000000000000000}}]}';

  test("decode, edit recipient, encode back", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.route("**/api/decode**", (route) =>
      route.fulfill({ contentType: "application/json", body: DECODE_RESPONSE }),
    );
    await page.goto(DECODER_PATH);
    await page
      .getByPlaceholder("Enter hex data to decode (e.g., 0x1234abcd...)")
      .fill(TRANSFER_DATA);
    await page.getByRole("button", { name: "Decode" }).click();

    await page.getByRole("button", { name: "Edit & Encode" }).click();
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();
    await textarea.fill(
      '{\n  "to": "0x1111111111111111111111111111111111111111",\n  "amount": "10000000000000000"\n}',
    );
    await page.getByRole("button", { name: "Encode", exact: true }).click();

    await expect(page.locator("code")).toHaveText(EXPECTED_EDITED);
    await page.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();
  });

  test("shows an inline error for invalid JSON", async ({ page }) => {
    await page.route("**/api/decode**", (route) =>
      route.fulfill({ contentType: "application/json", body: DECODE_RESPONSE }),
    );
    await page.goto(DECODER_PATH);
    await page
      .getByPlaceholder("Enter hex data to decode (e.g., 0x1234abcd...)")
      .fill(TRANSFER_DATA);
    await page.getByRole("button", { name: "Decode" }).click();
    await page.getByRole("button", { name: "Edit & Encode" }).click();
    await page.locator("textarea").fill("{not json");
    await page.getByRole("button", { name: "Encode", exact: true }).click();
    await expect(page.getByText("Encode error:")).toBeVisible();
  });

  test("multicall inner-call edit keeps big uint256 lossless", async ({
    page,
  }) => {
    // multicall(bytes[]) wrapping one transfer(vitalik, 12345678901234567890123)
    const MULTICALL_DATA =
      "0xac9650d80000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000044a9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa9604500000000000000000000000000000000000000000000029d42b64e76714244cb00000000000000000000000000000000000000000000000000000000";
    const BIG = "12345678901234567890123";

    await page.route("**/api/decode**", (route) => {
      const url = new URL(route.request().url());
      const data = (url.searchParams.get("data") || "").toLowerCase();
      const body = data.startsWith("0xa9059cbb")
        ? '{"msg":"ok","data":[{"func":"transfer(address,uint256)",' +
          '"args":{"to":"0xd8da6bf26964af9d7eed9e03e53415d37aa96045",' +
          '"amount":12345678901234567890123}}]}'
        : '{"msg":"ok","data":[{"func":"multicall(bytes[])","args":{}}]}';
      return route.fulfill({ contentType: "application/json", body });
    });

    await page.goto(DECODER_PATH);
    await page
      .getByPlaceholder("Enter hex data to decode (e.g., 0x1234abcd...)")
      .fill(MULTICALL_DATA);
    await page.getByRole("button", { name: "Decode" }).click();

    // wait for the async inner-call decode to surface the inner edit target
    await page.getByRole("button", { name: "Edit & Encode" }).click();
    const select = page.locator("select");
    await expect(select.locator("option")).toHaveCount(2, { timeout: 10000 });
    await select.selectOption({ index: 1 });

    // bare integer (no quotes) — lossless parse re-quotes it on encode
    await expect(page.locator("textarea")).toHaveValue(
      new RegExp(`:\\s*${BIG}`),
    );

    // unchanged re-encode reproduces the outer calldata byte-for-byte
    await page.getByRole("button", { name: "Encode", exact: true }).click();
    await expect(page.locator("code")).toHaveText(MULTICALL_DATA);
  });
});
