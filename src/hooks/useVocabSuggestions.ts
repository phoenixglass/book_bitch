import { useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { collectVocabulary, collectSceneList } from '../utils/vocabulary';
import type { BinderItem } from '../types';
import { toText } from '../utils/metaValues';

function pushAll(into: Map<string, string>, values: Iterable<unknown>) {
  for (const raw of values) {
    const v = toText(raw);
    if (v && !into.has(v.toLowerCase())) into.set(v.toLowerCase(), v);
  }
}

function sceneStrings(items: BinderItem[], keys: Array<'location' | 'locationOverall' | 'povCharacter'>, out: string[] = []): string[] {
  for (const item of items) {
    if (item.id === 'trash') continue;
    for (const k of keys) {
      const v = item.sceneMetadata?.[k];
      if (v) out.push(v);
    }
    if (item.children?.length) sceneStrings(item.children, keys, out);
  }
  return out;
}

/**
 * Per-field autocomplete lists, so a theme box suggests existing themes, a
 * character box suggests characters, and neither leaks into the tag list.
 */
export function useVocabSuggestions() {
  const binder = useAppStore((s) => s.binder);
  const fragments = useAppStore((s) => s.fragments);
  const omittedMaterial = useAppStore((s) => s.omittedMaterial);
  const codexEntries = useAppStore((s) => s.codexEntries);

  return useMemo(() => {
    const state = {
      binder, fragments, omittedMaterial, codexEntries,
      notebookEntries: [], moodboardItems: [], researchEntries: [],
    };
    const themes = collectVocabulary(state, 'themes').map((e) => e.value);
    const motifs = collectVocabulary(state, 'motifs').map((e) => e.value);

    const characters = new Map<string, string>();
    pushAll(characters, collectSceneList(binder, 'charactersPresent'));
    pushAll(characters, sceneStrings(binder, ['povCharacter']));
    pushAll(characters, codexEntries.filter((c) => c.codexType === 'character').map((c) => c.name));
    pushAll(characters, fragments.flatMap((f) => f.relatedCharacters ?? []));
    pushAll(characters, omittedMaterial.flatMap((o) => o.relatedCharacters ?? []));

    const places = new Map<string, string>();
    pushAll(places, sceneStrings(binder, ['location', 'locationOverall']));
    pushAll(places, codexEntries.filter((c) => c.codexType === 'place').map((c) => c.name));
    pushAll(places, fragments.flatMap((f) => f.relatedPlaces ?? []));
    pushAll(places, omittedMaterial.flatMap((o) => o.relatedLocations ?? []));

    return {
      themes,
      motifs,
      characters: [...characters.values()],
      places: [...places.values()],
    };
  }, [binder, fragments, omittedMaterial, codexEntries]);
}
