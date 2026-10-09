import { cp, copyFile, mkdir } from 'node:fs/promises';

await mkdir(new URL('./kernel/', import.meta.url), { recursive: true });
await cp(new URL('../../src/', import.meta.url), new URL('./kernel/', import.meta.url), { recursive: true });
await copyFile(new URL('../../LICENSE', import.meta.url), new URL('./LICENSE', import.meta.url));
console.log('Bundled the shared src kernel for the editor extension.');
