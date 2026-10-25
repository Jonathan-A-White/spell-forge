// src/features/front-door/getting-to-know.ts — what the tutor learns of the child in the front door's talk. A tutor-talk
// answer's profile_update (grinds/tutor-talk.answer.schema.json) is folded into the child's @learn-kit/learner profile by
// the kit's merge rule, each value kept with the turn it came from: a guess never replaces what he said in so many words,
// and talk never replaces a value a grown-up set by hand.
import { PROFILE_FIELDS, emptyProfile, learnAll, type LearnResult, type Profile as LearnerProfile, type ProfileAnswer, type ProfileValues } from 'learn-kit/learner';
import { profileRepo } from '../../data/repositories';

/** What one answer taught the tutor about him, as the grind gives it. */
export interface ProfileUpdate extends Partial<ProfileValues> {
  notes?: string[];
  /** The fields above it guessed from how he talks, rather than was told. */
  guessed?: (keyof ProfileValues)[];
}

/** The id a turn of the front door's talk goes by in the learner profile: the talk's id and the turn's place in it. */
export function turnRef(talkId: string, index: number): string {
  return `${talkId}#${index}`;
}

/** The update as learn-kit's answers, each with its turn and when: told, unless the grind says it guessed. */
export function answersOf(update: ProfileUpdate, turn: string, when: number): ProfileAnswer[] {
  const guessed = new Set(update.guessed ?? []);
  const answers: ProfileAnswer[] = [];
  for (const field of PROFILE_FIELDS) {
    const value = update[field];
    if (value === undefined) continue;
    answers.push({ field, value, turn, when, sure: guessed.has(field) ? 'guessed' : 'told' } as ProfileAnswer);
  }
  for (const text of update.notes ?? []) answers.push({ field: 'note', value: text, turn, when });
  return answers;
}

/** Folds an update into the child's learner profile and keeps it; what became of each answer, in order. */
export async function foldProfileUpdate(
  profileId: string,
  update: ProfileUpdate,
  turn: string,
  when: number,
): Promise<{ learner: LearnerProfile; results: LearnResult[] }> {
  const profile = await profileRepo.getById(profileId);
  if (!profile) throw new Error(`Profile ${profileId} not found`);
  const answers = answersOf(update, turn, when);
  const kept = profile.learner ?? emptyProfile();
  if (answers.length === 0) return { learner: kept, results: [] };
  const { profile: learner, results } = learnAll(kept, answers);
  if (learner !== profile.learner) await profileRepo.update(profileId, { learner });
  return { learner, results };
}
