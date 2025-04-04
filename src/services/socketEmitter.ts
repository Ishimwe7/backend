import { io } from "../server"; // adjust path to where `io` is defined

export const emitUserUpdate = (userId: string) => {
  io.emit(`user:updated:${userId}`); // emit event specific to this user
};
