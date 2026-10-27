// 렌더링: 환경 반사광만 쓰는 가벼운 방식 (후처리 없음)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function setupGraphics(renderer, scene, camera) {
  // 은은한 실내 반사광 (둥근 모서리에 하이라이트가 맺힘)
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  return {
    resize() {},
    render() {
      renderer.render(scene, camera);
    },
  };
}
