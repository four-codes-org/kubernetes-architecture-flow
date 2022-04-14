const Sequelize = require("sequelize");
const sequelize = require("../config/db");

const event_datas = sequelize.define("event_datas", {
  uuid: {
    type: Sequelize.UUID,
    defaultValue: Sequelize.UUIDV4,
    allowNull: false,
    primaryKey: true,
  },
  event_details: { type: Sequelize.JSON, allowNull: false },
});

module.exports = event_datas;
