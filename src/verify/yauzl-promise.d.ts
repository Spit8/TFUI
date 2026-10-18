// Typage minimal de yauzl-promise (lecture des archives du jeu dans les tests).
declare module "yauzl-promise" {
  export interface Entry {
    filename: string;
    openReadStream(): Promise<AsyncIterable<Uint8Array>>;
  }
  export interface ZipFile extends AsyncIterable<Entry> {
    close(): Promise<void>;
  }
  export function open(path: string): Promise<ZipFile>;
}
