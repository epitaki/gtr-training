import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { loadUIFont } from './ui/loadFont'
import { restoreReplayHashBeforeApp } from './auth/oauthCallback'

restoreReplayHashBeforeApp()
const root = document.getElementById('root')!
void loadUIFont().then(() => {
  ReactDOM.createRoot(root).render(<App />)
})
