/**
 * The grant a session page declares, optionally, when it reports whether it lays itself across the
 * side strip (the iPhone Duo's status column). The shell then keeps its own rail content, such as
 * usage rings, off the strip only while the page is drawn there.
 */
export const BRIDGE_SIDE_STRIP_COVER_GRANT = 'sideStripCover'

/** Page to shell, a notify on that grant: whole state, sent on change and again on each `init`. */
export const BRIDGE_SIDE_STRIP_COVER_NOTIFY = 'side-strip-cover'
