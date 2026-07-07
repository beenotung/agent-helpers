import { populateEnv } from 'populate-env'

export let env = {
  PROVIDER_URL: '',
  API_KEY: '',
  MODEL_NAME: '',
}

populateEnv(env, { auto_load: true, mode: 'halt' })
