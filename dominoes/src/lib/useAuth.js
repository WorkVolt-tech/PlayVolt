import { useState, useEffect } from 'react'
import { db } from './supabase'

export function useAuth() {
  const [user, setUser] = useState(undefined) // undefined = loading
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    let active = true
    let authChanged = false
    db.auth.getSession().then(({ data: { session } }) => {
      if (!active || authChanged) return
      setUser(session?.user ?? null)
    }).catch(() => {
      if (active && !authChanged) setUser(null)
    })

    const { data: { subscription } } = db.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      authChanged = true
      // Auth callbacks run under Supabase's session lock. Only update React
      // state here; the separate effect below loads the profile afterwards.
      setUser(session?.user ?? null)
    })

    return () => { active = false; subscription.unsubscribe() }
  }, [])

  const userId = user?.id
  useEffect(() => {
    let active = true
    setProfile(null)
    if (!userId) return
    db.from('profiles').select('*').eq('id', userId).single()
      .then(({ data }) => { if (active) setProfile(data) })
      .catch(() => { if (active) setProfile(null) })
    return () => { active = false }
  }, [userId])

  async function signOut() {
    await db.auth.signOut()
  }

  return { user, profile, signOut, isGuest: user === null, isLoading: user === undefined }
}
