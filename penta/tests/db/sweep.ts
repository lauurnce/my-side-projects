import { sweepTestUsers } from "./helpers";

export default async function sweepBeforeAndAfter() {
  await sweepTestUsers();
  return sweepTestUsers;
}
