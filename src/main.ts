import './styles/main.css';
import { GameApp } from './game/GameApp.ts';

/**
 * Application entry point bootstrapping `GameApp` onto `#game-canvas`.
 */
async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('game-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Expected canvas element "#game-canvas"');
  }
  const app = new GameApp(canvas);
  await app.start();
  window.addEventListener('beforeunload', () => app.dispose(), { once: true });
}

void bootstrap();
