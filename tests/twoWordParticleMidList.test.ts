/**
 * A two-word lowercase surname particle ("van der Maas", "de la Cruz") in the MIDDLE of an APA
 * author list keeps both its own surname and the author before it.
 *
 * chen_2021_jesp: "Wagenmakers, E. J., Wetzels, R., Borsboom, D., van der Maas, H. L., & Kievit,
 * R. A. (2012)" parsed as [Wagenmakers, Wetzels, der Maas, Kievit]. The author pattern allowed ONE
 * particle word, both in its boundary lookahead (so "Borsboom, D.," was not seen to end before
 * "van der") and in its own prefix (so the surname started at "der"). The same entry as the LAST
 * author ("& van der Maas") parsed correctly, which is why it went unnoticed.
 */
import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser.js';

function authorsOf(line: string) {
  return parseReferences(`Body.\n\nReferences\n${line}\n`, 'apa')[0].allAuthorLastNames;
}

describe('two-word particle surnames inside an APA author list', () => {
  it('Wagenmakers et al. (2012) keeps Borsboom and "van der Maas"', () => {
    expect(authorsOf('Wagenmakers, E. J., Wetzels, R., Borsboom, D., van der Maas, H. L., & Kievit, R. A. (2012). An agenda for purely confirmatory research. Perspectives on Psychological Science, 7, 632-638.'))
      .toEqual(['Wagenmakers', 'Wetzels', 'Borsboom', 'van der Maas', 'Kievit']);
  });

  it('"de la Cruz" in the middle', () => {
    expect(authorsOf('Smith, A., de la Cruz, M., & Jones, B. (2010). A title here. Journal, 1, 1-2.'))
      .toEqual(['Smith', 'de la Cruz', 'Jones']);
  });

  it('one-word particles and the last-author position are unchanged', () => {
    expect(authorsOf('Smith, A., Borsboom, D., de Vries, R., & Jones, B. (2010). A title here. Journal, 1, 1-2.'))
      .toEqual(['Smith', 'Borsboom', 'de Vries', 'Jones']);
    expect(authorsOf('Smith, A., Borsboom, D., & van der Maas, H. L. J. (2010). A title here. Journal, 1, 1-2.'))
      .toEqual(['Smith', 'Borsboom', 'van der Maas']);
  });
});
