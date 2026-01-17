import './threejs-override.js'
import { Game } from './Game/Game.js'
import consoleLog from './data/consoleLog.js'

console.log(
    ...consoleLog
)

if(import.meta.env.VITE_GAME_PUBLIC)
    window.game = new Game()
else
    new Game()