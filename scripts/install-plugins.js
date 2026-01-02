#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PLUGINS_DIR = path.join(__dirname, '..', 'plugins');

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

      // Check if this directory has a package.json
      if (fs.existsSync(packageJsonPath)) {
        try {
          fs.readFileSync(packageJsonPath, 'utf8');
          plugins.push(fullPath);
        } catch (error) {
          console.warn(`⚠️  Skipping ${entry.name}: Invalid package.json`);
        }
      }
    }
  }

  return plugins;
}

/**
 * Installs dependencies for a single plugin
 * @param {string} pluginPath - Path to the plugin directory
 */
function installPluginDependencies(pluginPath) {
  const pluginName = path.basename(pluginPath);

  try {
    console.log(`\n📦 Installing dependencies for ${pluginName}...`);
    execSync('npm install', {
      cwd: pluginPath,
      stdio: 'inherit',
      env: { ...process.env }
    });
    console.log(`✅ Successfully installed dependencies for ${pluginName}`);
    return { success: true, plugin: pluginName };
  } catch (error) {
    console.error(`❌ Failed to install dependencies for ${pluginName}`);
    return { success: false, plugin: pluginName, error: error.message };
  }
}

/**
 * Main install process
 */
function main() {
  console.log('🔍 Scanning for plugins...');

  const pluginDirs = findPluginDirectories(PLUGINS_DIR);

  if (pluginDirs.length === 0) {
    console.log('⚠️  No plugins found');
    return;
  }

  console.log(`📦 Found ${pluginDirs.length} plugin(s):\n`);
  pluginDirs.forEach(dir => console.log(`   - ${path.basename(dir)}`));

  console.log('\n🚀 Installing plugin dependencies...\n');

  const results = [];
  let successCount = 0;
  let failCount = 0;

  for (const pluginDir of pluginDirs) {
    const result = installPluginDependencies(pluginDir);
    results.push(result);

    if (result.success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Installation Summary:');
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   📦 Total: ${pluginDirs.length}`);
  console.log('='.repeat(50));

  if (failCount > 0) {
    console.log('\n❌ Some plugin installations failed:\n');
    results
      .filter(r => !r.success)
      .forEach(r => console.log(`   - ${r.plugin}: ${r.error}`));
    process.exit(1);
  } else {
    console.log('\n✨ All plugin dependencies installed successfully!');
  }
}

// Run the install process
main();
