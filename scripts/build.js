'use strict';

const esbuild = require('esbuild');
const fs = require('fs/promises');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

async function ensureEmptyDir(directory){
  await fs.rm(directory, { recursive: true, force: true });
  await fs.mkdir(directory, { recursive: true });
}

async function copyFile(source, target){
  await fs.copyFile(source, target);
}

async function copyDirectory(sourceDir, targetDir){
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for(const entry of entries){
    const srcPath = path.join(sourceDir, entry.name);
    const destPath = path.join(targetDir, entry.name);
    if(entry.isDirectory()){
      await copyDirectory(srcPath, destPath);
    } else if(entry.isFile()){
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function buildAssets(){
  await esbuild.build({
    entryPoints: [path.join(rootDir, 'app.js')],
    outfile: path.join(distDir, 'app.js'),
    minify: true,
    bundle: false,
    format: 'esm',
    target: 'es2020'
  });

  await esbuild.build({
    entryPoints: [path.join(rootDir, 'style.css')],
    outfile: path.join(distDir, 'style.css'),
    minify: true,
    bundle: true,
    loader: { '.css': 'css' }
  });
}

async function copyStatic(){
  const staticFiles = ['index.html', 'manifest.webmanifest', 'service-worker.js'];
  for(const file of staticFiles){
    await copyFile(path.join(rootDir, file), path.join(distDir, file));
  }
  await copyDirectory(path.join(rootDir, 'icons'), path.join(distDir, 'icons'));
}

async function main(){
  await ensureEmptyDir(distDir);
  await buildAssets();
  await copyStatic();
  console.log(`Build complete. Output directory: ${distDir}`);
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exitCode = 1;
});
