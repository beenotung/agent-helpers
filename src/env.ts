import { populateEnv } from 'populate-env'

export let env = {
}

populateEnv(env, { auto_load: true, mode: 'halt' })
