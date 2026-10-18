import { t } from "../i18n";
/**
 * Décodage des images `.tga` du jeu (lues depuis l’installation, jamais
 * copiées). Types pris en charge : 2 / 10 (couleur 24 ou 32 bits, brute ou
 * RLE) et 3 / 11 (niveaux de gris 8 bits, brute ou RLE).
 *
 * Les surfaces de l’interface (`window/design/surface@2x.tga`…) sont des
 * masques en niveaux de gris : le gris sert d’opacité, la couleur vient du
 * style (`backgroundColor1`, `borderColor`, `color`).
 */
export interface DecodedTga {
  width: number;
  height: number;
  /** Niveaux de gris : un octet par pixel (opacité du masque). */
  gray: boolean;
  /** RGBA, ligne du haut en premier. */
  rgba: Uint8ClampedArray;
}

export function decodeTga(bytes: Uint8Array): DecodedTga {
  if (bytes.length < 18) throw new Error("TGA trop court");
  const idLength = bytes[0]!;
  const colorMapType = bytes[1]!;
  const type = bytes[2]!;
  const width = bytes[12]! | (bytes[13]! << 8);
  const height = bytes[14]! | (bytes[15]! << 8);
  const bpp = bytes[16]!;
  const descriptor = bytes[17]!;
  if (colorMapType !== 0) throw new Error(t("catalogErrors.tgaPalette"));
  const gray = type === 3 || type === 11;
  const rle = type === 10 || type === 11;
  if (![2, 3, 10, 11].includes(type)) throw new Error(t("catalogErrors.tgaType", { type }));
  const bytesPerPixel = bpp / 8;
  if (gray ? bytesPerPixel !== 1 : bytesPerPixel !== 3 && bytesPerPixel !== 4) {
    throw new Error(t("catalogErrors.tgaBpp", { bpp }));
  }

  const count = width * height;
  const raw = new Uint8Array(count * bytesPerPixel);
  let pos = 18 + idLength;
  if (!rle) {
    raw.set(bytes.subarray(pos, pos + raw.length));
  } else {
    let out = 0;
    while (out < raw.length && pos < bytes.length) {
      const header = bytes[pos++]!;
      const n = (header & 0x7f) + 1;
      if (header & 0x80) {
        const px = bytes.subarray(pos, pos + bytesPerPixel);
        pos += bytesPerPixel;
        for (let i = 0; i < n; i++, out += bytesPerPixel) raw.set(px, out);
      } else {
        const len = n * bytesPerPixel;
        raw.set(bytes.subarray(pos, pos + len), out);
        pos += len;
        out += len;
      }
    }
  }

  // Bit 5 du descripteur : origine en haut ; sinon les lignes vont du bas vers le haut.
  const topFirst = (descriptor & 0x20) !== 0;
  const rgba = new Uint8ClampedArray(count * 4);
  for (let y = 0; y < height; y++) {
    const srcRow = topFirst ? y : height - 1 - y;
    for (let x = 0; x < width; x++) {
      const s = (srcRow * width + x) * bytesPerPixel;
      const d = (y * width + x) * 4;
      if (gray) {
        const g = raw[s]!;
        rgba[d] = 255;
        rgba[d + 1] = 255;
        rgba[d + 2] = 255;
        rgba[d + 3] = g;
      } else {
        // Ordre BGR(A) dans le fichier.
        rgba[d] = raw[s + 2]!;
        rgba[d + 1] = raw[s + 1]!;
        rgba[d + 2] = raw[s]!;
        rgba[d + 3] = bytesPerPixel === 4 ? raw[s + 3]! : 255;
      }
    }
  }
  return { width, height, gray, rgba };
}

/**
 * Teinte une image par une couleur RGBA 0..1 : comme le moteur, la couleur
 * du style multiplie l’image (un masque gris devient la couleur, son gris
 * l’opacité).
 */
export function tintRgba(src: Uint8ClampedArray, color: number[]): Uint8ClampedArray {
  const [r = 1, g = 1, b = 1, a = 1] = color;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    out[i] = src[i]! * r;
    out[i + 1] = src[i + 1]! * g;
    out[i + 2] = src[i + 2]! * b;
    out[i + 3] = src[i + 3]! * a;
  }
  return out;
}
