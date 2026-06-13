import { config } from "../config.js";
import { allTools, publicFitTool } from "./schemas.js";

export const tools = config.mcpPublicTools === "all" ? allTools : [publicFitTool];
