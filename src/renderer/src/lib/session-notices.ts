/** An in-app notice pushed by main for one session (`session:notice`). */
export interface Notice {
  id: string
  title: string
  body: string
  /** Changes on every push, so a replaced notice restarts its dismiss timer. */
  key: number
}

/** Keep one notice per session: a newer one replaces the old in place (NOTF-22). */
export function upsertNotice(list: Notice[], notice: Notice): Notice[] {
  return list.some((n) => n.id === notice.id)
    ? list.map((n) => (n.id === notice.id ? notice : n))
    : [...list, notice]
}

export function dropNotice(list: Notice[], id: string): Notice[] {
  return list.filter((n) => n.id !== id)
}
