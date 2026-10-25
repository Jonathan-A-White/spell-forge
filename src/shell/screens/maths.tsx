// src/shell/screens/maths.tsx: the Maths world's screen: the flow over the open child's place in the maths graph (src/worlds/maths).
import { MathsWorld as Maths } from '../../worlds/maths';
import { useApp } from '../app-state';

export function MathsWorld() {
  const { activeProfile, goBack } = useApp();
  if (!activeProfile) return null;
  // keyed by child: another child starts from his own place
  return <Maths key={activeProfile.id} profileId={activeProfile.id} onBack={goBack} />;
}
