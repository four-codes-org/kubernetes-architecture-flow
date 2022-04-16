const event_table = require("../models/event_table");

const postEvents = (req, res) => {
  const event_details = req.body;
  var dataObject = JSON.parse(JSON.stringify({ event_details }));
  let events = event_table.create(dataObject);
  events
    .then((data) => res.send(data))
    .catch((err) => {
      res.status(500).send(
        JSON.stringify({
          message: err,
        })
      );
    });
};

const getEvents = async (req, res) => {
  await event_table
    .findAll({ order: [["createdAt", "DESC"]] })
    .then((result) => {
      res.send(result);
    })
    .catch((error) => {
      res.status(500).send(
        JSON.stringify({
          message:
            error.message || "Some error occurred while retrieving event."
        })
      );
    });
};

module.exports = {
  postEvents,
  getEvents,
};
