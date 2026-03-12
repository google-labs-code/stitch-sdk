if (!process.env.STITCH_API_KEY) {
  console.log("⏭️  Set STITCH_API_KEY to run this snippet.");
  console.log("   STITCH_API_KEY=your-key bun", process.argv[1]);
  process.exit(0);
}
