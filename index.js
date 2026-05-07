require("dotenv").config()

const { Telegraf, Markup } = require("telegraf")
const axios = require("axios")
const fs = require("fs")
const waitingApiInput = {}
let config = require("./config.json")


const bot = new Telegraf(process.env.BOT_TOKEN)

const sessions = {}

async function createMotion(imageUrl, videoUrl) {
  const response = await axios.post(
    "https://api.freepik.com/v1/ai/video/kling-v3-motion-control-std",
    {
      image_url: imageUrl,
      video_url: videoUrl,
      prompt: "cinematic smooth motion",
      character_orientation: "video",
      cfg_scale: 0.5
    },
    {
      headers: {
        "Content-Type": "application/json",
        "x-freepik-api-key": config.freepik_api
      }
    }
  )

  return response.data
}

async function checkTask(taskId) {
  const response = await axios.get(
    `https://api.freepik.com/v1/tasks/${taskId}`,
    {
      headers: {
        "x-freepik-api-key": process.env.FREEPIK_API_KEY
      }
    }
  )

  return response.data
}
bot.command("setapi", async (ctx) => {

  const text = ctx.message.text.split(" ")

  if (!text[1]) {
    return ctx.reply(
      "Contoh:\n/setapi fp_xxxxx"
    )
  }

  const apiKey = text[1]

  config.freepik_api = apiKey

  fs.writeFileSync(
    "./config.json",
    JSON.stringify(config, null, 2)
  )

  ctx.reply(
    "✅ API Freepik berhasil disimpan."
  )
})

bot.start((ctx) => {

  ctx.reply(
    "🎬 MOTION AI BOT\n\nSilakan pilih menu:",
    Markup.keyboard([
      ["🎥 Buat Video"],
      ["🔑 Edit API Key"]
    ])
    .resize()
  )
  

})
bot.hears("🎥 Buat Video", (ctx) => {

  sessions[ctx.from.id] = {}

  ctx.reply(
    "📸 Upload FOTO karakter terlebih dahulu."
  )

})
bot.hears("🔑 Edit API Key", (ctx) => {

  ctx.reply(
    "🔑 MENU API KEY",
    Markup.keyboard([
      ["➕ Set API Key"],
      ["🗑 Hapus API Key"],
      ["👀 Lihat API Key"],
      ["🔙 Kembali"]
    ])
    .resize()
  )

})
bot.hears("🔙 Kembali", (ctx) => {

  ctx.reply(
    "🏠 MENU UTAMA",
    Markup.keyboard([
      ["🎥 Buat Video"],
      ["🔑 Edit API Key"]
    ])
    .resize()
  )

})
bot.hears("➕ Set API Key", (ctx) => {

  waitingApiInput[ctx.from.id] = true

  ctx.reply(
    "Kirim API Key Freepik baru."
  )

})
bot.hears("🗑 Hapus API Key", (ctx) => {

  config.freepik_api = ""

  fs.writeFileSync(
    "./config.json",
    JSON.stringify(config, null, 2)
  )

  ctx.reply(
    "✅ API Key berhasil dihapus."
  )

})
bot.hears("👀 Lihat API Key", (ctx) => {

  if (!config.freepik_api) {
    return ctx.reply(
      "❌ API Key belum diatur."
    )
  }

  const hidden =
    config.freepik_api.slice(0, 8) +
    "********"

  ctx.reply(
    "🔑 API KEY:\n\n" + hidden
  )

})

/*
========================
UPLOAD FOTO
========================
*/

bot.on("photo", async (ctx) => {
  try {
    const photo = ctx.message.photo.pop()

    const file = await ctx.telegram.getFileLink(photo.file_id)

    sessions[ctx.from.id] = {
      image: file.href
    }

    ctx.reply(
      "✅ Foto diterima.\n\nSekarang upload VIDEO gerakan."
    )
  } catch (err) {
    console.log(err)

    ctx.reply("❌ Gagal membaca foto.")
  }
})

bot.on("text", (ctx) => {

  if (!waitingApiInput[ctx.from.id]) return

  const apiKey = ctx.message.text

  config.freepik_api = apiKey

  fs.writeFileSync(
    "./config.json",
    JSON.stringify(config, null, 2)
  )

  waitingApiInput[ctx.from.id] = false

  ctx.reply(
    "✅ API Key berhasil disimpan."
  )

})

/*
========================
UPLOAD VIDEO
========================
*/

bot.on("video", async (ctx) => {
  try {
    if (!sessions[ctx.from.id]?.image) {
      return ctx.reply(
        "⚠️ Upload FOTO terlebih dahulu."
      )
    }

    const video = ctx.message.video

    /*
    VALIDASI DURASI
    */

    if (video.duration > 30) {
      return ctx.reply(
        "⚠️ Video maksimal 30 detik."
      )
    }

    const file = await ctx.telegram.getFileLink(video.file_id)

    ctx.reply(
      "⏳ Generating Motion AI...\nMohon tunggu."
    )

    /*
    GENERATE AI
    */

    const result = await createMotion(
      sessions[ctx.from.id].image,
      file.href
    )

    const taskId =
      result.data?.task_id ||
      result.task_id

    /*
    CHECK STATUS
    */

    const interval = setInterval(async () => {
      try {
        const task = await checkTask(taskId)

        const status =
          task.data?.status ||
          task.status

        /*
        SUCCESS
        */

        if (status === "completed") {
          clearInterval(interval)

          const finalVideo =
            task.data?.generated?.[0] ||
            task.generated?.[0]

          await ctx.replyWithVideo(finalVideo)

          ctx.reply("✅ Motion AI selesai.")

          delete sessions[ctx.from.id]
        }

        /*
        FAILED
        */

        if (status === "failed") {
          clearInterval(interval)

          ctx.reply(
            "❌ Generate gagal.\nCoba gunakan file lain."
          )
        }
      } catch (e) {

  clearInterval(interval)

  console.log(
    e.response?.data || e.message
  )

  const errorMessage =
    e.response?.data?.message ||
    e.response?.data?.detail ||
    e.message ||
    "Unknown Error"

  ctx.reply(
    "❌ TASK ERROR:\n\n" + errorMessage
  )
}
    }, 10000)
  } catch (err) {

  console.log(err.response?.data || err.message)

  const errorMessage =
    err.response?.data?.message ||
    err.response?.data?.detail ||
    err.message ||
    "Unknown error"

  ctx.reply(
    "❌ ERROR FREEPIK:\n\n" + errorMessage
  )
}
})

bot.launch()

console.log("BOT ACTIVE")