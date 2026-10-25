// src/shell/screens/spelling.tsx: the spelling world's screens: practice, games, quiz, learning, the word lists and
// their editor, tests, the monster stable, coins and the calendar.
import type { TestResult } from '../../contracts/types';
import { ProgressView } from '../../features/dashboard/progress-view';
import { WordDetailView, CoinHistory, PracticeCalendar } from '../../features/dashboard';
import { PracticeScreen } from '../../features/practice/practice-screen';
import { PracticeGames } from '../../features/practice/practice-games';
import { QuizScreen } from '../../features/practice/quiz-screen';
import { LearningScreen } from '../../features/learning';
import { ListEditor } from '../../features/word-lists/list-editor';
import { WordListsView } from '../../features/word-lists/word-lists-view';
import { WordListDetail } from '../../features/word-lists/word-list-detail';
import { QrImport } from '../../features/word-lists/qr-import';
import { RecordTestResults } from '../../features/word-lists/record-test-results';
import { TestHistory } from '../../features/word-lists/test-history';
import { TestResultDetail } from '../../features/word-lists/test-result-detail';
import { TroubleWords } from '../../features/word-lists/trouble-words';
import { MonsterStable } from '../../features/rewards/monster-stable';
import { monsterCollection } from '../../features/rewards';
import { SpellingWorld as Spelling } from '../../worlds/spelling';
import { useApp } from '../app-state';
import { openView, type ViewId } from '../worlds';

/** The words missed on tests, most missed first. */
function troubleWordsOf(testResults: TestResult[]) {
  const missedMap = new Map<string, { word: string; wordId: string; count: number; dates: Date[] }>();
  for (const result of testResults) {
    for (const wr of result.wordResults) {
      if (!wr.correct) {
        const existing = missedMap.get(wr.wordId);
        if (existing) {
          existing.count++;
          existing.dates.push(result.testDate);
        } else {
          missedMap.set(wr.wordId, { word: wr.word, wordId: wr.wordId, count: 1, dates: [result.testDate] });
        }
      }
    }
  }
  return Array.from(missedMap.values())
    .map(({ word, wordId, count, dates }) => ({ word, wordId, missedCount: count, testDates: dates }))
    .sort((a, b) => b.missedCount - a.missedCount);
}

export function SpellingWorld({ view }: { view: ViewId | null }) {
  const app = useApp();
  const { activeProfile, setView, goBack, audioManager, audioBusy } = app;
  if (!activeProfile) return null;

  // A game or drill says its word in a language it names: the active list's, and the spelling graph's words are English.
  const speakIn = (language: string) => (word: string) => {
    console.log(`[Audio] onSpeak("${word}", ${language})`);
    return audioManager.runExclusive(() => audioManager.sayWord(word, language));
  };
  const onSpeak = speakIn(app.activeList?.language ?? 'en');
  const listLanguageOfWord = (wordId: string | null) =>
    app.wordLists.find((l) => l.id === app.allWords.find((w) => w.id === wordId)?.listId)?.language ?? 'en';
  const onSpeakGraphWord = speakIn('en');
  const practiceThese = (wordIds: Iterable<string>) => {
    app.setPracticeWordFilter(new Set(wordIds));
    setView('practice');
  };
  const editList = (list: Parameters<typeof app.setEditingList>[0]) => {
    app.setEditingList(list);
    setView('list-editor');
  };
  const recordResults = (list: Parameters<typeof app.setViewingList>[0]) => {
    app.setViewingList(list);
    setView('record-test-results');
  };
  const viewResult = (tr: TestResult) => {
    app.setViewingTestResult(tr);
    setView('test-result-detail');
  };
  const { allWords, allStats, wordLists, testResults, learningProgress, viewingList, viewingTestResult } = app;

  switch (view) {
    case 'practice':
      return (
        <PracticeScreen
          profile={activeProfile}
          activeList={app.activeList}
          allWords={app.practiceWordFilter ? allWords.filter((w) => app.practiceWordFilter!.has(w.id)) : app.activeWords}
          allStats={app.activeStats}
          daysUntilTest={app.daysUntilTest}
          streakCount={app.streakData?.currentStreak ?? 0}
          onSessionEnd={(log) => { app.handleSessionEnd(log); app.setPracticeWordFilter(null); }}
          onStatsUpdate={app.handleStatsUpdate}
          onBack={goBack}
          onSpeak={onSpeak}
          audioBusy={audioBusy}
        />
      );

    case 'practice-games':
      return (
        <PracticeGames
          profile={activeProfile}
          activeList={app.activeList}
          allWords={app.activeWords}
          coinBalance={app.coinBalance}
          allMastered={app.allMastered}
          onSpendCoin={app.handleSpendCoin}
          onSessionEnd={app.handleSessionEnd}
          onBack={goBack}
          onGoLearn={() => setView('learning')}
          onSpeak={onSpeak}
          audioBusy={audioBusy}
        />
      );

    case 'quiz':
      return (
        <QuizScreen
          profile={activeProfile}
          activeList={app.activeList}
          allWords={app.activeWords}
          onSessionEnd={app.handleSessionEnd}
          onBack={goBack}
          onSpeak={onSpeak}
          audioBusy={audioBusy}
        />
      );

    case 'learning':
      return (
        <LearningScreen
          profile={activeProfile}
          audioManager={audioManager}
          languageOfList={(listId) => wordLists.find((l) => l.id === listId)?.language ?? 'en'}
          onBack={goBack}
          onWordMastered={app.handleWordMasteredInLearning}
        />
      );

    case 'list-editor': {
      const editWords = app.editingList
        ? allWords.filter((w) => w.listId === app.editingList!.id).map((w) => w.text)
        : [];
      return (
        <ListEditor
          list={app.editingList}
          existingWords={editWords}
          ocrManager={app.ocrManager}
          profileId={activeProfile.id}
          onCreateList={app.handleCreatePhotoList}
          onSave={app.handleSaveList}
          onCancel={goBack}
        />
      );
    }

    case 'progress':
      return (
        <div className="bg-sf-bg min-h-screen">
          <ProgressView
            profileId={activeProfile.id}
            themeId={activeProfile.themeId}
            allWords={app.activeWords}
            allStats={app.activeStats}
            learningProgress={learningProgress}
            activeLists={app.activeLists}
            daysUntilTest={app.daysUntilTest}
            gradeGoal={activeProfile.gradeGoal ?? 100}
            onStartPractice={() => setView('practice')}
            onPracticeWords={practiceThese}
            onSelectWord={(wordId) => {
              app.setSelectedWordId(wordId);
              setView('word-detail');
            }}
            onLearnNewWords={() => setView('learning')}
            onAddWords={() => setView('list-editor')}
            onBack={goBack}
          />
        </div>
      );

    case 'word-detail':
      if (!app.selectedWordId) return null;
      return (
        <WordDetailView
          wordId={app.selectedWordId}
          profileId={activeProfile.id}
          onBack={goBack}
          onPlayAudio={(word) => audioManager.runExclusive(() => audioManager.sayWord(word, listLanguageOfWord(app.selectedWordId)))}
          onPracticeWord={(wordId) => practiceThese([wordId])}
        />
      );

    case 'word-list-detail':
      if (!viewingList) return null;
      return (
        <WordListDetail
          list={viewingList}
          words={allWords.filter((w) => w.listId === viewingList.id)}
          stats={allStats.filter((s) => allWords.some((w) => w.listId === viewingList.id && w.id === s.wordId))}
          learningProgress={learningProgress.filter((lp) => lp.wordListId === viewingList.id)}
          testResult={testResults.find((tr) => tr.wordListId === viewingList.id) ?? null}
          onUpdateWord={app.handleUpdateWord}
          onDeleteWord={app.handleDeleteWord}
          onAddWord={app.handleAddWordToList}
          onBack={goBack}
          onEditList={editList}
          onRecordTestResults={recordResults}
          onViewTestResult={viewResult}
        />
      );

    case 'word-lists':
      return (
        <WordListsView
          wordLists={wordLists}
          allWords={allWords}
          allStats={allStats}
          learningProgress={learningProgress}
          testResults={testResults}
          onAddList={() => editList(null)}
          onViewList={(list) => { app.setViewingList(list); setView('word-list-detail'); }}
          onEditList={editList}
          onDeleteList={app.handleDeleteList}
          onArchiveList={app.handleArchiveList}
          onUnarchiveList={app.handleUnarchiveList}
          onImportFromCamera={() => editList(null)}
          onImportFromQr={() => setView('qr-import')}
          onRecordTestResults={recordResults}
          onViewTestResult={viewResult}
          onViewTestHistory={() => setView('test-history')}
          onBack={goBack}
        />
      );

    case 'record-test-results':
      if (!viewingList) return null;
      return (
        <RecordTestResults
          list={viewingList}
          words={allWords.filter((w) => w.listId === viewingList.id)}
          onSave={app.handleSaveTestResults}
          onCancel={goBack}
        />
      );

    case 'test-history':
      return (
        <TestHistory
          testResults={testResults}
          wordLists={wordLists}
          onViewDetail={viewResult}
          onViewTroubleWords={() => setView('trouble-words')}
          onBack={goBack}
        />
      );

    case 'test-result-detail':
      if (!viewingTestResult) return null;
      return (
        <TestResultDetail
          testResult={viewingTestResult}
          list={wordLists.find((l) => l.id === viewingTestResult.wordListId) ?? null}
          onPracticeMissed={practiceThese}
          onBack={goBack}
        />
      );

    case 'spelling-home':
      // keyed by child: another child starts from his own place
      return (
        <Spelling
          key={activeProfile.id}
          profileId={activeProfile.id}
          onSpeak={(word) => void onSpeakGraphWord(word)}
          audioBusy={audioBusy}
          tapTargetSize={activeProfile.settings.tapTargetSize}
          themeId={activeProfile.themeId}
          onBack={goBack}
        />
      );

    case 'trouble-words':
      return <TroubleWords troubleWords={troubleWordsOf(testResults)} onPracticeWords={practiceThese} onBack={goBack} />;

    case 'qr-import':
      return (
        <QrImport
          onImport={app.handleQrImport}
          onCancel={goBack}
          existingListNames={wordLists.filter((l) => !l.archived).map((l) => l.name)}
        />
      );

    case 'monster-stable':
      return (
        <MonsterStable
          profile={activeProfile}
          collection={monsterCollection.getCollection(activeProfile.id)}
          onBack={goBack}
        />
      );

    case 'coin-history':
      return (
        <CoinHistory
          profileId={activeProfile.id}
          coinBalance={app.coinBalance}
          allStats={app.activeStats}
          activeWordCount={app.activeWords.length}
          onBack={goBack}
          onNavigate={(v, wordFilter) => { if (wordFilter) app.setPracticeWordFilter(wordFilter); openView(v, setView); }}
          onAddWords={() => editList(null)}
        />
      );

    case 'practice-calendar':
      return <PracticeCalendar profileId={activeProfile.id} streakData={app.streakData} onBack={goBack} />;

    default:
      return null;
  }
}
