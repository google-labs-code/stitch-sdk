/**
 * Instantiate a custom StitchToolClient using OAuth credentials.
 * This bypasses the default STITCH_API_KEY environment variable.
 *
 * Usage:
 *   STITCH_ACCESS_TOKEN=your-token GOOGLE_CLOUD_PROJECT=your-project bun packages/sdk/examples/custom-client.ts
 */
import { StitchToolClient } from "@google/stitch-sdk";

if (!process.env.STITCH_ACCESS_TOKEN || !process.env.GOOGLE_CLOUD_PROJECT) {
  console.log("⏭️  Set STITCH_ACCESS_TOKEN and GOOGLE_CLOUD_PROJECT to run this snippet.");
  console.log("   STITCH_ACCESS_TOKEN=... GOOGLE_CLOUD_PROJECT=... bun", process.argv[1]);
  process.exit(0);
}

const client = new StitchToolClient({
  accessToken: process.env.STITCH_ACCESS_TOKEN,
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
});

try {
  console.log("Connecting with OAuth credentials...");
  await client.connect();
  console.log("Connected successfully!");

  console.log("Fetching tools list...");
  const tools = await client.listTools();
  console.log(`Found ${tools.tools.length} available tools.`);

  // List tools to show successful authentication
  tools.tools.forEach((t) => {
    console.log(`- ${t.name}`);
  });
} catch (error) {
  console.error("Failed to connect or list tools:", error);
} finally {
  console.log("Closing client connection...");
  await client.close();
}
