// src/shell/use-profile-actions.ts: what a grown-up does to a profile: settings, backup and restore, archive,
// restore and delete, and the feedback form. The Shell's state, kept out of App.tsx.
import { useCallback } from 'react';
import type { AccessibilitySettings, LearningStrategy, ImportStrategy } from '../contracts/types';
import { APP_VERSION } from '../version';
import { profileRepo } from '../data/repositories/profile-repo';
import { syncQueueRepo } from '../data/repositories/sync-queue-repo';
import { exportProfile, importProfile, parseExportJson } from '../data/import-export';
import { applySettings, mergeSetting } from '../accessibility/settings';
import { presetToSettings } from '../accessibility/presets';
import type { NamedPreset } from '../accessibility/presets';
import { eventBus, setBusProfile } from './services';
import type { Learner } from './use-learner';
import type { ViewId } from './worlds';

export function useProfileActions(learner: Learner, setView: (view: ViewId) => void) {
  const { activeProfile, setActiveProfile, setProfiles, setArchivedProfiles, selectProfile } = learner;

  const handleContrastModeChange = useCallback(
    async (mode: AccessibilitySettings['contrastMode']) => {
      if (!activeProfile) return;
      const newSettings = mergeSetting(activeProfile.settings, 'contrastMode', mode);
      applySettings(newSettings);
      const updated = { ...activeProfile, settings: newSettings };
      await profileRepo.update(updated.id, { settings: newSettings });
      setActiveProfile(updated);
      eventBus.emit({ type: 'settings:changed', payload: { profileId: updated.id, settings: { contrastMode: mode } } });
    },
    [activeProfile, setActiveProfile],
  );

  const handleLearningStrategyChange = useCallback(
    async (strategy: LearningStrategy) => {
      if (!activeProfile) return;
      const newSettings = mergeSetting(activeProfile.settings, 'learningStrategy', strategy);
      const updated = { ...activeProfile, settings: newSettings };
      await profileRepo.update(updated.id, { settings: newSettings });
      setActiveProfile(updated);
      eventBus.emit({ type: 'settings:changed', payload: { profileId: updated.id, settings: { learningStrategy: strategy } } });
    },
    [activeProfile, setActiveProfile],
  );

  const handlePresetApply = useCallback(
    async (preset: NamedPreset) => {
      if (!activeProfile) return;
      // Keeps the current contrast mode and tutor strictness (see presetToSettings)
      const newSettings = presetToSettings(preset, activeProfile.settings);
      applySettings(newSettings);
      const updated = { ...activeProfile, settings: newSettings };
      await profileRepo.update(updated.id, { settings: newSettings });
      setActiveProfile(updated);
      eventBus.emit({ type: 'settings:changed', payload: { profileId: updated.id, settings: newSettings } });
    },
    [activeProfile, setActiveProfile],
  );

  const handleImportFilterWordsChange = useCallback(
    async (phrases: string[]) => {
      if (!activeProfile) return;
      const updated = { ...activeProfile, importFilterWords: phrases };
      await profileRepo.update(updated.id, { importFilterWords: phrases });
      setActiveProfile(updated);
    },
    [activeProfile, setActiveProfile],
  );

  const handleGradeGoalChange = useCallback(
    async (goal: number) => {
      if (!activeProfile) return;
      const updated = { ...activeProfile, gradeGoal: goal };
      await profileRepo.update(updated.id, { gradeGoal: goal });
      setActiveProfile(updated);
    },
    [activeProfile, setActiveProfile],
  );

  const handleFeedback = useCallback(async (text: string) => {
    // If online, the mailto: link in the form already opened the email client,
    // so mark as synced. If offline, mark as unsynced so the banner picks it up.
    await syncQueueRepo.addFeedback(
      {
        text,
        deviceInfo: {
          userAgent: navigator.userAgent,
          screenWidth: window.innerWidth,
          screenHeight: window.innerHeight,
          platform: navigator.platform,
        },
        appVersion: APP_VERSION,
      },
      navigator.onLine,
    );
  }, []);

  const handleExportProfile = useCallback(async () => {
    if (!activeProfile) return;
    const payload = await exportProfile(activeProfile.id);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spellforge-${activeProfile.name.toLowerCase().replace(/\s+/g, '-')}-backup.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeProfile]);

  const handleImportProfile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const payload = parseExportJson(text);
      const strategy: ImportStrategy = 'merge';
      await importProfile(payload, strategy);

      // Refresh the profile list so the imported profile appears
      const updatedProfiles = await profileRepo.getActive();
      setProfiles(updatedProfiles);
      setArchivedProfiles(await profileRepo.getArchived());

      // Reload the active profile's data (including theme) so the UI
      // reflects whatever was imported.  Use selectProfile for the full
      // reload path which also applies the theme palette.
      if (activeProfile) {
        const refreshed = updatedProfiles.find(p => p.id === activeProfile.id);
        if (refreshed) {
          // Re-select the current profile so theme + settings + data are
          // all consistent.  selectProfile will set the view to 'home',
          // so override it back to settings afterwards.
          await selectProfile(refreshed);
          setView('settings');
        }
      }
    } catch (err) {
      console.error('Profile import failed:', err);
    }
  }, [activeProfile, selectProfile, setProfiles, setArchivedProfiles, setView]);

  const reloadProfiles = useCallback(async () => {
    const active = await profileRepo.getActive();
    const archived = await profileRepo.getArchived();
    setProfiles(active);
    setArchivedProfiles(archived);
    return active;
  }, [setProfiles, setArchivedProfiles]);

  // If the profile that was archived or deleted is the open one, deselect it and go where the profiles that are left lead.
  const leaveIfOpen = useCallback(
    async (profileId: string, active: Awaited<ReturnType<typeof reloadProfiles>>) => {
      if (activeProfile?.id !== profileId) return;
      setActiveProfile(null);
      setBusProfile(null);
      if (active.length === 0) {
        setView('onboarding');
      } else if (active.length === 1) {
        await selectProfile(active[0]);
      } else {
        setView('profile-select');
      }
    },
    [activeProfile, setActiveProfile, selectProfile, setView],
  );

  const handleArchiveProfile = useCallback(
    async (profileId: string) => {
      await profileRepo.archive(profileId);
      const active = await reloadProfiles();
      eventBus.emit({ type: 'profile:archived', payload: { profileId } });
      await leaveIfOpen(profileId, active);
    },
    [reloadProfiles, leaveIfOpen],
  );

  const handleRestoreProfile = useCallback(
    async (profileId: string) => {
      await profileRepo.restore(profileId);
      await reloadProfiles();
      eventBus.emit({ type: 'profile:restored', payload: { profileId } });
    },
    [reloadProfiles],
  );

  const handleDeleteProfile = useCallback(
    async (profileId: string) => {
      await profileRepo.delete(profileId);
      const active = await reloadProfiles();
      eventBus.emit({ type: 'profile:deleted', payload: { profileId } });
      await leaveIfOpen(profileId, active);
    },
    [reloadProfiles, leaveIfOpen],
  );

  return {
    handleContrastModeChange, handleLearningStrategyChange, handlePresetApply, handleImportFilterWordsChange,
    handleGradeGoalChange, handleFeedback, handleExportProfile, handleImportProfile,
    handleArchiveProfile, handleRestoreProfile, handleDeleteProfile,
  };
}

export type ProfileActions = ReturnType<typeof useProfileActions>;
