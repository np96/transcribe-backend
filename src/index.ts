import * as http from "http"
import * as fs from "fs"
import * as ffmpeg from "fluent-ffmpeg"
import { getDiffieHellman } from "crypto"
import { getHeapSnapshot } from "v8"

const content = fs.readFileSync(__dirname + '/index.html', 'utf8')

const httpServer = http.createServer((req, res) => {
  // serve the index.html file
  res.setHeader('Content-Type', 'text/html')
  res.setHeader('Content-Length', Buffer.byteLength(content))
  res.end(content)
})

const io: SocketIO.Server = require('socket.io')(httpServer)



let files = new Map<string, Session>()


interface Blob {
  filename: string
  buf: ArrayBuffer
  loops: Array<[number, number]>
}

interface Session {
  blobs: Blob[]
}

interface UploadEvent {
  session: string
  filename: string
  blob: ArrayBuffer
}

interface LoopEvent {
  session: string
  start: number
  duration: number
}

interface SeekEvent {
  session: string
  time: number
}

interface CutEvent {
  session: string
  filename: string
  start: number
  duration: number
}

function fileName(session: string, filename: string) {
  return `./blobs/l${session}_${filename}`

}

io.on('connection', function(socket) {
  socket.on('session', (s: any) => {
    socket.join(s)
    const blob = files.get(s)
    if (blob) {
      socket.emit('upload', blob)
    }
  })
  
  socket.on('upload',  (ev: UploadEvent) => {
    const val: Blob = {
      filename: ev.filename,
      buf: ev.blob,
      loops: []
    }
    let exists = files.get(ev.session)?.blobs.push(val)
    if (exists == undefined) {
      files.set(ev.session, {blobs: [val]})
    }
    io.to(ev.session).emit('upload', ev)
  })

  socket.on('seek', (ev: SeekEvent) => {
    io.to(ev.session).emit('seek', ev)
  })

  socket.on('loop', (ev: LoopEvent) => {
    io.to(ev.session).emit('loop', ev)
  })

  socket.on('cut', async (ev: CutEvent) => {
    const out = fileName(ev.session, `ev.filename_${ev.start}_${ev.duration}`)
    ffmpeg(fileName(ev.session, ev.filename))
      .seekInput(ev.start)
      .duration(ev.duration)
      .output(out)
      .on('end', () => {
        const b = files.get(ev.session)?.blobs.find(b => b.filename == ev.filename)
        b?.loops.push([ev.start, ev.duration])
        io.to(ev.session).emit('cut', ev)
      })
      .run()
  })
  
})