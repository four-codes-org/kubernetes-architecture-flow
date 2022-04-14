const express = require("express");
const router = express.Router();
const event_controller = require("../controller/event_controller");

router.get("/", event_controller.getEvents);

router.post("/create", event_controller.postEvents);

module.exports = router;