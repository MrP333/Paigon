import React, { useRef, useEffect, useState, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { MazeData, Coordinate } from "../types";

interface RemotePlayer {
  id: string;
  name: string;
  row: number;
  col: number;
  yaw: number;
}

interface MazeDisplayProps {
  maze: MazeData;
  onWin: () => void;
  onMoveChange: (pos: Coordinate) => void;
  inputVector: { x: number; y: number };

  // Multiplayer (optional)
  roomId?: string;
  yourId?: string;
  remotePlayers?: RemotePlayer[];
  onPlayerStateChange?: (s: { row: number; col: number; yaw: number }) => void;
}

const CELL_SIZE = 2;
const WALL_HEIGHT = 2.5;
const BALL_RADIUS = 0.4;
const BALL_SPEED = 14.0;
const CAM_DISTANCE = 7.0;
const CAM_HEIGHT = 3.2;
const FOLLOW_LERP = 15.0;
const TURN_SPEED = 8.0;
const LOOK_AHEAD = 2.0;

const generateBallTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#22d3ee";
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = "#0891b2";
    const size = 32;
    for (let y = 0; y < 256; y += size) {
      for (let x = 0; x < 256; x += size) {
        if ((x / size + y / size) % 2 === 0) ctx.fillRect(x, y, size, size);
      }
    }

    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.4;
    ctx.fillRect(0, 110, 256, 36);
  }
  return new THREE.CanvasTexture(canvas);
};

function normalizeYaw(yaw: number) {
  return Math.atan2(Math.sin(yaw), Math.cos(yaw));
}

function getInitialYaw() {
  // Face right (entrance is on the left wall)
  return -Math.PI / 2;
}

type GameSceneProps = MazeDisplayProps & {
  setDebug: (val: string) => void;
  onTeleport: () => void;
};

const GameScene: React.FC<GameSceneProps> = ({
  maze,
  onWin,
  onMoveChange,
  inputVector,
  setDebug,
  onTeleport,
  yourId,
  remotePlayers,
  onPlayerStateChange,
}) => {
  const ballRef = useRef<THREE.Mesh>(null);
  const rigRef = useRef<THREE.Group>(null);
  const wallRefs = useRef<THREE.Mesh[]>([]);
  const remoteMeshRefs = useRef<Record<string, THREE.Mesh>>({});
  const remoteVisualPos = useRef<Record<string, THREE.Vector3>>({});

  const { camera, scene } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  const isMoving = useRef(false);
  const currentGrid = useRef({ row: maze.start.row, col: maze.start.col });
  const targetGrid = useRef({ row: maze.start.row, col: maze.start.col });

  const visualPosition = useRef(
    new THREE.Vector3(maze.start.col * CELL_SIZE, BALL_RADIUS, maze.start.row * CELL_SIZE)
  );
  const targetWorldPos = useRef(visualPosition.current.clone());

  const targetYaw = useRef(0);
  const controlYaw = useRef(0);
  const currentTargetQuat = useMemo(() => new THREE.Quaternion(), []);

  const emitPlayerState = (row: number, col: number, yaw: number) => {
    onPlayerStateChange?.({ row, col, yaw });
  };

  const performTeleport = () => {
    isMoving.current = false;
    currentGrid.current = { ...maze.start };
    targetGrid.current = { ...maze.start };

    visualPosition.current.set(maze.start.col * CELL_SIZE, BALL_RADIUS, maze.start.row * CELL_SIZE);
    targetWorldPos.current.copy(visualPosition.current);

    const startYaw = getInitialYaw();
    targetYaw.current = startYaw;
    controlYaw.current = startYaw;

    if (rigRef.current) {
      currentTargetQuat.setFromEuler(new THREE.Euler(0, startYaw, 0));
      rigRef.current.quaternion.copy(currentTargetQuat);
      rigRef.current.position.copy(visualPosition.current);
    }

    // multiplayer update
    emitPlayerState(currentGrid.current.row, currentGrid.current.col, controlYaw.current);

    onTeleport();
  };

  useEffect(() => {
    wallRefs.current = [];
    performTeleport();
    scene.fog = new THREE.Fog("#0f172a", 8, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maze, scene]);

  const keys = useRef<{ [key: string]: boolean }>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      const rotationKeys = new Set(["ArrowLeft", "ArrowRight", "KeyA", "KeyD"]);
      const moveKeys = new Set(["ArrowUp", "KeyW", "ArrowDown", "KeyS"]);

      if (rotationKeys.has(e.code) || moveKeys.has(e.code)) {
        e.preventDefault();
        e.stopPropagation();
      }

      // Edge-triggered turning
      if (e.code === "ArrowLeft" || e.code === "KeyA") {
        controlYaw.current = normalizeYaw(controlYaw.current + Math.PI / 2);
        targetYaw.current = controlYaw.current;

        // multiplayer update
        emitPlayerState(currentGrid.current.row, currentGrid.current.col, controlYaw.current);
      } else if (e.code === "ArrowRight" || e.code === "KeyD") {
        controlYaw.current = normalizeYaw(controlYaw.current - Math.PI / 2);
        targetYaw.current = controlYaw.current;

        // multiplayer update
        emitPlayerState(currentGrid.current.row, currentGrid.current.col, controlYaw.current);
      }

      keys.current[e.code] = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };

    window.addEventListener("keydown", handleKeyDown, { passive: false });
    window.addEventListener("keyup", handleKeyUp, { passive: false });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useFrame((state, delta) => {
    if (!ballRef.current || !rigRef.current) return;

    // ---- LOCAL PLAYER MOVEMENT ----
    if (!isMoving.current) {
      const upK = keys.current["ArrowUp"] || keys.current["KeyW"];
      const joyForward = inputVector.y < -0.5;

      // forward only
      if (upK || joyForward) {
        const forward = new THREE.Vector3(0, 0, -1);
        const currentQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, controlYaw.current, 0));
        const worldDir = forward.applyQuaternion(currentQuat);

        let stepRow = 0,
          stepCol = 0;
        if (Math.abs(worldDir.x) >= Math.abs(worldDir.z)) {
          stepCol = Math.sign(worldDir.x);
        } else {
          stepRow = Math.sign(worldDir.z);
        }

        const nextRow = currentGrid.current.row + stepRow;
        const nextCol = currentGrid.current.col + stepCol;

        if (nextRow >= 0 && nextRow < maze.size && nextCol >= 0 && nextCol < maze.size) {
          if (maze.grid[nextRow][nextCol] === 0) {
            isMoving.current = true;
            targetGrid.current = { row: nextRow, col: nextCol };
            targetWorldPos.current.set(nextCol * CELL_SIZE, BALL_RADIUS, nextRow * CELL_SIZE);

            onMoveChange(targetGrid.current);

            // multiplayer update (announce intended / new cell)
            emitPlayerState(targetGrid.current.row, targetGrid.current.col, controlYaw.current);
          }
        }
      }
    }

    if (isMoving.current) {
      const moveDist = BALL_SPEED * delta;
      const toTarget = targetWorldPos.current.clone().sub(visualPosition.current);

      if (toTarget.length() <= moveDist) {
        visualPosition.current.copy(targetWorldPos.current);
        currentGrid.current = { ...targetGrid.current };
        isMoving.current = false;

        // multiplayer update (confirm arrival)
        emitPlayerState(currentGrid.current.row, currentGrid.current.col, controlYaw.current);

        if (currentGrid.current.row === maze.end.row && currentGrid.current.col === maze.end.col) {
          onWin();
          return;
        }

        const isCheckpoint = maze.checkpoints.some(
          (cp) => cp.row === currentGrid.current.row && cp.col === currentGrid.current.col
        );
        if (isCheckpoint) {
          performTeleport();
          return;
        }
      } else {
        const step = toTarget.normalize().multiplyScalar(moveDist);
        visualPosition.current.add(step);

        const up = new THREE.Vector3(0, 1, 0);
        const rollAxis = new THREE.Vector3().crossVectors(step, up).normalize();
        ballRef.current.rotateOnWorldAxis(rollAxis, moveDist * 2.5);
      }
    }

    ballRef.current.position.copy(visualPosition.current);

    // ---- CAMERA RIG FOLLOW / ROTATION ----
    rigRef.current.position.lerp(visualPosition.current, Math.min(1, FOLLOW_LERP * delta));
    currentTargetQuat.setFromEuler(new THREE.Euler(0, targetYaw.current, 0));
    rigRef.current.quaternion.slerp(currentTargetQuat, Math.min(1, TURN_SPEED * delta));

    // ---- CAMERA COLLISION ----
    const localCamOffset = new THREE.Vector3(0, CAM_HEIGHT, CAM_DISTANCE);
    const desiredCamWorld = rigRef.current.localToWorld(localCamOffset.clone());
    const origin = visualPosition.current.clone().add(new THREE.Vector3(0, 0.6, 0));
    const toCamDir = desiredCamWorld.clone().sub(origin);
    const maxDist = toCamDir.length();
    toCamDir.normalize();
    raycaster.set(origin, toCamDir);
    const hits = raycaster.intersectObjects(wallRefs.current, false);

    if (hits.length > 0 && hits[0].distance < maxDist) {
      const safeDist = Math.max(1.2, hits[0].distance - 0.35);
      const finalCamPos = origin.clone().add(toCamDir.multiplyScalar(safeDist));
      if (safeDist < 2.5) finalCamPos.y += (2.5 - safeDist) * 1.2;
      camera.position.copy(rigRef.current.worldToLocal(finalCamPos));
    } else {
      camera.position.copy(localCamOffset);
    }

    const rigForward = new THREE.Vector3(0, 0, -1).applyQuaternion(rigRef.current.quaternion);
    const lookAtPos = visualPosition.current.clone().add(rigForward.multiplyScalar(LOOK_AHEAD));
    camera.lookAt(lookAtPos.x, visualPosition.current.y + 0.3, lookAtPos.z);

    // ---- REMOTE PLAYER SMOOTHING ----
    if (remotePlayers && remotePlayers.length) {
      for (const p of remotePlayers) {
        if (!p?.id) continue;
        if (yourId && p.id === yourId) continue;

        // ensure visual vector exists
        if (!remoteVisualPos.current[p.id]) {
          remoteVisualPos.current[p.id] = new THREE.Vector3(p.col * CELL_SIZE, BALL_RADIUS, p.row * CELL_SIZE);
        }

        const target = new THREE.Vector3(p.col * CELL_SIZE, BALL_RADIUS, p.row * CELL_SIZE);
        remoteVisualPos.current[p.id].lerp(target, Math.min(1, 12 * delta));

        const mesh = remoteMeshRefs.current[p.id];
        if (mesh) {
          mesh.position.copy(remoteVisualPos.current[p.id]);
        }
      }
    }

    setDebug(`FACING: ${Math.round((controlYaw.current * 180) / Math.PI)}° | POS: [${currentGrid.current.row},${currentGrid.current.col}]`);
  });

  const wallMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.1, metalness: 0.1 }),
    []
  );
  const ballMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ map: generateBallTexture(), emissive: "#22d3ee", emissiveIntensity: 0.8 }),
    []
  );
  const remoteMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#a78bfa", roughness: 0.3, metalness: 0.1 }),
    []
  );

  const walls = useMemo(() => {
    const boxes: React.ReactElement[] = [];
    maze.grid.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (cell === 1) {
          boxes.push(
            <mesh
              key={`${r}-${c}`}
              position={[c * CELL_SIZE, WALL_HEIGHT / 2, r * CELL_SIZE]}
              material={wallMaterial}
              castShadow
              receiveShadow
              ref={(el) => {
                if (el && !wallRefs.current.includes(el)) wallRefs.current.push(el);
              }}
            >
              <boxGeometry args={[CELL_SIZE, WALL_HEIGHT, CELL_SIZE]} />
            </mesh>
          );
        }
      });
    });
    return boxes;
  }, [maze, wallMaterial]);

  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[10, 30, 10]} intensity={2.0} castShadow />

      <group ref={rigRef}>
        <PerspectiveCamera makeDefault fov={75} />
      </group>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[maze.size, -0.01, maze.size]} receiveShadow>
        <planeGeometry args={[maze.size * CELL_SIZE * 10, maze.size * CELL_SIZE * 10]} />
        <meshStandardMaterial color="#020617" roughness={0.9} />
      </mesh>

      <gridHelper args={[200, 100, "#1e293b", "#0f172a"]} position={[maze.size, 0, maze.size]} />

      {/* Start */}
      <mesh position={[maze.start.col * CELL_SIZE, 0.05, maze.start.row * CELL_SIZE]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[CELL_SIZE * 0.9, CELL_SIZE * 0.9]} />
        <meshBasicMaterial color="#10b981" transparent opacity={0.6} />
      </mesh>

      {/* End */}
      <mesh position={[maze.end.col * CELL_SIZE, 0.05, maze.end.row * CELL_SIZE]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[CELL_SIZE * 0.9, CELL_SIZE * 0.9]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.6} />
      </mesh>

      <group>{walls}</group>

      {/* Local player */}
      <mesh ref={ballRef} material={ballMaterial} castShadow>
        <sphereGeometry args={[BALL_RADIUS, 32, 32]} />
        <pointLight distance={15} intensity={10} color="#22d3ee" />
      </mesh>

      {/* Remote players */}
      {remotePlayers
        ?.filter((p) => !yourId || p.id !== yourId)
        .map((p) => (
          <mesh
            key={p.id}
            material={remoteMaterial}
            castShadow
            ref={(el) => {
              if (el) remoteMeshRefs.current[p.id] = el;
            }}
            position={[p.col * CELL_SIZE, BALL_RADIUS, p.row * CELL_SIZE]}
          >
            <sphereGeometry args={[BALL_RADIUS * 0.9, 24, 24]} />
          </mesh>
        ))}
    </>
  );
};

const MazeDisplay: React.FC<MazeDisplayProps> = (props) => {
  const [debugText, setDebugText] = useState("");
  const [showBanner, setShowBanner] = useState(false);

  const handleTeleport = () => {
    setShowBanner(true);
    setTimeout(() => setShowBanner(false), 1700);
  };

  return (
    <div className="w-full h-full absolute inset-0 bg-slate-900">
      <Canvas shadows dpr={[1, 2]}>
        <GameScene {...props} setDebug={setDebugText} onTeleport={handleTeleport} />
      </Canvas>

      <div
        className={`absolute top-28 left-1/2 -translate-x-1/2 z-[100] transition-all duration-700 pointer-events-none ${
          showBanner ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-12 scale-90"
        }`}
      >
        <div className="bg-red-600/90 text-white px-10 py-4 rounded-2xl font-bold shadow-[0_0_50px_rgba(220,38,38,0.6)] border-2 border-red-400 backdrop-blur-xl tracking-widest text-xl uppercase italic animate-pulse">
          dead end, try again
        </div>
      </div>

      <div className="absolute bottom-4 left-4 bg-black/80 px-3 py-1 rounded text-[10px] text-cyan-400 font-mono pointer-events-none z-50 border border-cyan-900/50">
        {debugText}
      </div>

      <div className="absolute top-4 right-4 text-xs text-slate-500 font-mono hidden md:block tracking-tighter opacity-40">
        W: Forward | A/D: Turn | NO BACKWARD
      </div>
    </div>
  );
};

export default MazeDisplay;
