import { defineConfig } from 'vitest/config';
import { workspaceSourceAliases } from '../../vitest.aliases.config';

export default defineConfig({
  resolve: { alias: workspaceSourceAliases },
});
