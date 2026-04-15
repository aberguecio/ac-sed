const sharp = require('sharp');
const path = require('path');

async function createLogoWithBackground() {
  const inputPath = path.join(__dirname, '../public/ACSED-transaparent.webp');
  const outputPath = path.join(__dirname, '../public/ACSED-email.webp');

  try {
    // Create a high-resolution image (200x200) for better quality
    const size = 200;

    // First, resize the transparent logo to fit within the canvas
    const resizedLogo = await sharp(inputPath)
      .resize(size - 20, size - 20, { // Leave some padding
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 } // transparent background for resize
      })
      .toBuffer();

    // Create a high-res image with navy background and composite the logo
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 27, g: 43, b: 75, alpha: 1 } // #1B2B4B in RGBA
      }
    })
    .composite([
      {
        input: resizedLogo,
        gravity: 'center'
      }
    ])
    .webp({ quality: 95 }) // Higher quality
    .toFile(outputPath);

    console.log(`✅ Created ACSED-email.webp (${size}x${size}) with navy background`);
  } catch (error) {
    console.error('Error creating logo:', error);
  }
}

createLogoWithBackground();