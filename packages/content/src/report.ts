/** Rapport d'import lisible (Markdown) : nouveau contenu, contrôles, erreurs et avertissements. */
import type { EditionLoad } from './importer.js';

export function importReportMarkdown(load: EditionLoad, edition = ''): string {
  const errors = load.issues.filter((i) => i.severity === 'erreur');
  const warnings = load.issues.filter((i) => i.severity === 'avertissement');
  const v = load.verseStats;
  const lines: string[] = [];
  lines.push(`# Rapport d'import${edition ? ` — édition ${edition}` : ''}`, '');
  lines.push(`- Source : \`${load.contentDir}\` (empreinte ${load.sourceSha256.slice(0, 16)}…)`);
  lines.push(`- Date : ${new Date().toISOString()}`);
  lines.push(
    `- **Erreurs bloquantes : ${errors.length}** ; avertissements : ${warnings.length}`,
    '',
  );
  lines.push(
    '| Niveau | Unités | Leçons | Bilans | Examens | Exercices |',
    '|---|---|---|---|---|---|',
  );
  for (const l of load.levels) {
    const k = (kind: string) => l.units.filter((u) => u.kind === kind).length;
    const ex = l.units.reduce((s, u) => s + u.exercises.length, 0);
    lines.push(
      `| ${l.code} | ${l.units.length} | ${k('lecon')} | ${k('bilan')} | ${k('examen')} | ${ex} |`,
    );
  }
  lines.push('');
  lines.push(
    `- Versets contrôlés octet par octet contre Tanzil : ${v.total} (identiques ${v.identique}, extraits exacts ${v.extrait}, écarts voulus ${v.voulu}, erreurs ${v.erreurs})`,
  );
  lines.push(`- Illustrations retenues : ${load.illustrations?.size ?? 0}`);
  lines.push(`- Carnets de hifẓ : ${load.hifz.map((h) => h.code).join(', ') || 'aucun'}`);
  if (load.registry)
    lines.push(
      `- Registre : ${Object.keys(load.registry.coran).length} versets, ${Object.keys(load.registry.hadiths).length} hadiths, ${Object.keys(load.registry.fiqh).length} règles de fiqh`,
    );
  const section = (title: string, list: typeof load.issues) => {
    lines.push('', `## ${title} (${list.length})`, '');
    if (!list.length) lines.push('Aucun.');
    const byCode = new Map<string, typeof list>();
    for (const i of list) byCode.set(i.code, [...(byCode.get(i.code) ?? []), i]);
    for (const [code, items] of byCode) {
      lines.push(`### ${code} (${items.length})`, '');
      for (const i of items) lines.push(`- ${i.unit ?? i.file ?? ''} — ${i.message}`);
      lines.push('');
    }
  };
  section('Erreurs bloquantes', errors);
  section('Avertissements', warnings);
  return lines.join('\n');
}
