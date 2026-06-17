import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";

// Curated, read + draft + create only — no sending email, no deleting.
const COMPOSIO_TOOLS = [
  "GMAIL_FETCH_EMAILS",
  "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID",
  "GMAIL_CREATE_EMAIL_DRAFT",
  "GMAIL_SEARCH_PEOPLE",
  "GOOGLECALENDAR_FIND_EVENT",
  "GOOGLECALENDAR_EVENTS_LIST_ALL_CALENDARS",
  "GOOGLECALENDAR_EVENTS_GET",
  "GOOGLECALENDAR_FREE_BUSY_QUERY",
  "GOOGLECALENDAR_CREATE_EVENT",
];

export const getComposioTools = async () => {
  if (process.env.COMPOSIO_API_KEY && process.env.COMPOSIO_USER_ID) {
    try {
      const composio = new Composio({ provider: new VercelProvider() });
      return composio.tools.get(process.env.COMPOSIO_USER_ID, {
        tools: COMPOSIO_TOOLS,
      });
    } catch (e: any) {
      console.error("Composio tools unavailable:", e.message);
    }
  }
  return {};
};
