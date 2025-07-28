import { readFile } from 'fs/promises';
import { parse } from 'yaml';
import { FILE_PATHS } from './constants.js';
import type { PolicyConfig } from './types.js';

/**
 * Loads policy configuration from the standard policy file location.
 */
export async function loadPolicyConfigurationFromFile(): Promise<PolicyConfig> {
  const yamlContent = await readFile(FILE_PATHS.POLICY_CONFIG_FILE, 'utf-8');
  return parse(yamlContent);
} 