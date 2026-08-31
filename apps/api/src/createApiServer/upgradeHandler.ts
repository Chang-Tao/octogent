import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";

import { evaluateRemoteAuth } from "./remoteAuth";
import { isAllowedHostHeader, isAllowedOriginHeader, readHeaderValue } from "./security";

type TerminalRuntime = ReturnType<typeof import("../terminalRuntime").createTerminalRuntime>;

type CreateUpgradeHandlerOptions = {
  runtime: TerminalRuntime;
  allowRemoteAccess: boolean;
  accessToken: string | null;
};

export const createUpgradeHandler = ({
  runtime,
  allowRemoteAccess,
  accessToken,
}: CreateUpgradeHandlerOptions) => {
  return (request: IncomingMessage, socket: Socket, head: Buffer) => {
    const originHeader = readHeaderValue(request.headers.origin);
    const hostHeader = readHeaderValue(request.headers.host);
    if (!isAllowedHostHeader(hostHeader, allowRemoteAccess)) {
      socket.destroy();
      return;
    }

    if (!isAllowedOriginHeader(originHeader, allowRemoteAccess)) {
      socket.destroy();
      return;
    }

    const authDecision = evaluateRemoteAuth({
      remoteAddress: request.socket.remoteAddress,
      url: request.url ?? "/",
      headers: {
        "x-octogent-token": request.headers["x-octogent-token"],
        cookie: request.headers.cookie,
      },
      accessToken,
    });
    if (authDecision.kind === "deny") {
      socket.destroy();
      return;
    }

    try {
      if (!runtime.handleUpgrade(request, socket, head)) {
        socket.destroy();
      }
    } catch {
      socket.destroy();
    }
  };
};
