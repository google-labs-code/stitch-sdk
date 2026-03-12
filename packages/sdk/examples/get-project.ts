/**
 * Fetch detailed project metadata.
 * Lists projects first, takes the first ID, and fetches full details.
 *
 * Usage:
 *   STITCH_API_KEY=your-key bun packages/sdk/examples/get-project.ts
 */
import "./_require-key.js";
import { stitch } from "@google/stitch-sdk";

console.log("Listing projects...");
const projects = await stitch.projects();

if (projects.length === 0) {
  console.log("No projects found. Create a project first to see its details.");
  process.exit(0);
}

const projectId = projects[0].id;
console.log(`Found ${projects.length} project(s).`);
console.log(`Fetching details for project ID: ${projectId}...`);

try {
  // Use callTool to invoke get_project, since getProject is deliberately omitted from domain classes
  const projectDetails = await stitch.callTool<any>("get_project", {
    name: `projects/${projectId}`
  });

  console.log("Project Details retrieved successfully:");
  console.log(JSON.stringify(projectDetails, null, 2));
} catch (error) {
  console.error(`Failed to fetch project details for ${projectId}:`, error);
}
