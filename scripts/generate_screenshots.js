import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const PORT = 4188;
const BASE_URL = `http://localhost:${PORT}`;
const OUTPUT_DIR = path.resolve('docs/images');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function main() {
  console.log('🚀 Starting Vite preview server on port', PORT);
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'inherit',
    shell: true
  });

  // Wait for server to start
  await new Promise(r => setTimeout(r, 2500));

  console.log('🌐 Launching Chromium browser with WebGL...');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-accelerated-2d-canvas'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5
  });

  const page = await context.newPage();

  try {
    // 1. Welcome screen
    console.log('📸 1. Capturing Welcome Screen...');
    await page.goto(`${BASE_URL}/`);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '01_welcome_screen.png') });

    // 2. Open In-App Help Modal
    console.log('📸 2. Capturing In-App Help Modal...');
    const helpBtn = await page.locator('text=Otvoriť používateľskú príručku').first();
    if (await helpBtn.isVisible()) {
      await helpBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUTPUT_DIR, '11_help_modal.png') });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }

    // 3. Load test model (test_simple.lox)
    console.log('📸 3. Loading test_simple.lox...');
    const simpleBtn = await page.locator('text=Simple').first();
    if (await simpleBtn.isVisible()) {
      await simpleBtn.click();
    } else {
      await page.goto(`${BASE_URL}/?model=/test_simple.lox`);
    }
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '02_main_viewer_3d.png') });

    // 4. Orthographic Plan View
    console.log('📸 4. Capturing Orthographic Plan View (Key 1)...');
    await page.keyboard.press('1');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '03_orthographic_plan_view.png') });

    // 5. Z-Clipping Slider
    console.log('📸 5. Capturing Z-Clipping Slider (Key Z)...');
    await page.keyboard.press('z');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '07_z_clipping_slider.png') });
    await page.keyboard.press('z'); // close slider
    await page.waitForTimeout(400);

    // 6. Measurement Panel (Key M)
    console.log('📸 6. Capturing Measurement Panel (Key M)...');
    await page.keyboard.press('m');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '05_measurement_panel.png') });

    // 7. Load Zlomiskovo for Splay SDF Walls
    console.log('📸 7. Loading zlomiskovo.lox for Splay SDF Walls...');
    await page.goto(`${BASE_URL}/?model=/zlomiskovo.lox&sdf=1&smin=0.12&srad=0.14&theme=precision&scraps=0`);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '04_splay_sdf_walls.png') });

    // 8. Share Dialog
    console.log('📸 8. Capturing Share Dialog...');
    const shareBtn = await page.locator('button[title*="Zdieľať"], button[title*="Share"]').first();
    if (await shareBtn.isVisible()) {
      await shareBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUTPUT_DIR, '10_share_dialog.png') });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }

    // 9. Load LiDAR model (vetrna_dira.ply)
    console.log('📸 9. Loading vetrna_dira.ply for LiDAR NextGen...');
    await page.goto(`${BASE_URL}/?model=/vetrna_dira.ply`);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '08_lidar_pointcloud_edl.png') });

    console.log('✅ All screenshots captured successfully in', OUTPUT_DIR);
  } catch (err) {
    console.error('❌ Error capturing screenshots:', err);
  } finally {
    await browser.close();
    server.kill();
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
