import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getDb } from "./db";

interface User {
  id: string;
  email: string;
  name: string;
  password: string;
}

function getUsers(): User[] {
  try {
    const db = getDb();
    return db.prepare("SELECT * FROM users").all() as User[];
  } catch {
    return [];
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const users = getUsers();
        const user = users.find((u) => u.email === credentials.email);
        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password as string, user.password);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  pages: {
    signIn: "/qa/login",
  },
  session: {
    strategy: "jwt",
  },
});
