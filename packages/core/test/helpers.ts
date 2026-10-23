import { ApproximateTextMeasurer, Editor, FontManager } from '../src';

/** Editor wired for Node: approximate text metrics, no DOM fonts. */
export function makeEditor(opts: { width?: number; height?: number } = {}): Editor {
  return new Editor({
    width: opts.width ?? 1000,
    height: opts.height ?? 800,
    measurer: new ApproximateTextMeasurer(),
    fonts: new FontManager([], null),
  });
}
