import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import { openedFromResetLink } from '../lib/passwordReset'

// A password-reset link that opens any page of the site goes to "Choose a new password".
export default function ResetWatcher() {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  useEffect(() => {
    const toReset = () => { if (!(pathname === '/auth' && /reset=1/.test(search))) navigate('/auth?reset=1') }
    // wait until the sign-in library has read the link, then go
    if (openedFromResetLink) db.auth.getSession().then(toReset)
    const { data } = db.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') toReset() })
    return () => data.subscription.unsubscribe()
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  return null
}
