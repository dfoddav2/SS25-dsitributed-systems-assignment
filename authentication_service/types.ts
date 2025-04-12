export enum UserRole {
  ADMIN = "administrator",
  AGENT = "agent",
  SECRETARY = "secretary",
}

export type User = {
  id: number;
  username: string;
  password: string;
  role: UserRole;
};