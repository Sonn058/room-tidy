// 오프닝 영상: assets/opening.mp4 를 화면 가득 재생하고, 끝나거나 건너뛰면 타이틀로 넘어간다
// 브라우저는 클릭 전에는 소리 있는 자동 재생을 막기 때문에, 막히면 음소거로 재생하고 클릭하면 소리를 켠다
import { initAudio } from './audio.js';
import { music } from './music.js';

const SRC = 'assets/opening.mp4';

export function playOpening() {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.id = 'opening';
    root.innerHTML =
      `<video src="${SRC}" playsinline preload="auto"></video>` +
      '<div class="op-sound gone">화면을 클릭하면 소리가 나요</div>' +
      '<button class="op-skip secondary small"><span>건너뛰기</span><kbd>Esc</kbd></button>';
    document.body.appendChild(root);
    const video = root.querySelector('video');
    const soundHint = root.querySelector('.op-sound');

    music.hold(true); // 영상 소리만 들리게 배경음악은 잠시 쉰다
    let ended = false;
    function end() {
      if (ended) return;
      ended = true;
      music.hold(false); // 타이틀이 나오면 음악이 서서히 시작된다
      removeEventListener('keydown', onKey, true);
      root.classList.add('leaving');
      resolve();
      setTimeout(() => {
        video.pause();
        video.removeAttribute('src');
        video.load();
        root.remove();
      }, 650);
    }

    // 소리를 켜고 재생 → 막히면 음소거로 재생하고 안내 표시
    video.play().catch(() => {
      video.muted = true;
      soundHint.classList.remove('gone');
      video.play().catch(end); // 영상 자체를 못 틀면 바로 타이틀로
    });

    const unmute = () => {
      initAudio();
      if (video.muted) {
        video.muted = false;
        soundHint.classList.add('gone');
      }
    };
    const onKey = (e) => {
      // 오프닝 동안에는 타이틀 메뉴가 키를 받지 않게 막는다
      e.stopImmediatePropagation();
      unmute();
      if (['Escape', 'Enter', 'NumpadEnter', 'Space'].includes(e.code)) {
        e.preventDefault();
        end();
      }
    };
    root.addEventListener('pointerdown', (e) => { if (!e.target.closest('.op-skip')) unmute(); });
    root.querySelector('.op-skip').addEventListener('click', end);
    addEventListener('keydown', onKey, true);
    video.addEventListener('ended', end);
    video.addEventListener('error', end);
  });
}
