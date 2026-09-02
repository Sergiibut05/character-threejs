import Experience from './Experience/Experience.js'
import printConsoleCard from './Experience/Utils/ConsoleCard.js'

// Before the Experience: the console should already say hello by the time the
// first WebGPU warning or asset log shows up underneath it.
printConsoleCard()

const canvas = document.querySelector('canvas.webgl')
const experience = new Experience(canvas)
