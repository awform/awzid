import { describe, expect, it } from 'vitest';
import { contentText } from './content-text';

describe('consignes des livres : mécanisme de traduction du contenu', () => {
  const ex = {
    consigne_fr: 'Je relie le mot et l’image.',
    consigne_en: 'I match the word with the picture.',
  };
  it('traduction présente : utilisée dans la langue de l’interface', () => {
    expect(contentText(ex, 'consigne', 'en')).toEqual({
      text: 'I match the word with the picture.',
      lang: 'en',
    });
  });
  it('traduction absente : le français, signalé comme tel', () => {
    expect(contentText({ consigne_fr: 'Je lis.' }, 'consigne', 'en')).toEqual({
      text: 'Je lis.',
      lang: 'fr',
    });
    expect(contentText(ex, 'consigne', 'fr')!.lang).toBe('fr');
    expect(contentText({}, 'consigne', 'en')).toBeNull();
    expect(contentText({ consigne_en: '  ', consigne_fr: 'x' }, 'consigne', 'en')!.lang).toBe('fr');
  });
});
