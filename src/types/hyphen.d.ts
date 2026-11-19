// The `hyphen` package ships no types. Only the synchronous, plain-text
// surface we use (DIO-52) is declared.
declare module "hyphen" {
  interface HyphenatorOptions {
    async?: false;
    hyphenChar?: string;
    minWordLength?: number;
    html?: boolean;
    exceptions?: readonly string[];
  }
  type Hyphenator = (text: string) => string;
  export default function createHyphenator(patterns: unknown, options?: HyphenatorOptions): Hyphenator;
}

declare module "hyphen/patterns/pt.js" {
  const patterns: unknown;
  export default patterns;
}
