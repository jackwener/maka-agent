import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export interface ProjectGitInfo {
  isGitRepo: boolean;
  branch?: string;
}

export async function resolveProjectGitInfo(projectRoot: string): Promise<ProjectGitInfo> {
  const gitDir = await resolveGitDir(projectRoot);
  if (!gitDir) return { isGitRepo: false };

  try {
    const head = (await readFile(join(gitDir, 'HEAD'), 'utf8')).trim();
    const match = head.match(/^ref:\s+refs\/heads\/(.+)$/);
    return {
      isGitRepo: true,
      ...(match?.[1] ? { branch: match[1] } : {}),
    };
  } catch {
    return { isGitRepo: true };
  }
}

async function resolveGitDir(projectRoot: string): Promise<string | undefined> {
  const marker = join(projectRoot, '.git');
  const markerStat = await stat(marker).catch(() => null);
  if (!markerStat) return undefined;
  if (markerStat.isDirectory()) return marker;
  if (!markerStat.isFile()) return undefined;

  try {
    const content = await readFile(marker, 'utf8');
    const match = content.match(/^gitdir:\s*(.+)$/m);
    if (!match?.[1]) return undefined;
    return resolve(dirname(marker), match[1].trim());
  } catch {
    return undefined;
  }
}
