import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const projectArg = args.shift();
if (!projectArg) {
  console.error('usage: crop-project <project.openscreen> [--top px] [--right px] [--bottom px] [--left px] [--write]');
  process.exit(2);
}

const values = { top: 0, right: 0, bottom: 0, left: 0 };
let write = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--write') {
    write = true;
    continue;
  }
  const edge = args[i].replace(/^--/, '');
  if (!(edge in values) || args[i + 1] === undefined) {
    console.error(`unknown or incomplete option: ${args[i]}`);
    process.exit(2);
  }
  values[edge] = Number(args[++i]);
  if (!Number.isFinite(values[edge]) || values[edge] < 0) {
    console.error(`invalid ${edge} crop`);
    process.exit(2);
  }
}

const projectPath = resolve(projectArg);
const project = JSON.parse(readFileSync(projectPath, 'utf8'));
const videoPath = project?.media?.screenVideoPath;
if (!videoPath) throw new Error('project.media.screenVideoPath is missing');

const probe = JSON.parse(execFileSync('ffprobe', [
  '-v', 'error',
  '-select_streams', 'v:0',
  '-show_entries', 'stream=width,height',
  '-of', 'json',
  videoPath,
], { encoding: 'utf8' }));
const { width, height } = probe.streams?.[0] ?? {};
if (!width || !height) throw new Error('could not read source video dimensions');
if (values.left + values.right >= width || values.top + values.bottom >= height) {
  throw new Error('crop removes the entire source video');
}

const cropRegion = {
  x: values.left / width,
  y: values.top / height,
  width: (width - values.left - values.right) / width,
  height: (height - values.top - values.bottom) / height,
};
console.log(JSON.stringify({ projectPath, videoPath, source: { width, height }, cropPixels: values, cropRegion }, null, 2));

if (write) {
  copyFileSync(projectPath, `${projectPath}.crop-backup`);
  project.editor ??= {};
  project.editor.cropRegion = cropRegion;
  writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`);
}
