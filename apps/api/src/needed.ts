import {
  illustrationKeys,
  PERSONNAGES,
  sceneKeys,
  type Lesson,
  type SceneSpec,
} from '@awform/content';

/** Clés d'illustration nécessaires au rendu d'une leçon (données + décors de scène + personnages). */
export function neededIllustrations(lesson: Lesson): string[] {
  const keys = new Set(illustrationKeys(lesson));
  if (lesson.scene) for (const k of sceneKeys(lesson.scene as SceneSpec)) keys.add(k);
  const D = lesson.dialogue as { lieu?: string; props?: string[] } | undefined;
  if (D) {
    for (const k of sceneKeys({ lieu: D.lieu, props: D.props })) keys.add(k);
    for (const k of PERSONNAGES) keys.add(k);
  }
  return [...keys].sort();
}
