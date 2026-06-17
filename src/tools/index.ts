import { bash } from "./bash";
import { getComposioTools } from "./composio";
import { readFile, writeFile } from "./files";
import { tavily_search } from "./tavily";

// The agent's full toolset: built-ins plus any connected Composio (Gmail/Calendar)
// tools. Composio is fetched once at module load.
export const tools = {
  bash,
  readFile,
  writeFile,
  tavily_search,
  ...(await getComposioTools()),
};
