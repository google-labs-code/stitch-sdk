import { stitch } from "@google/stitch-sdk";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("Fetching projects...");
  const projects = await stitch.projects();

  if (projects.length === 0) {
    console.log("No projects found. Please create some projects with screens first.");
    return;
  }

  // To avoid making too many requests, we just take the first project for this example.
  // You could loop through all projects if desired.
  const project = projects[0];
  console.log(`Selected project: ${project.id}`);

  const screens = await project.screens();
  console.log(`Found ${screens.length} screens in project ${project.id}.`);

  const galleryItems = [];

  for (let i = 0; i < screens.length; i++) {
    const screen = screens[i];
    console.log(`Fetching screenshot URL for screen ${screen.id}...`);
    try {
      const imageUrl = await screen.getImage();
      if (imageUrl) {
        galleryItems.push({
          id: screen.id,
          url: imageUrl
        });
        console.log(`  Got URL for screen ${screen.id}`);
      } else {
        console.log(`  No screenshot available for screen ${screen.id}`);
      }
    } catch (e) {
      console.error(`  Error fetching screenshot for screen ${screen.id}:`, e);
    }
  }

  if (galleryItems.length === 0) {
    console.log("No screenshots found. Exiting.");
    return;
  }

  // Generate HTML
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stitch SDK Screenshot Gallery</title>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            background-color: #f3f4f6;
            margin: 0;
            padding: 2rem;
        }
        h1 {
            text-align: center;
            color: #111827;
        }
        .gallery {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 2rem;
            margin-top: 2rem;
        }
        .card {
            background: white;
            border-radius: 0.5rem;
            overflow: hidden;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            transition: transform 0.2s;
        }
        .card:hover {
            transform: translateY(-5px);
        }
        .card img {
            width: 100%;
            height: auto;
            display: block;
            border-bottom: 1px solid #e5e7eb;
        }
        .card-body {
            padding: 1rem;
            text-align: center;
        }
        .card-title {
            margin: 0;
            font-size: 0.875rem;
            color: #4b5563;
        }
    </style>
</head>
<body>
    <h1>Stitch SDK Screenshot Gallery</h1>
    <p style="text-align: center; color: #6b7280;">Screens from project ${project.id}</p>

    <div class="gallery">
        ${galleryItems.map(item => `
        <div class="card">
            <a href="${item.url}" target="_blank">
                <img src="${item.url}" alt="Screen ${item.id}" loading="lazy" />
            </a>
            <div class="card-body">
                <h2 class="card-title">Screen ${item.id}</h2>
            </div>
        </div>
        `).join('')}
    </div>
</body>
</html>
`;

  const outputPath = path.join(process.cwd(), "gallery.html");
  fs.writeFileSync(outputPath, htmlContent, "utf-8");
  console.log(`\nGallery generated successfully at: ${outputPath}`);
  console.log("Open this file in your browser to view the screenshots.");
}

main().catch(console.error);
