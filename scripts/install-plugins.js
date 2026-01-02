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
 * Installs dependencies for a single plugin directory
 * @param {string} pluginPath - Path to the plugin directory
 * @param {string} pluginName - Name of the plugin (for logging)
 * @param {string} suffix - Optional suffix for logging (e.g., "backend", "frontend")
 */
function installPluginDependencies(pluginPath, pluginName, suffix = '') {
  const displayName = suffix ? `${pluginName}/${suffix}` : pluginName;

  try {
    console.log(`\n📦 Installing dependencies for ${displayName}...`);
    execSync('npm install', {
      cwd: pluginPath,
      stdio: 'inherit',
      env: { ...process.env }
    });
    console.log(`✅ Successfully installed dependencies for ${displayName}`);
    return { success: true, plugin: displayName };
  } catch (error) {
    console.error(`❌ Failed to install dependencies for ${displayName}`);
    return { success: false, plugin: displayName, error: error.message };
  }
}

/**
 * Installs dependencies for all parts of a plugin (root, backend, frontend)
 * @param {string} pluginPath - Path to the plugin root directory
 */
function installPluginAndParts(pluginPath) {
  const pluginName = path.basename(pluginPath);
  const results = [];

  // Install in plugin root
  if (fs.existsSync(path.join(pluginPath, 'package.json'))) {
    results.push(installPluginDependencies(pluginPath, pluginName));
  }

  // Install in backend subdirectory if it exists
  const backendPath = path.join(pluginPath, 'backend');
  if (fs.existsSync(path.join(backendPath, 'package.json'))) {
    results.push(installPluginDependencies(backendPath, pluginName, 'backend'));
  }

  // Install in frontend subdirectory if it exists
  const frontendPath = path.join(pluginPath, 'frontend');
  if (fs.existsSync(path.join(frontendPath, 'package.json'))) {
    results.push(installPluginDependencies(frontendPath, pluginName, 'frontend'));
  }

  return results;
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

  const allResults = [];
  let successCount = 0;
  let failCount = 0;

  for (const pluginDir of pluginDirs) {
    const results = installPluginAndParts(pluginDir);
    allResults.push(...results);

    results.forEach(result => {
      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    });
  }

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Installation Summary:');
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   📦 Total: ${allResults.length}`);
  console.log('='.repeat(50));

  if (failCount > 0) {
    console.log('\n❌ Some plugin installations failed:\n');
    allResults
      .filter(r => !r.success)
      .forEach(r => console.log(`   - ${r.plugin}: ${r.error}`));
    process.exit(1);
  } else {
    console.log('\n✨ All plugin dependencies installed successfully!');
  }
}

// Run the install process
main();
