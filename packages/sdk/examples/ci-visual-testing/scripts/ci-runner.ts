import { stitch } from "@google/stitch-sdk";

// Simulate reading a baseline definition from source control
const baseline = {
  projectId: "9651283129364717298", // Sample project
  prompt: "A login screen with email and password fields, minimalist design",
  baselineImageUrl: "https://lh3.googleusercontent.com/a/sample-baseline",
};

if (!process.env.STITCH_API_KEY) {
  console.error("STITCH_API_KEY is required");
  process.exit(1);
}

console.log("Starting CI Visual Test Runner...");
const project = stitch.project(baseline.projectId);

console.log("Generating candidate design...");
const candidateScreen = await project.generate(baseline.prompt);

console.log("Fetching candidate screenshot URL...");
const candidateImageUrl = await candidateScreen.getImage();

const report = {
  baseline: baseline.baselineImageUrl,
  candidate: candidateImageUrl,
  candidateScreenId: candidateScreen.id,
  prompt: baseline.prompt,
};

console.log("\n--- CI REPORT ---");
console.log(JSON.stringify(report, null, 2));
console.log("-----------------");
