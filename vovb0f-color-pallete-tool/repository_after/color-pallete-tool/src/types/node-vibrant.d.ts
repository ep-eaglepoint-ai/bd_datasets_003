declare module "node-vibrant" {
  interface Swatch {
    rgb: number[];
    hex: string;
    population: number;
    bodyTextColor: string;
    titleTextColor: string;
  }

  interface Palette {
    Vibrant?: Swatch;
    Muted?: Swatch;
    DarkVibrant?: Swatch;
    DarkMuted?: Swatch;
    LightVibrant?: Swatch;
    LightMuted?: Swatch;
  }

  class Vibrant {
    constructor(input: Buffer | string);
    static from(input: Buffer | string): Vibrant;
    getPalette(): Promise<Palette>;
  }

  export default Vibrant;
}
