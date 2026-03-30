import { randomUUID } from "crypto";
import { getDb } from "./db";

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  fileNames?: string[];
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ConversationMessage[];
}

export function getConversations(userEmail: string): ConversationSummary[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT id, title, updated_at as updatedAt FROM conversations WHERE user_email = ? ORDER BY updated_at DESC LIMIT 50"
    )
    .all(userEmail) as ConversationSummary[];
}

export function getConversation(
  id: string,
  userEmail: string
): Conversation | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, title, created_at as createdAt, updated_at as updatedAt FROM conversations WHERE id = ? AND user_email = ?"
    )
    .get(id, userEmail) as
    | { id: string; title: string; createdAt: string; updatedAt: string }
    | undefined;

  if (!row) return null;

  const messages = db
    .prepare(
      "SELECT role, content, file_names FROM conversation_messages WHERE conversation_id = ? ORDER BY id ASC"
    )
    .all(id) as Array<{
    role: "user" | "assistant";
    content: string;
    file_names: string | null;
  }>;

  return {
    ...row,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.file_names ? {
        fileNames: (() => {
          try {
            const parsed = JSON.parse(m.file_names!);
            return Array.isArray(parsed) ? parsed : [];
          } catch { return []; }
        })(),
      } : {}),
    })),
  };
}

export function createConversation(
  userEmail: string,
  title: string
): { id: string; title: string } {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO conversations (id, user_email, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, userEmail, title, now, now);
  return { id, title };
}

export function saveMessages(
  conversationId: string,
  messages: Array<{ role: string; content: string; fileNames?: string[] }>
): void {
  const db = getDb();
  const now = new Date().toISOString();

  const save = db.transaction(() => {
    db.prepare(
      "DELETE FROM conversation_messages WHERE conversation_id = ?"
    ).run(conversationId);

    const insert = db.prepare(
      "INSERT INTO conversation_messages (conversation_id, role, content, file_names, created_at) VALUES (?, ?, ?, ?, ?)"
    );

    for (const m of messages) {
      insert.run(
        conversationId,
        m.role,
        m.content,
        m.fileNames ? JSON.stringify(m.fileNames) : null,
        now
      );
    }

    db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(
      now,
      conversationId
    );
  });

  save();
}

export function deleteConversation(id: string, userEmail: string): boolean {
  const db = getDb();
  const result = db
    .prepare("DELETE FROM conversations WHERE id = ? AND user_email = ?")
    .run(id, userEmail);
  return result.changes > 0;
}

export function generateTitle(firstMessage: string): string {
  const trimmed = firstMessage.trim();
  if (!trimmed || trimmed === "(attached file)") {
    const date = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return `File upload — ${date}`;
  }
  // Take first line, truncate to 60 chars
  const firstLine = trimmed.split("\n")[0];
  if (firstLine.length <= 60) return firstLine;
  return firstLine.slice(0, 57) + "...";
}
