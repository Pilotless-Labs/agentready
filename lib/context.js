import fs from 'node:fs';
import path from 'node:path';

// Canonical doc files appear under many casings in the wild (README.md,
// Readme.md, readme.rst, bare README) — checks should match by pattern, not name.
export const README_PATTERN = /^readme(\.(md|markdown|rst|txt))?$/i;
export const CONTRIBUTING_PATTERN = /^contributing(\.(md|markdown|rst|txt))?$/i;

const IGNORED_DIRS = new Set([
  '.git', 'node_modules', 'vendor', 'dist', 'build', 'target',
  '.venv', 'venv', '__pycache__', '.next', '.cache', 'coverage',
]);

/**
 * Read-only view of the repository being audited. Checks receive this instead
 * of touching the filesystem directly, so they stay testable against fixtures.
 */
export function createContext(root) {
  const abs = (p) => path.join(root, p);

  let fileListCache = null;

  const MAX_FILES = 5000;
  const MAX_DEPTH = 6;

  // Breadth-first so the shallowest, highest-signal entries — root files, then
  // every subdir's immediate contents — are captured before deep ones. The file
  // cap guards against pathological monorepos; reaching it under BFS truncates
  // the *deepest* files, never a root README/manifest or a top-level `src/` /
  // `test/` dir. A depth-first walk could exhaust the cap diving into one
  // early-sorted giant subdir and never reach a sibling `test/`, costing the
  // repo its test/documentation credit on huge repos (#50).
  function collectFiles() {
    const out = [];
    const queue = [{ dir: root, prefix: '', depth: 0 }];
    while (queue.length > 0) {
      const { dir, prefix, depth } = queue.shift();
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!IGNORED_DIRS.has(entry.name) && depth < MAX_DEPTH) {
            queue.push({ dir: path.join(dir, entry.name), prefix: `${prefix}${entry.name}/`, depth: depth + 1 });
          }
        } else if (entry.isFile()) {
          out.push(`${prefix}${entry.name}`);
          if (out.length >= MAX_FILES) return out;
        }
      }
    }
    return out;
  }

  return {
    root,

    exists(relPath) {
      return fs.existsSync(abs(relPath));
    },

    read(relPath) {
      try {
        return fs.readFileSync(abs(relPath), 'utf8');
      } catch {
        return null;
      }
    },

    readJson(relPath) {
      const raw = this.read(relPath);
      if (raw === null) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },

    /** Repo-relative paths of all files, ignoring dependency/build dirs. */
    files() {
      if (!fileListCache) {
        fileListCache = collectFiles();
      }
      return fileListCache;
    },

    /** Actual name of the first root-level file matching the regex, or null. */
    findRootFile(pattern) {
      return this.files().find((f) => !f.includes('/') && pattern.test(f)) ?? null;
    },

    fileSize(relPath) {
      try {
        return fs.statSync(abs(relPath)).size;
      } catch {
        return 0;
      }
    },

    /**
     * Repo-relative paths of files under `relPath` (recursively), including dirs
     * the main walk skips for speed (build/dist/target/...). Bounded; returns []
     * if the path is missing or isn't a directory. Lets a check peek inside an
     * artifact-named dir to tell hand-written source from committed output (#45).
     */
    listDir(relPath) {
      const base = relPath.replace(/\/+$/, '');
      const out = [];
      const queue = [{ dir: abs(base), prefix: `${base}/` }];
      const LIST_CAP = 3000;
      while (queue.length > 0) {
        const { dir, prefix } = queue.shift();
        let entries;
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const entry of entries) {
          if (entry.name === '.git') continue;
          if (entry.isDirectory()) {
            queue.push({ dir: path.join(dir, entry.name), prefix: `${prefix}${entry.name}/` });
          } else if (entry.isFile()) {
            out.push(`${prefix}${entry.name}`);
            if (out.length >= LIST_CAP) return out;
          }
        }
      }
      return out;
    },
  };
}
