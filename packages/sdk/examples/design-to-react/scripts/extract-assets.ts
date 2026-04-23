import "../../_require-key.js";
import { stitch } from "@google/stitch-sdk";

async function main() {
  try {
    const prompt = "A clean, modern SaaS dashboard with a sidebar, header, and some data cards. Include a user profile dropdown.";

    console.log("🎨 Creating project...");
    const project = await stitch.createProject("Design to React Example");

    console.log(`✨ Generating screen for prompt: "${prompt}"`);
    const screen = await project.generate(prompt);

    console.log(`✅ Screen generated: ${screen.id}`);

    const htmlUrl = await screen.getHtml();
    console.log(`📥 Fetching HTML from ${htmlUrl}...`);

    const response = await fetch(htmlUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch HTML: ${response.statusText}`);
    }

    const html = await response.text();

    // Parse out the Tailwind configuration
    console.log("\n🔍 Extracting Tailwind config...");
    const configMatch = html.match(/<script id="tailwind-config">([\s\S]*?)<\/script>/);

    if (configMatch) {
      console.log("\n/* --- TAILWIND CONFIG --- */");
      console.log(configMatch[1].trim());
      console.log("/* ----------------------- */\n");
    } else {
      console.log("❌ No Tailwind config found.");
    }

    // Parse Google Fonts links
    console.log("🔍 Extracting Google Fonts links...");
    const fontsMatches = html.match(/<link[^>]*fonts\.googleapis\.com[^>]*>/g) || [];

    if (fontsMatches.length > 0) {
      console.log("\n<!-- --- GOOGLE FONTS --- -->");
      fontsMatches.forEach(link => console.log(link));
      console.log("<!-- -------------------- -->\n");
    } else {
      console.log("❌ No Google Fonts links found.");
    }

    // The Agent can now read the raw HTML to convert to JSX
    console.log("📝 The agent should now read the raw HTML to convert to JSX.");
    console.log(`HTML Length: ${html.length} characters`);

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();
