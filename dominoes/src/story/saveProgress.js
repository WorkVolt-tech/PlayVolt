// A request in flight is not a saved win. Only confirmed writes are cached.
export function createConfirmedSaver(write) {
  const confirmed = new Set()
  const pending = new Map()
  return {
    save(key, args) {
      if (confirmed.has(key)) return Promise.resolve()
      if (pending.has(key)) return pending.get(key)
      const task = Promise.resolve().then(() => write(args)).then(result => {
        if (result?.error) throw result.error
        confirmed.add(key)
      }).finally(() => pending.delete(key))
      pending.set(key, task)
      return task
    },
  }
}
