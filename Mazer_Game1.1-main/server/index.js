import http from "http";
import { Server } from "socket.io";

const PORT = process.env.PORT || 3001;

const httpServer = http.createServer();

const io = new Server(httpServer, {
  cors: {
    origin: true, // for dev; later lock to your domain
    methods: ["GET", "POST"],
  },
});

/**
 * Room shape:
 * rooms[roomId] = {
 *   id,
 *   size,
 *   seed,
 *   hostSocketId,
 *   players: { [socketId]: { id, name, row, col, yaw } }
 * }
 */
const rooms = new Map();

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function snapshotRoom(room) {
  return {
    id: room.id,
    size: room.size,
    seed: room.seed,
    hostId: room.hostSocketId,
    players: Object.values(room.players),
  };
}

io.on("connection", (socket) => {
  socket.on("room:create", ({ name, size = 15 } = {}, cb) => {
    const roomId = makeRoomCode();
    const seed = Math.floor(Math.random() * 1_000_000_000);

    const room = {
      id: roomId,
      size,
      seed,
      hostSocketId: socket.id,
      players: {},
    };

    room.players[socket.id] = {
      id: socket.id,
      name: name || "Player",
      row: 1,
      col: 1,
      yaw: -Math.PI / 2,
    };

    rooms.set(roomId, room);
    socket.join(roomId);

    cb?.({ ok: true, room: snapshotRoom(room), yourId: socket.id });
    io.to(roomId).emit("room:state", snapshotRoom(room));
  });

  socket.on("room:join", ({ roomId, name } = {}, cb) => {
    const room = rooms.get(roomId);
    if (!room) {
      cb?.({ ok: false, error: "Room not found." });
      return;
    }

    room.players[socket.id] = {
      id: socket.id,
      name: name || "Player",
      row: 1,
      col: 1,
      yaw: -Math.PI / 2,
    };

    socket.join(roomId);

    cb?.({ ok: true, room: snapshotRoom(room), yourId: socket.id });
    io.to(roomId).emit("room:state", snapshotRoom(room));
  });

  // MVP: clients send their state; server rebroadcasts
  socket.on("player:update", ({ roomId, row, col, yaw } = {}) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const p = room.players[socket.id];
    if (!p) return;

    p.row = row;
    p.col = col;
    p.yaw = yaw;

    io.to(roomId).emit("room:state", snapshotRoom(room));
  });

  socket.on("disconnect", () => {
    // remove player from any rooms they were in
    for (const [roomId, room] of rooms.entries()) {
      if (room.players[socket.id]) {
        delete room.players[socket.id];

        // if host left, pick a new host or delete room
        if (room.hostSocketId === socket.id) {
          const remainingIds = Object.keys(room.players);
          if (remainingIds.length === 0) {
            rooms.delete(roomId);
            continue;
          } else {
            room.hostSocketId = remainingIds[0];
          }
        }

        io.to(roomId).emit("room:state", snapshotRoom(room));
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] Socket.IO running on :${PORT}`);
});
