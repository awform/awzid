import { describe, expect, it } from 'vitest';
import { bare, letterColorIndex, plain, splitMarked } from '../src/text.js';
import { calleeName, evalSandboxed, parseDataFile, parseStrictCall } from '../src/parse.js';
import { canonicalJson, contentHash } from '../src/canonical.js';

describe('text (repris du moteur awform.js)', () => {
  it('plain retire seulement les crochets', () => {
    expect(plain('[بَ]ابٌ')).toBe('بَابٌ');
  });
  it('bare retire voyelles, tanwin, chadda, soukoun, petit alif, tatwil et crochets', () => {
    expect(bare('[بَ]ابٌ')).toBe('باب');
    expect(bare('مَدْرَسَةٌ')).toBe('مدرسة');
    expect(bare('ـبـ')).toBe('ب');
    expect(bare('ٱلرَّحْمَٰنِ')).toBe('ٱلرحمن');
  });
  it('découpe les segments balisés et calcule la couleur (préfixe le plus long)', () => {
    expect(splitMarked('[بَ]ا[بٌ]')).toEqual([
      { text: 'بَ', marked: true },
      { text: 'ا', marked: false },
      { text: 'بٌ', marked: true },
    ]);
    const lettres = [{ l: 'ب' }, { l: 'ت' }, { l: 'ال' }];
    expect(letterColorIndex('تَ', lettres)).toBe(1);
    expect(letterColorIndex('الشَّ', lettres)).toBe(2);
    expect(letterColorIndex('دْ', lettres)).toBe(3);
  });
});

describe('lecture des fichiers AW.xxx(...)', () => {
  it('lit le JSON strict', () => {
    const v = parseStrictCall('AW.lesson({"n":1,"titre_ar":"بَابٌ"});');
    expect(v).toEqual({ n: 1, titre_ar: 'بَابٌ' });
    expect(calleeName('AW.lesson({})')).toBe('AW.lesson');
  });
  it('refuse le JSON non strict en mode strict', () => {
    expect(() => parseStrictCall('AW.book({code:"en1"});')).toThrow(/JSON non strict/);
  });
  it('lit un fichier non strict dans le bac à sable', () => {
    const p = parseDataFile('AW.book({\n  code:"en1", n: 1, liste:["a","b",],\n});', 'book.js');
    expect(p.strict).toBe(false);
    expect(p.value).toEqual({ code: 'en1', n: 1, liste: ['a', 'b'] });
  });
  it("lit une affectation AW.lessonIndex = {...}", () => {
    const p = parseDataFile('AW.lessonIndex={"en1.l01":{"t":"lecon","n":1,"f":"x"}};');
    expect(p.strict).toBe(true);
    expect(p.value).toEqual({ 'en1.l01': { t: 'lecon', n: 1, f: 'x' } });
  });
  it("le bac à sable n'a accès ni à process, ni à require, ni aux constructeurs de l'hôte", () => {
    expect(() => evalSandboxed('AW.book(process.env)')).toThrow();
    expect(() => evalSandboxed('AW.book(require("fs"))')).toThrow();
    expect(() => evalSandboxed('AW.book(this.constructor.constructor("return process")())')).toThrow();
    expect(() => evalSandboxed('AW.book(Function("return 1")())')).toThrow();
  });
  it('le bac à sable coupe une boucle infinie', () => {
    expect(() => evalSandboxed('while(true){}', 'boucle.js', 100)).toThrow(/bac à sable/);
  });
});

describe('empreintes', () => {
  it('JSON canonique : clés triées, texte arabe intact', () => {
    expect(canonicalJson({ b: 1, a: ['بِسْمِ', { d: 2, c: 3 }] })).toBe('{"a":["بِسْمِ",{"c":3,"d":2}],"b":1}');
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
  });
  it("l'empreinte distingue deux graphies canoniquement équivalentes (aucune normalisation)", () => {
    const tanzilOrder = 'ٱللَّهِ'; // chadda puis fatha (ordre Tanzil)
    const swapped = 'ٱللَّهِ'; // fatha puis chadda (ordre produit par une normalisation NFC)
    expect(swapped).not.toBe(tanzilOrder);
    expect(contentHash(swapped)).not.toBe(contentHash(tanzilOrder));
  });
});
