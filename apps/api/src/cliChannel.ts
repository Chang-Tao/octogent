// "delivered" alone only means the text reached the terminal; whether the agent
// took it shows up as its prompt-submit acknowledgement.
export const channelMessageStatus = (message: Record<string, unknown>): string => {
  if (typeof message.failed === "string" && message.failed.length > 0) {
    return `failed: ${message.failed}`;
  }
  if (typeof message.acknowledgedAt === "string") {
    return "confirmed";
  }
  return message.delivered === true ? "delivered (unconfirmed)" : "pending";
};

export const formatChannelMessageLine = (message: Record<string, unknown>): string =>
  `  [${message.messageId}] from=${message.fromTerminalId || "(unknown)"} status=${channelMessageStatus(message)}: ${message.content}`;
