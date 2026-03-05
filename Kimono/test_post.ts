import axios from "axios";

async function testLike() {
  try {
    const res = await axios.post("http://localhost:3000/api/likes/posts", {
      site: "kemono",
      service: "fanbox",
      postId: "7143528"
    });
    console.log("Success:", res.status);
  } catch (err: any) {
    console.log("Failed:", err.response?.status, err.response?.data);
  }
}
testLike();
