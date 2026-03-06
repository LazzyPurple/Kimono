const axios = require("axios");

async function test() {
  try {
    const url = "https://coomer.st/data/e7/b5/e7b52ff5eee34a886d7d89431ebf5beebf110dae1e6b328a4ae676c79a6297cd.mp4";
    console.log("Fetching", url);
    const resp = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 10_000,
      headers: {
        Range: "bytes=0-2097152",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Referer: "https://coomer.st/",
      },
      validateStatus: () => true,
    });
    console.log("Status:", resp.status);
    console.log("Length:", resp.data.length);
  } catch(e) {
    console.error("Error:", e.message);
  }
}
test();
