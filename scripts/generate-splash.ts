import sharp from "sharp";
import path from "path";

const CANVAS_SIZE = 2732;
const LOGO_SIZE = 400;
const RESOURCES_DIR = path.join(__dirname, "..", "resources");

async function generateSplash() {
  const logoPath = path.join(RESOURCES_DIR, "logo.png");

  // Resize logo to target size
  const resizedLogo = await sharp(logoPath)
    .resize(LOGO_SIZE, LOGO_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  // Light splash: dark gray background (#111827 = rgb 17, 24, 39) matching app dark theme
  const lightSplash = await sharp({
    create: {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      channels: 4,
      background: { r: 17, g: 24, b: 39, alpha: 1 },
    },
  })
    .composite([
      {
        input: resizedLogo,
        gravity: "centre",
      },
    ])
    .png()
    .toFile(path.join(RESOURCES_DIR, "splash.png"));

  console.log("Generated splash.png:", lightSplash);

  // Dark splash: same dark background
  const darkSplash = await sharp({
    create: {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      channels: 4,
      background: { r: 17, g: 24, b: 39, alpha: 1 },
    },
  })
    .composite([
      {
        input: resizedLogo,
        gravity: "centre",
      },
    ])
    .png()
    .toFile(path.join(RESOURCES_DIR, "splash-dark.png"));

  console.log("Generated splash-dark.png:", darkSplash);
  console.log("\nDone! Now run: npx @capacitor/assets generate");
}

generateSplash().catch(console.error);
