import { redirect } from 'next/navigation'
import { COURSE_DOOR_PATH } from '@/lib/public-site/course-door-page'

/** The free training door's earlier address. It lives at /start now. */
export default function FreeTrainingDoorMoved() {
  redirect(COURSE_DOOR_PATH)
}
