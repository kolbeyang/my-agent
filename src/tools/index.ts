import { bash } from "./bash";
import { getComposioTools } from "./composio";
import { readFile, writeFile } from "./files";
import { web_extract, web_search } from "./web";

export const tools = {
  bash,
  readFile,
  writeFile,
  web_search,
  web_extract,
  ...(await getComposioTools()),
};
