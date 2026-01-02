#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PLUGINS_DIR = path.join(__dirname, '..', 'plugins');
const FRONTEND_PLUGINS_DIR = path.join(__dirname, '..', 'frontend', 'src', 'plugins');

/**
 * Recursively finds all plugin directories that contain a package.json
 * @param {string} dir - Directory to search
 * @returns {string[]} Array of plugin directory paths
 */
function findPluginDirectories(dir) {
  const plugins = [];

  if (!fs.existsSync(dir)) {
    console.log(`⚠️  Plugins directory not found: ${dir}`);
    return plugins;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const packageJsonPath = path.join(fullPath, 'package.json');

      // Check if this directory has a package.json with a build script
      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          if (packageJson.scripts && packageJson.scripts.build) {
            plugins.push(fullPath);
          }
        } catch (error) {
          console.warn(`⚠️  Skipping ${entry.name}: Invalid package.json`);
        }
      }
    }
  }

  return plugins;
}

/**
 * Copies a directory recursively
 * @param {string} src - Source directory
 * @param {string} dest - Destination directory
 */
function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Copies frontend plugin source files to frontend/src/plugins
 * @param {string} pluginName - Name of the plugin
 * @param {string} pluginPath - Path to the plugin root
 */
function copyFrontendPlugin(pluginName, pluginPath) {
  const frontendSrcPath = path.join(pluginPath, 'frontend', 'src');
  const frontendPluginPath = path.join(FRONTEND_PLUGINS_DIR, pluginName);

  // Check if this plugin has a frontend part
  if (!fs.existsSync(frontendSrcPath)) {
    return false;
  }

  try {
    console.log(`   📋 Copying frontend source files for ${pluginName}...`);

    // Create destination directory if it doesn't exist
    if (!fs.existsSync(FRONTEND_PLUGINS_DIR)) {
      fs.mkdirSync(FRONTEND_PLUGINS_DIR, { recursive: true });
    }

    // Remove existing plugin directory if it exists
    if (fs.existsSync(frontendPluginPath)) {
      fs.rmSync(frontendPluginPath, { recursive: true, force: true });
    }

    // Copy source files to frontend/src/plugins (not the compiled dist)
    copyDirectory(frontendSrcPath, frontendPluginPath);

    console.log(`   ✅ Frontend source files copied to ${frontendPluginPath}`);
    return true;
  } catch (error) {
    console.error(`   ❌ Failed to copy frontend files for ${pluginName}:`, error.message);
    return false;
  }
}

/**
 * Builds a single plugin
 * @param {string} pluginPath - Path to the plugin directory
 */
function buildPlugin(pluginPath) {
  const pluginName = path.basename(pluginPath);

  try {
    console.log(`\n🔨 Building ${pluginName}...`);
    execSync('npm run build', {
      cwd: pluginPath,
      stdio: 'inherit',
      env: { ...process.env }
    });
    console.log(`✅ Successfully built ${pluginName}`);

    // Copy frontend files if they exist
    const hasFrontend = copyFrontendPlugin(pluginName, pluginPath);

    return { success: true, plugin: pluginName, hasFrontend };
  } catch (error) {
    console.error(`❌ Failed to build ${pluginName}`);
    return { success: false, plugin: pluginName, error: error.message };
  }
}

/**
 * Main build process
 */
function main() {
  console.log('🔍 Scanning for plugins...');

  const pluginDirs = findPluginDirectories(PLUGINS_DIR);

  if (pluginDirs.length === 0) {
    console.log('⚠️  No plugins found with build scripts');
    return;
  }

  console.log(`📦 Found ${pluginDirs.length} plugin(s):\n`);
  pluginDirs.forEach(dir => console.log(`   - ${path.basename(dir)}`));

  console.log('\n🚀 Starting plugin build process...\n');

  const results = [];
  let successCount = 0;
  let failCount = 0;
  let frontendCopiedCount = 0;

  for (const pluginDir of pluginDirs) {
    const result = buildPlugin(pluginDir);
    results.push(result);

    if (result.success) {
      successCount++;
      if (result.hasFrontend) {
        frontendCopiedCount++;
      }
    } else {
      failCount++;
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Build Summary:');
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   📋 Frontend plugins copied: ${frontendCopiedCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   📦 Total: ${pluginDirs.length}`);
  console.log('='.repeat(50));

  if (failCount > 0) {
    console.log('\n❌ Some plugins failed to build:\n');
    results
      .filter(r => !r.success)
      .forEach(r => console.log(`   - ${r.plugin}: ${r.error}`));
    process.exit(1);
  } else {
    console.log('\n✨ All plugins built successfully!');
    if (frontendCopiedCount > 0) {
      console.log(`\n📋 ${frontendCopiedCount} frontend plugin(s) copied to frontend/src/plugins/`);
    }
  }
}

// Run the build process
main();
