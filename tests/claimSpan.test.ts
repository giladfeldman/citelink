/**
 * `findClaimSpan` returns the sentence(s) a citation is tied to: the sentence that contains
 * it, plus the sentence before it when the citing sentence leans on that one ("This effect
 * ...", "For example, ..."), or when the citing sentence says almost nothing but the citation
 * itself ("(see Smith, 2020).").
 *
 * The span is what a reader needs to judge what the author claims the cited work says, so a
 * wrong boundary is not cosmetic: a span cut at "et al." or at "p." shows half a claim, and a
 * span that runs on through a paragraph break attributes the next paragraph to the source.
 */
import { findClaimSpan } from '../src/claimSpan.js';

/** Span text for the first occurrence of `cite` in `text`. */
function spanFor(text: string, cite: string) {
  const start = text.indexOf(cite);
  if (start < 0) throw new Error(`fixture does not contain ${cite}`);
  const span = findClaimSpan(text, start, start + cite.length);
  return { ...span, text: text.slice(span.start, span.end) };
}

describe('findClaimSpan — the citing sentence', () => {
  test('parenthetical citation at the end of a sentence', () => {
    const t = 'Background sentence here. Loss aversion is robust across cultures (Smith & Jones, 2020). Next topic starts.';
    const s = spanFor(t, '(Smith & Jones, 2020)');
    expect(s.text).toBe('Loss aversion is robust across cultures (Smith & Jones, 2020).');
    expect(s.includesPrevious).toBe(false);
    expect(s.truncated).toBe(false);
  });

  test('narrative citation: the claim follows the citation inside the same sentence', () => {
    const t = 'Earlier work was mixed. Smith (2020) found that nudges reduced energy use by 2%. Later work disagreed.';
    expect(spanFor(t, 'Smith (2020)').text).toBe('Smith (2020) found that nudges reduced energy use by 2%.');
  });

  test('numeric bracket citation', () => {
    const t = 'Intro. Priming effects often fail to replicate [12]. More text.';
    expect(spanFor(t, '[12]').text).toBe('Priming effects often fail to replicate [12].');
  });

  test('citation in the first sentence of the text', () => {
    const t = 'Smith (2020) showed a large effect. Then others followed.';
    expect(spanFor(t, 'Smith (2020)').text).toBe('Smith (2020) showed a large effect.');
  });

  test('citation in the last sentence, no final period', () => {
    const t = 'First sentence. The effect was large (Lee, 2019)';
    expect(spanFor(t, '(Lee, 2019)').text).toBe('The effect was large (Lee, 2019)');
  });
});

describe('findClaimSpan — abbreviations and numbers do not end a sentence', () => {
  test.each([
    ['et al.', 'Prior work. Kahneman et al. (2006) reported that income predicts mood weakly. Next.', 'Kahneman et al. (2006)', 'Kahneman et al. (2006) reported that income predicts mood weakly.'],
    ['e.g. and i.e.', 'Prior. Several biases (e.g., anchoring; i.e., not all) replicate (Klein, 2014). Next.', '(Klein, 2014)', 'Several biases (e.g., anchoring; i.e., not all) replicate (Klein, 2014).'],
    ['page locator p.', 'Prior. The scale "measures regret" (Zeelenberg, 2000, p. 12) in adults. Next.', '(Zeelenberg, 2000, p. 12)', 'The scale "measures regret" (Zeelenberg, 2000, p. 12) in adults.'],
    ['Fig. and vs.', 'Prior. As in Fig. 2, gains vs. losses differ (Tversky, 1992). Next.', '(Tversky, 1992)', 'As in Fig. 2, gains vs. losses differ (Tversky, 1992).'],
    ['decimal number', 'Prior. The effect was d = 0.45 in the original (Brown, 2011). Next.', '(Brown, 2011)', 'The effect was d = 0.45 in the original (Brown, 2011).'],
    ['author initials', 'Prior. As argued by J. A. Smith (2001), framing matters. Next.', 'J. A. Smith (2001)', 'As argued by J. A. Smith (2001), framing matters.'],
    ['cf.', 'Prior. This holds for losses (cf. Smith, 2001). Next one.', '(cf. Smith, 2001)', null],
  ])('%s', (_label, text, cite, expected) => {
    const s = spanFor(text, cite);
    if (expected !== null) expect(s.text).toBe(expected);
    else expect(s.text.endsWith('(cf. Smith, 2001).')).toBe(true);
  });
});

describe('findClaimSpan — citation numbers after the period (AMA / superscript styles)', () => {
  // Measured on a real JAMA Netw Open text: "…by 200 to 500 kcal/d.3-5 Moreover, …" ran three
  // sentences together because the period is followed by the superscript, not by a space.
  test('a number run right after a word-final period ends the sentence', () => {
    const t = 'Prior. Fasting reduces energy intake by 200 to 500 kcal/d.3-5 Moreover, adherence remains high.6 Therefore, TRE may help.';
    expect(spanFor(t, '3-5').text).toBe('Fasting reduces energy intake by 200 to 500 kcal/d.3-5');
    const six = t.indexOf('high.6') + 'high.'.length;
    const s = findClaimSpan(t, six, six + 1);
    // "Moreover" continues the previous sentence, so that sentence is part of the claim.
    expect(t.slice(s.citingSentenceStart, s.end)).toBe('Moreover, adherence remains high.6');
    expect(s.includesPrevious).toBe(true);
    expect(t.slice(s.start, s.end)).toBe('Fasting reduces energy intake by 200 to 500 kcal/d.3-5 Moreover, adherence remains high.6');
  });

  test('a decimal or section number is not a sentence end (control)', () => {
    const t = 'Prior. See section 2.1 Results for the effect of d = 1.2 Overall (Smith, 2020). Next.';
    expect(spanFor(t, '(Smith, 2020)').text).toBe('See section 2.1 Results for the effect of d = 1.2 Overall (Smith, 2020).');
  });
});

describe('findClaimSpan — line breaks', () => {
  test('a single line break inside a sentence (hard-wrapped text) does not end it', () => {
    const t = 'Prior sentence. Loss aversion is robust\nacross cultures (Smith, 2020). Next.';
    expect(spanFor(t, '(Smith, 2020)').text).toBe('Loss aversion is robust\nacross cultures (Smith, 2020).');
  });

  test('a blank line ends a sentence even without a period (heading above the paragraph)', () => {
    const t = 'Method\n\nParticipants were recruited online (Prolific, 2021). Next.';
    const s = spanFor(t, '(Prolific, 2021)');
    expect(s.text).toBe('Participants were recruited online (Prolific, 2021).');
    expect(s.includesPrevious).toBe(false);
  });

  test('the previous sentence is never taken from across a paragraph break', () => {
    const t = 'Old paragraph ends here.\n\nThis was replicated (Smith, 2020). Next.';
    const s = spanFor(t, '(Smith, 2020)');
    expect(s.text).toBe('This was replicated (Smith, 2020).');
    expect(s.includesPrevious).toBe(false);
  });
});

describe('findClaimSpan — when the sentence before is part of the claim', () => {
  test.each([
    'This effect was replicated (Smith, 2020).',
    'These findings were replicated (Smith, 2020).',
    'However, a replication failed (Smith, 2020).',
    'For example, framing changed choices (Smith, 2020).',
    'Similarly, it held for losses (Smith, 2020).',
  ])('anaphoric or continuing opener: %s', (citing) => {
    const t = `Unrelated opener. Defaults increase organ donation rates. ${citing} Next.`;
    const s = spanFor(t, '(Smith, 2020)');
    expect(s.includesPrevious).toBe(true);
    expect(s.text).toBe(`Defaults increase organ donation rates. ${citing}`);
    expect(s.citingSentenceStart).toBe(t.indexOf(citing));
  });

  test('a sentence that is little more than the citation takes the previous one', () => {
    const t = 'Opener. Defaults increase organ donation rates. (See Johnson & Goldstein, 2003.) Next.';
    const s = spanFor(t, 'Johnson & Goldstein, 2003');
    expect(s.includesPrevious).toBe(true);
    expect(s.text).toBe('Defaults increase organ donation rates. (See Johnson & Goldstein, 2003.)');
  });

  test('a self-contained sentence does not take the previous one (control)', () => {
    const t = 'Opener. Defaults increase organ donation rates (Johnson & Goldstein, 2003). Next.';
    expect(spanFor(t, '(Johnson & Goldstein, 2003)').includesPrevious).toBe(false);
  });

  test('"This" inside the sentence, not at its start, is not a cue (control)', () => {
    const t = 'Opener. We test this in two studies (Smith, 2020). Next.';
    expect(spanFor(t, '(Smith, 2020)').includesPrevious).toBe(false);
  });
});

describe('findClaimSpan — bounds', () => {
  test('text with no sentence punctuation (a table row) is capped and marked truncated', () => {
    const filler = 'cell value '.repeat(200);
    const t = `${filler}(Smith, 2020) ${filler}`;
    const s = spanFor(t, '(Smith, 2020)');
    expect(s.truncated).toBe(true);
    expect(s.end - s.start).toBeLessThanOrEqual(1200);
    expect(s.text).toContain('(Smith, 2020)');
  });

  test('the span always contains the citation itself', () => {
    const t = 'A. B (Smith, 2020) c. D.';
    const s = spanFor(t, '(Smith, 2020)');
    expect(s.start).toBeLessThanOrEqual(t.indexOf('(Smith'));
    expect(s.end).toBeGreaterThanOrEqual(t.indexOf('2020)') + 5);
  });

  test('out-of-range positions throw rather than returning a made-up span', () => {
    expect(() => findClaimSpan('short', 3, 99)).toThrow(RangeError);
    expect(() => findClaimSpan('short', 4, 2)).toThrow(RangeError);
  });
});
