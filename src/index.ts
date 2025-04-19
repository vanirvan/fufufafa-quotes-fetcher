import { chromium, Browser, Page, Locator } from "playwright";
import { data } from "./data.js";
// import { data as data } from "./data-3.js"; // enable this only when new data would be fetched
import * as fs from "node:fs/promises";
import * as path from "path"; // Import the 'path' module

interface ExtractedData {
  content: string;
  datetime: string | null;
  doksli: string;
}

async function safeWaitForSelector(
  page: Page,
  selector: string,
  timeout = 5000
): Promise<Locator | null> {
  try {
    await page.waitForSelector(selector, { timeout });
    return page.locator(selector).first();
  } catch (error) {
    console.warn(`Element not found: ${selector}`);
    return null;
  }
}

async function extractDataAndScreenshot(
  page: Page,
  id: number
): Promise<Omit<ExtractedData, "doksli">[]> {
  try {
    // Wait for the main content area to load
    await page.waitForSelector("div.w-full.md\\:rounded.bg-surface-primary", {
      timeout: 10000,
    });

    const extracted: Omit<ExtractedData, "doksli">[] = [];
    const contentLocator = page.locator("div.break-words.py-2.text-secondary");
    const timeLocator = page.locator("time.text-tertiary.text-xs").nth(1); // get second element (the correct fufufafa comment timestamp)

    const contentText = await contentLocator.innerText();
    const datetimeValue = await timeLocator.getAttribute("datetime");

    extracted.push({
      content: contentText,
      datetime: datetimeValue,
    });

    // get rid of all ads
    // this value will be used for scroll down value, `scroll - this value`
    const totalHeaderHeight = await page.evaluate(() => {
      const header1 = document.querySelector(
        "div.flex-none.sticky.left-0.top-0.z-\\[51\\]"
      );
      const header2 = document.querySelector(
        "ul.flex.w-full.list-none.items-center.sticky.top-\\[52px\\].z-10"
      );

      const height1 = header1 ? header1.getBoundingClientRect().height : 0;
      const height2 = header2 ? header2.getBoundingClientRect().height : 0;

      return height1 + height2;
    });

    // Try to get the elements, returning `null` if they don't exist
    const element1 = await safeWaitForSelector(
      page,
      "div.relative.flex.w-full.justify-between.px-4.py-2"
    );
    const element2 = await safeWaitForSelector(
      page,
      "div.w-full.px-4 > div.htmlContentRenderer_html-content__ePjqJ"
    );
    const element3 = await safeWaitForSelector(
      page,
      "div.my-2.flex.cursor-pointer.px-4"
    );
    const element4 = await safeWaitForSelector(
      page,
      "div.flex.w-full.justify-between.px-4.pb-2"
    );

    // Get bounding boxes, filtering out `null` values
    const boxes = await Promise.all(
      [element1, element2, element3, element4].map(async (el) =>
        el ? await el.boundingBox() : null
      )
    );
    const validBoxes = boxes.filter(
      (box): box is Exclude<typeof box, null> => box !== null
    );

    // If no elements were found, return early
    if (validBoxes.length === 0) {
      console.warn("No valid elements found for screenshot.");
      return [];
    }

    console.log(validBoxes);

    // Calculate the combined bounding box
    const combinedBox = {
      x: Math.min(...validBoxes.map((b) => b.x)),
      y: Math.min(...validBoxes.map((b) => b.y)),
      width: Math.max(...validBoxes.map((b) => b.width)),
      height:
        Math.max(...validBoxes.map((b) => b.y + b.height)) -
        Math.min(...validBoxes.map((b) => b.y)),
    };

    console.log(combinedBox);

    // scroll to fufufafa comment
    await page.evaluate(
      (y) => window.scrollTo(0, y),
      combinedBox.y - totalHeaderHeight
    );

    // if window.scrollY is less than the combinedBox.y - totalHeaderHeight

    console.log(
      `Scrolling to the comment section at: y ${
        combinedBox.y - totalHeaderHeight
      }`
    );

    // Create the 'public/img' directory if it doesn't exist
    const imgDir = "./public/img";
    await fs.mkdir(imgDir, { recursive: true });

    // Construct dynamic outputPath
    const outputPath = path.join(imgDir, `${id}.jpg`);

    // Take the screenshot of the combined area
    await page.screenshot({
      path: outputPath,
      clip: { ...combinedBox, y: totalHeaderHeight },
      timeout: 60000,
    });

    console.log(`Screenshot saved to ${outputPath}`);

    return extracted;
  } catch (error) {
    console.error("Error during extraction or screenshot:", error);
    return [];
  }
}

// Main function to manage the browser lifecycle
async function main() {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch();
    const page: Page = await browser.newPage();

    // Get the full height of the page
    const fullHeight = await page.evaluate(() => document.body.scrollHeight);

    // Set viewport to the full height
    await page.setViewportSize({ width: 640, height: fullHeight });

    const results: {
      id: number;
      data: ExtractedData | null;
    }[] = []; // Store array of extracted data
    const loopSize = data.length;
    const startIndex = 699; // index from the last data id (if the last data is id 699, start from 699)

    for (let i = 0; i < loopSize; i++) {
      const url = data[i]; // Corrected URL access
      try {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });

        // Dismiss the Cookie Consent Banner
        const cookieButton = page.locator("button.button_primary__PYJul", {
          hasText: "Terima",
        });
        if (await cookieButton.isVisible()) {
          await cookieButton.click();
          console.log("Cookie consent dismissed");
        }

        // Dismiss the Mobile App Promotion Popup
        const appPopupButton = page.locator(
          "button.installApp_installAppButton__VlHyw",
          { hasText: "Lanjutkan" }
        );
        if (await appPopupButton.isVisible()) {
          await appPopupButton.click();
          console.log("App promotion dismissed");
        }

        // Dismiss the Ad close Button
        const adCloseButton = page.locator(
          "div.absolute.-top-\\[30px\\].right-0.cursor-pointer.overflow-hidden.rounded-l-lg.bg-white.p-1.pb-\\[10px\\].pt-1.text-center.text-secondary.shadow-\\[0_-1px_1px_0_rgba\\(0\\,0\\,0\\,0\\.2\\)\\].dark\\:bg-grey-7"
        );
        if (await adCloseButton.isVisible()) {
          await adCloseButton.click();
          console.log("Ads dismissed");
        }

        // Add blank content
        await page.evaluate(() => {
          const div = document.createElement("div");
          div.style.height = "2000px";
          div.style.width = "100%"; // Full width
          div.style.background = "transparent"; // Invisible
          document.body.appendChild(div); // Append it to the page
        });
        console.log("Blank Content Added");

        const extractedData = await extractDataAndScreenshot(
          page,
          i + 1 + startIndex
        );
        results.push({
          id: i + 1 + startIndex,
          data: { ...extractedData[0], doksli: url },
        });

        console.log(`Extracted data from ${url} (ID: ${i + 1 + startIndex})`);
      } catch (gotoError) {
        console.error(
          `Error navigating to or extracting from ${url}:`,
          gotoError
        );
        results.push({
          id: i + 1 + startIndex,
          data: null, // Push an empty array if extraction failed
        });
      }

      // Avoid navigating error
      setTimeout(() => {}, 1000);
    }

    // Write the complete results to a JSON file after the loop
    const filePath = "./fufufafa.json";
    const jsonData = JSON.stringify(results, null, 2);
    await fs.writeFile(filePath, jsonData, "utf-8");

    console.log(`All data written to ${filePath}`);
  } catch (error) {
    console.error("An error occurred:", error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run the main function
main();

// comment the main() function and run the below function if new data is added
// this function will compare old data with new data and create a new file for new data added
function main2() {
  const outputFileName = "new-data.ts";

  const duplicateData = data.filter((item) => data.includes(item));
  const uniqueData = data.filter((item) => !data.includes(item));
  console.log(`Total duplicate data: ${duplicateData.length}`);
  console.log(`Total unique data: ${uniqueData.length}`);

  // write unique data to file
  const fileContentUnique = `// Auto generated file
export const data: string[] = ${JSON.stringify(uniqueData, null, 2)};
`;

  const outputPath2 = path.join(process.cwd(), outputFileName);
  fs.writeFile(outputPath2, fileContentUnique);

  // write duplicate data to file, for manual checking, but i'm pretty sure it's works perfectly
  const fileContentDuplicate = `// Auto generated file
export const data: string[] = ${JSON.stringify(duplicateData, null, 2)};
`;

  const outputPath = path.join(process.cwd(), "duplicate-data.ts");
  fs.writeFile(outputPath, fileContentDuplicate);

  console.log(`Data has been filtered and outputed at ${outputFileName}`);
  return 0;
}

// uncomment this to filter the file
// comment it again after it finished
// main2();
