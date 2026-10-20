import { defineConfig } from 'vite-plus';
import { workspaceSourceAliases } from '../../vitest.aliases.config';

export default defineConfig({
  resolve: { alias: workspaceSourceAliases },
});
