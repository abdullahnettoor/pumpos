import fs from 'fs';

const env = process.argv[2];
if (env !== 'local' && env !== 'prod') {
  console.error('Usage: node scripts/switch-env.mjs [local|prod]');
  process.exit(1);
}

console.log(`Switching workspace to ${env}...`);

const files = [
  { src: `apps/api/.dev.vars.${env}`, dest: 'apps/api/.dev.vars' },
  { src: `apps/mobile/.env.${env}`, dest: 'apps/mobile/.env' },
  { src: `apps/console/.env.${env}`, dest: 'apps/console/.env' },
  { src: `apps/desktop/.env.${env}`, dest: 'apps/desktop/.env' },
  { src: `apps/marketing/.env.${env}`, dest: 'apps/marketing/.env' },
];

for (const file of files) {
  if (fs.existsSync(file.src)) {
    fs.copyFileSync(file.src, file.dest);
    console.log(`✓ Updated ${file.dest}`);
  } else {
    console.warn(`⚠️  Source file not found: ${file.src}`);
  }
}

console.log('Done!');
