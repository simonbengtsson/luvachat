import { base } from "./context"
import { getActivityForUser } from "./services/activity"

export const getActivity = base.handler(async ({ context }) => {
  return getActivityForUser(context)
})
