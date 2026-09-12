import { useState, useEffect } from 'react'
import { db } from './supabase'

export function useAuth() {
  const [user, setUser] = useState(undefined) // undefined = loading
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    db.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
    })

    const { data: { subscription } } = db.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      else setProfile(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId) {
    const { data } = await db.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
  }

  async function signOut() {
    await db.auth.signOut()
  }

  return { user, profile, signOut, isGuest: user === null, isLoading: user === undefined }
}
