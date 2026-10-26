// src/look/scene/fallback.tsx — the front door's scene, or its still fallback. The WebGL scene (FrontDoorScene.tsx, with OGL) is a
// lazy chunk, fetched only when it may be drawn: a phone that asks for less motion, a browser with no WebGL, or one whose WebGL
// fails or is taken away gets the still picture, drawn in CSS from the same theme colours, and no canvas is ever made for it.
import { lazy, Suspense, useEffect, useState } from 'react';
import { markScenePainted } from './clock';
import { sceneAllowed } from './webgl-support';
import './scene.css';

const FrontDoorScene = lazy(() => import('./FrontDoorScene'));

/** The still picture: the theme's colours as soft light on paper, drawn by CSS (scene.css). Nothing moves. */
export function SceneFallback() {
  useEffect(markScenePainted, []);
  return <div className="sf-scene sf-scene-still" data-testid="scene-fallback" aria-hidden="true" />;
}

/** Behind the door: the live scene when it may be drawn, else the still one. The still one also stands in while the chunk loads. */
export function SceneOrFallback() {
  const [allowed] = useState(sceneAllowed);
  const [failed, setFailed] = useState(false);
  if (!allowed || failed) return <SceneFallback />;
  return (
    <Suspense fallback={<SceneFallback />}>
      <FrontDoorScene onFail={() => setFailed(true)} />
    </Suspense>
  );
}
