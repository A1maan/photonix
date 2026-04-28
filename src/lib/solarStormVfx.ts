import * as THREE from "three";
import {
  BatchedRenderer,
  Bezier,
  ColorOverLife,
  ColorRange,
  ConstantValue,
  EmitterMode,
  Gradient,
  IntervalValue,
  Noise,
  ParticleSystem,
  PiecewiseBezier,
  RectangleEmitter,
  RenderMode,
  SizeOverLife,
  SphereEmitter,
  Vector3 as QuarksVector3,
  Vector4 as QuarksVector4,
} from "three.quarks";

export type SolarStormVfxHandle = {
  group: THREE.Group;
  setImpactPosition: (position: THREE.Vector3) => void;
  update: (deltaSeconds: number) => void;
  dispose: () => void;
};

type SolarStormVfxOptions = {
  start: THREE.Vector3;
  end: THREE.Vector3;
  impact: THREE.Vector3;
  intensity: number;
};

export function createSolarStormVfx({ start, end, impact, intensity }: SolarStormVfxOptions): SolarStormVfxHandle {
  const root = new THREE.Group();
  root.name = "Photonix solar storm VFX";

  const clampedIntensity = Math.min(1, Math.max(0.35, intensity));
  const particleTexture = createParticleTexture();
  const particleMaterial = new THREE.MeshBasicMaterial({
    map: particleTexture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.95,
    color: "#ffffff",
  });
  const batchRenderer = new BatchedRenderer();
  root.add(batchRenderer);

  const shockMaterial = new THREE.MeshBasicMaterial({
    color: "#ff5f2e",
    transparent: true,
    opacity: 0.2 + clampedIntensity * 0.14,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const shockPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 1), shockMaterial);
  shockPlane.name = "CME shock sheet";
  shockPlane.renderOrder = 30;
  root.add(shockPlane);

  const frontSystem = new ParticleSystem({
    looping: true,
    prewarm: true,
    duration: 4.8,
    worldSpace: false,
    shape: new RectangleEmitter({
      width: 58 + clampedIntensity * 34,
      height: 32 + clampedIntensity * 22,
      thickness: 0.62,
      mode: EmitterMode.Random,
    }),
    startLife: new IntervalValue(1.35, 2.7),
    startSpeed: new IntervalValue(2.8, 8.5 + clampedIntensity * 5.5),
    startSize: new IntervalValue(2.2, 5.8 + clampedIntensity * 3.2),
    startRotation: new IntervalValue(0, Math.PI * 2),
    startColor: new ColorRange(new QuarksVector4(1, 0.24, 0.08, 0.74), new QuarksVector4(1, 0.78, 0.24, 0.96)),
    emissionOverTime: new ConstantValue(120 + clampedIntensity * 260),
    material: particleMaterial,
    renderMode: RenderMode.BillBoard,
    renderOrder: 31,
    behaviors: [
      new ColorOverLife(
        new Gradient(
          [
            [new QuarksVector3(1, 0.2, 0.05), 0],
            [new QuarksVector3(1, 0.67, 0.18), 0.45],
            [new QuarksVector3(0.95, 0.08, 0.05), 1],
          ],
          [
            [0, 0],
            [0.86, 0.18],
            [0.2, 0.72],
            [0, 1],
          ],
        ),
      ),
      new SizeOverLife(new PiecewiseBezier([[new Bezier(0.24, 0.9, 0.72, 0.12), 0]])),
      new Noise(new ConstantValue(0.62), new ConstantValue(0.86 + clampedIntensity * 0.5), new ConstantValue(0.9), new ConstantValue(0.2)),
    ],
  });
  frontSystem.emitter.name = "CME plasma front emitter";
  root.add(frontSystem.emitter);
  batchRenderer.addSystem(frontSystem);

  const sparkSystem = new ParticleSystem({
    looping: true,
    duration: 1.3,
    worldSpace: false,
    shape: new SphereEmitter({ radius: 1.9 + clampedIntensity * 1.4, thickness: 0.36 }),
    startLife: new IntervalValue(0.38, 0.9),
    startSpeed: new IntervalValue(7.5, 15 + clampedIntensity * 9),
    startSize: new IntervalValue(0.65, 1.8 + clampedIntensity * 1.2),
    startRotation: new IntervalValue(0, Math.PI * 2),
    startColor: new ColorRange(new QuarksVector4(1, 0.18, 0.12, 0.95), new QuarksVector4(1, 0.92, 0.38, 1)),
    emissionOverTime: new ConstantValue(36 + clampedIntensity * 72),
    emissionBursts: [
      {
        time: 0.16,
        count: new ConstantValue(18 + Math.round(clampedIntensity * 26)),
        cycle: 1,
        interval: 0,
        probability: 1,
      },
    ],
    material: particleMaterial,
    renderMode: RenderMode.BillBoard,
    renderOrder: 32,
    behaviors: [
      new ColorOverLife(
        new Gradient(
          [
            [new QuarksVector3(1, 0.86, 0.34), 0],
            [new QuarksVector3(1, 0.16, 0.1), 1],
          ],
          [
            [1, 0],
            [0.62, 0.36],
            [0, 1],
          ],
        ),
      ),
      new SizeOverLife(new PiecewiseBezier([[new Bezier(0.3, 1.1, 0.54, 0), 0]])),
    ],
  });
  sparkSystem.emitter.name = "Dawn-2 radiation spark emitter";
  sparkSystem.emitter.position.copy(impact);
  root.add(sparkSystem.emitter);
  batchRenderer.addSystem(sparkSystem);

  let elapsed = 0;
  const frontPosition = new THREE.Vector3();
  const impactPosition = impact.clone();

  const placeFront = (progress: number) => {
    const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    frontPosition.lerpVectors(start, end, eased);
    frontSystem.emitter.position.copy(frontPosition);
    shockPlane.position.copy(frontPosition);
    frontSystem.emitter.lookAt(0, 0, 0);
    shockPlane.lookAt(0, 0, 0);
    shockPlane.rotateZ(-0.32);
  };

  placeFront(0);

  return {
    group: root,
    setImpactPosition(position: THREE.Vector3) {
      impactPosition.copy(position);
      sparkSystem.emitter.position.copy(impactPosition);
    },
    update(deltaSeconds: number) {
      elapsed += deltaSeconds;
      const cycle = (elapsed / 5.7) % 1;
      placeFront(cycle);
      sparkSystem.emitter.position.copy(impactPosition);
      const pulse = 0.72 + Math.sin(elapsed * 5.4) * 0.16 + clampedIntensity * 0.2;
      shockPlane.scale.set(58 + clampedIntensity * 42, 30 + clampedIntensity * 28, 1);
      shockMaterial.opacity = Math.max(0.08, Math.min(0.42, pulse * 0.28));
      batchRenderer.update(deltaSeconds);
    },
    dispose() {
      frontSystem.dispose();
      sparkSystem.dispose();
      if (root.parent) {
        root.parent.remove(root);
      }
      disposeObject(root);
      particleTexture.dispose();
      particleMaterial.dispose();
      shockMaterial.dispose();
    },
  };
}

function createParticleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext("2d");

  if (context) {
    const gradient = context.createRadialGradient(48, 48, 0, 48, 48, 48);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.22, "rgba(255, 220, 148, 0.92)");
    gradient.addColorStop(0.5, "rgba(255, 99, 42, 0.42)");
    gradient.addColorStop(1, "rgba(255, 40, 24, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }

    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
    } else if (material) {
      material.dispose();
    }
  });
}
