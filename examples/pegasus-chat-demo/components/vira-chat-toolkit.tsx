"use client";

import { defineToolkit } from "@assistant-ui/react";
import { viraChatToolkit as reservationToolkit } from "./vira-chat-connector";
import guidanceToolkit from "./vira-guidance-toolkit";

export const viraChatToolkit = defineToolkit({
  ...reservationToolkit,
  ...guidanceToolkit,
});
